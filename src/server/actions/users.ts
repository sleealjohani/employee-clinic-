"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { requirePermission, requireUser } from "@/lib/auth/current-user";
import { generateTempPassword, hashPassword, verifyPassword } from "@/lib/auth/password";
import { generateTotpSecret, totpQrDataUrl, verifyTotp } from "@/lib/auth/totp";
import { SESSION_COOKIE, signSession, sessionCookieOptions, IDLE_MINUTES } from "@/lib/auth/session";
import { userSchema, formToObject } from "@/lib/validation";
import type { ActionState } from "./employees";

export type UserState = ActionState & { tempPassword?: string };

export async function createUserAction(_prev: UserState, formData: FormData): Promise<UserState> {
  const admin = await requirePermission("users.manage");
  const parsed = userSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { error: "common.error" };

  const existing = await db.user.findUnique({ where: { username: parsed.data.username } });
  if (existing) return { error: "common.error" };

  const tempPassword = generateTempPassword();
  const user = await db.user.create({
    data: {
      username: parsed.data.username,
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      role: parsed.data.role,
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
    },
  });

  await writeAudit({
    user: admin,
    action: "USER_MANAGE",
    entity: "User",
    entityId: user.id,
    summary: `إنشاء مستخدم ${user.username} بدور ${user.role}`,
  });

  revalidatePath("/users");
  // Returned once, shown once — it is never stored in readable form.
  return { ok: true, tempPassword };
}

export async function updateUserRoleAction(_prev: UserState, formData: FormData): Promise<UserState> {
  const admin = await requirePermission("users.manage");
  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!id || !["ADMIN", "STAFF", "VIEWER"].includes(role)) return { error: "common.error" };
  if (id === admin.id) return { error: "user.selfEditBlocked" };

  const user = await db.user.update({
    where: { id },
    data: { role: role as "ADMIN" | "STAFF" | "VIEWER", tokenVersion: { increment: 1 } },
  });

  await writeAudit({
    user: admin,
    action: "USER_MANAGE",
    entity: "User",
    entityId: id,
    summary: `تغيير دور ${user.username} إلى ${role}`,
  });

  revalidatePath("/users");
  return { ok: true };
}

export async function toggleUserActiveAction(_prev: UserState, formData: FormData): Promise<UserState> {
  const admin = await requirePermission("users.manage");
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "common.error" };
  if (id === admin.id) return { error: "user.selfEditBlocked" };

  const current = await db.user.findUnique({ where: { id } });
  if (!current) return { error: "common.error" };

  const user = await db.user.update({
    where: { id },
    data: { isActive: !current.isActive, tokenVersion: { increment: 1 } },
  });

  await writeAudit({
    user: admin,
    action: "USER_MANAGE",
    entity: "User",
    entityId: id,
    summary: `${user.isActive ? "تفعيل" : "تعطيل"} حساب ${user.username}`,
  });

  revalidatePath("/users");
  return { ok: true };
}

export async function resetUserPasswordAction(_prev: UserState, formData: FormData): Promise<UserState> {
  const admin = await requirePermission("users.manage");
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "common.error" };

  const tempPassword = generateTempPassword();
  const user = await db.user.update({
    where: { id },
    data: {
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
      tokenVersion: { increment: 1 },
    },
  });

  await writeAudit({
    user: admin,
    action: "USER_MANAGE",
    entity: "User",
    entityId: id,
    summary: `إعادة تعيين كلمة مرور ${user.username}`,
  });

  revalidatePath("/users");
  return { ok: true, tempPassword };
}

/** Recovery path: an administrator can clear another user's lost authenticator. */
export async function clearUserTotpAction(_prev: UserState, formData: FormData): Promise<UserState> {
  const admin = await requirePermission("users.manage");
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "common.error" };

  const user = await db.user.update({
    where: { id },
    data: { totpEnabled: false, totpSecret: null, tokenVersion: { increment: 1 } },
  });

  await writeAudit({
    user: admin,
    action: "TWO_FACTOR",
    entity: "User",
    entityId: id,
    summary: `إلغاء التحقق الثنائي لحساب ${user.username}`,
  });

  revalidatePath("/users");
  return { ok: true };
}

// ---------------------------------------------------------------- own account

export type TotpSetup = { secret: string; qr: string };

export async function beginTotpSetup(): Promise<TotpSetup> {
  const user = await requireUser();
  const secret = generateTotpSecret();
  await db.user.update({ where: { id: user.id }, data: { totpSecret: secret, totpEnabled: false } });
  return { secret, qr: await totpQrDataUrl(user.username, secret) };
}

export async function confirmTotpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const current = await requireUser();
  const code = String(formData.get("code") ?? "");

  const record = await db.user.findUnique({ where: { id: current.id } });
  if (!record?.totpSecret) return { error: "common.error" };
  if (!verifyTotp(code, record.totpSecret)) return { error: "auth.invalidOtp" };

  await db.user.update({ where: { id: current.id }, data: { totpEnabled: true } });

  await writeAudit({
    user: current,
    action: "TWO_FACTOR",
    entity: "User",
    entityId: current.id,
    summary: "تفعيل التحقق الثنائي",
  });

  revalidatePath("/account");
  return { ok: true };
}

export async function disableTotpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const current = await requireUser();
  const password = String(formData.get("password") ?? "");

  const record = await db.user.findUnique({ where: { id: current.id } });
  if (!record) return { error: "common.error" };
  // Disabling a second factor requires the first one.
  if (!(await verifyPassword(password, record.passwordHash))) return { error: "auth.invalid" };

  await db.user.update({
    where: { id: current.id },
    data: { totpEnabled: false, totpSecret: null },
  });

  await writeAudit({
    user: current,
    action: "TWO_FACTOR",
    entity: "User",
    entityId: current.id,
    summary: "إلغاء التحقق الثنائي",
  });

  revalidatePath("/account");
  return { ok: true };
}

/** Signs every other device out of this account. */
export async function revokeOtherSessionsAction(): Promise<ActionState> {
  const current = await requireUser();
  const user = await db.user.update({
    where: { id: current.id },
    data: { tokenVersion: { increment: 1 } },
  });

  const token = await signSession({
    sub: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    ver: user.tokenVersion,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions(IDLE_MINUTES * 60));

  await writeAudit({
    user: current,
    action: "USER_MANAGE",
    entity: "User",
    entityId: current.id,
    summary: "إنهاء كل الجلسات الأخرى",
  });

  revalidatePath("/account");
  return { ok: true };
}
