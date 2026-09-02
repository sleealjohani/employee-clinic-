"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { Prisma, User } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  requirePermission,
  requireUser,
  type CurrentUser,
} from "@/lib/auth/current-user";
import {
  generateTempPassword,
  hashPassword,
  verifyPassword,
} from "@/lib/auth/password";
import { generateTotpSecret, totpQrDataUrl, verifyTotp } from "@/lib/auth/totp";
import {
  SESSION_COOKIE,
  signSession,
  sessionCookieOptions,
  IDLE_MINUTES,
} from "@/lib/auth/session";
import { userSchema, formToObject } from "@/lib/validation";
import { ClinicError, actionError } from "@/lib/action-result";
import type { ActionState } from "./employees";
export type UserState = ActionState & { tempPassword?: string };
async function manage(
  work: (
    tx: Prisma.TransactionClient,
    admin: CurrentUser,
  ) => Promise<UserState>,
): Promise<UserState> {
  const admin = await requirePermission("users.manage");
  try {
    const result = await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('clinic-users'))`;
        const actor = await tx.user.findUnique({
          where: { id: admin.id },
          select: { role: true, isActive: true },
        });
        if (!actor?.isActive || actor.role !== "ADMIN")
          throw new ClinicError("v2.denied");
        return work(tx, admin);
      },
      { timeout: 15000 },
    );
    revalidatePath("/users");
    return result;
  } catch (e) {
    return actionError(e);
  }
}
async function otherUser(
  tx: Prisma.TransactionClient,
  admin: CurrentUser,
  id: string,
) {
  if (!id || id === admin.id) throw new ClinicError("user.selfEditBlocked");
  const user = await tx.user.findUnique({ where: { id } });
  if (!user) throw new ClinicError("v2.invalid");
  return user;
}
async function keepAdmin(tx: Prisma.TransactionClient, user: User) {
  if (
    user.role === "ADMIN" &&
    user.isActive &&
    (await tx.user.count({ where: { role: "ADMIN", isActive: true } })) <= 1
  )
    throw new ClinicError("user.selfEditBlocked");
}
export async function createUserAction(
  _prev: UserState,
  form: FormData,
): Promise<UserState> {
  const parsed = userSchema.safeParse(formToObject(form));
  if (!parsed.success) return { error: "v2.invalid" };
  return manage(async (tx, admin) => {
    const employeeId =
      parsed.data.role === "EMPLOYEE" ? parsed.data.employeeId : null;
    if (parsed.data.role === "EMPLOYEE") {
      if (
        !employeeId ||
        !(await tx.employee.findFirst({
          where: {
            id: employeeId,
            isArchived: false,
            employmentStatus: { in: ["ACTIVE", "ON_LEAVE"] },
          },
        }))
      )
        throw new ClinicError("v2.invalid");
      if (await tx.user.findUnique({ where: { employeeId } }))
        throw new ClinicError("v2.accountLinked");
    }
    const tempPassword = generateTempPassword();
    const user = await tx.user.create({
      data: {
        username: parsed.data.username,
        name: parsed.data.name,
        email: parsed.data.email || null,
        role: parsed.data.role,
        employeeId,
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: parsed.data.role !== "EMPLOYEE",
      },
    });
    await writeAudit(
      {
        user: admin,
        action: "USER_MANAGE",
        entity: "User",
        entityId: user.id,
        summary: "إنشاء حساب مستخدم",
        meta: { role: user.role, employeeId },
      },
      tx,
    );
    return { ok: true, ...(user.role === "EMPLOYEE" ? {} : { tempPassword }) };
  });
}
export async function updateUserRoleAction(
  _prev: UserState,
  form: FormData,
): Promise<UserState> {
  const id = String(form.get("id") || ""),
    role = String(form.get("role") || "");
  if (!["ADMIN", "STAFF", "VIEWER", "EMPLOYEE"].includes(role))
    return { error: "v2.invalid" };
  return manage(async (tx, admin) => {
    const current = await otherUser(tx, admin, id);
    if (role !== "ADMIN") await keepAdmin(tx, current);
    if (
      role === "EMPLOYEE" &&
      (!current.employeeId ||
        !(await tx.employee.findFirst({
          where: {
            id: current.employeeId,
            isArchived: false,
            employmentStatus: { not: "TERMINATED" },
          },
        })))
    )
      throw new ClinicError("v2.invalid");
    await tx.user.update({
      where: { id },
      data: { role: role as User["role"], tokenVersion: { increment: 1 } },
    });
    await writeAudit(
      {
        user: admin,
        action: "USER_MANAGE",
        entity: "User",
        entityId: id,
        summary: "تحديث صلاحيات مستخدم",
        meta: { from: current.role, to: role },
      },
      tx,
    );
    return { ok: true };
  });
}
export async function toggleUserActiveAction(
  _prev: UserState,
  form: FormData,
): Promise<UserState> {
  return manage(async (tx, admin) => {
    const user = await otherUser(tx, admin, String(form.get("id") || ""));
    if (user.isActive) await keepAdmin(tx, user);
    if (
      !user.isActive &&
      user.role === "EMPLOYEE" &&
      (!user.employeeId ||
        !(await tx.employee.findFirst({
          where: {
            id: user.employeeId,
            isArchived: false,
            employmentStatus: { not: "TERMINATED" },
          },
        })))
    )
      throw new ClinicError("v2.invalid");
    await tx.user.update({
      where: { id: user.id },
      data: { isActive: !user.isActive, tokenVersion: { increment: 1 } },
    });
    await writeAudit(
      {
        user: admin,
        action: "USER_MANAGE",
        entity: "User",
        entityId: user.id,
        summary: user.isActive ? "تعطيل حساب مستخدم" : "تفعيل حساب مستخدم",
      },
      tx,
    );
    return { ok: true };
  });
}
export async function resetUserPasswordAction(
  _prev: UserState,
  form: FormData,
): Promise<UserState> {
  return manage(async (tx, admin) => {
    const user = await otherUser(tx, admin, String(form.get("id") || ""));
    if (user.role === "EMPLOYEE") throw new ClinicError("auth.employeeUseId");
    const tempPassword = generateTempPassword();
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: true,
        failedAttempts: 0,
        lockedUntil: null,
        tokenVersion: { increment: 1 },
      },
    });
    await writeAudit(
      {
        user: admin,
        action: "USER_MANAGE",
        entity: "User",
        entityId: user.id,
        summary: "إعادة تعيين كلمة مرور مستخدم",
      },
      tx,
    );
    return { ok: true, tempPassword };
  });
}
export async function clearUserTotpAction(
  _prev: UserState,
  form: FormData,
): Promise<UserState> {
  return manage(async (tx, admin) => {
    const user = await otherUser(tx, admin, String(form.get("id") || ""));
    await tx.user.update({
      where: { id: user.id },
      data: {
        totpEnabled: false,
        totpSecret: null,
        pendingTotpSecret: null,
        pendingTotpExpiresAt: null,
        tokenVersion: { increment: 1 },
      },
    });
    await writeAudit(
      {
        user: admin,
        action: "TWO_FACTOR",
        entity: "User",
        entityId: user.id,
        summary: "استعادة الوصول بإلغاء جهاز التحقق الثنائي",
      },
      tx,
    );
    return { ok: true };
  });
}
// ---------------------------------------------------------------- own account

export type TotpSetup = { secret: string; qr: string };

export async function beginTotpSetup(
  password: string,
): Promise<TotpSetup | { error: string }> {
  const user = await requireUser();
  if (user.role === "EMPLOYEE") return { error: "auth.employeeUseId" };
  const record = await db.user.findUnique({ where: { id: user.id } });
  if (
    !record ||
    record.totpEnabled ||
    !(await verifyPassword(password, record.passwordHash))
  )
    return { error: "auth.invalid" };
  const secret = generateTotpSecret();
  await db.user.update({
    where: { id: user.id },
    data: {
      pendingTotpSecret: secret,
      pendingTotpExpiresAt: new Date(Date.now() + 10 * 60000),
    },
  });
  return { secret, qr: await totpQrDataUrl(user.username, secret) };
}

export async function confirmTotpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const current = await requireUser();
  if (current.role === "EMPLOYEE") return { error: "auth.employeeUseId" };
  const code = String(formData.get("code") ?? "");

  const record = await db.user.findUnique({ where: { id: current.id } });
  if (
    !record?.pendingTotpSecret ||
    !record.pendingTotpExpiresAt ||
    record.pendingTotpExpiresAt < new Date() ||
    record.totpEnabled
  )
    return { error: "common.error" };
  if (record.lockedUntil && record.lockedUntil > new Date())
    return { error: "auth.locked" };
  if (!verifyTotp(code, record.pendingTotpSecret)) {
    const failed = await db.user.update({
      where: { id: current.id },
      data: { failedAttempts: { increment: 1 } },
    });
    if (failed.failedAttempts >= 5)
      await db.user.update({
        where: { id: current.id },
        data: { lockedUntil: new Date(Date.now() + 15 * 60000) },
      });
    return { error: "auth.invalidOtp" };
  }

  const secured = await db.user.update({
    where: { id: current.id },
    data: {
      totpEnabled: true,
      totpSecret: record.pendingTotpSecret,
      pendingTotpSecret: null,
      pendingTotpExpiresAt: null,
      failedAttempts: 0,
      lockedUntil: null,
      tokenVersion: { increment: 1 },
    },
  });
  const sessionStore = await cookies();
  sessionStore.set(
    SESSION_COOKIE,
    await signSession({
      sub: secured.id,
      username: secured.username,
      name: secured.name,
      role: secured.role,
      ver: secured.tokenVersion,
    }),
    sessionCookieOptions(IDLE_MINUTES * 60),
  );

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

export async function disableTotpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const current = await requireUser();
  if (current.role === "EMPLOYEE") return { error: "auth.employeeUseId" };
  const password = String(formData.get("password") ?? "");

  const record = await db.user.findUnique({ where: { id: current.id } });
  if (!record) return { error: "common.error" };
  // Disabling a second factor requires the first one.
  if (!(await verifyPassword(password, record.passwordHash)))
    return { error: "auth.invalid" };

  const unsecured = await db.user.update({
    where: { id: current.id },
    data: {
      totpEnabled: false,
      totpSecret: null,
      pendingTotpSecret: null,
      pendingTotpExpiresAt: null,
      tokenVersion: { increment: 1 },
    },
  });
  const sessionStore = await cookies();
  sessionStore.set(
    SESSION_COOKIE,
    await signSession({
      sub: unsecured.id,
      username: unsecured.username,
      name: unsecured.name,
      role: unsecured.role,
      ver: unsecured.tokenVersion,
    }),
    sessionCookieOptions(IDLE_MINUTES * 60),
  );

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
