"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  hashPassword,
  verifyPassword,
  passwordIsStrong,
  LOCKOUT_THRESHOLD,
  LOCKOUT_MINUTES,
} from "@/lib/auth/password";
import {
  SESSION_COOKIE,
  signSession,
  sessionCookieOptions,
  verifySession,
  IDLE_MINUTES,
} from "@/lib/auth/session";
import { verifyTotp } from "@/lib/auth/totp";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canOpenPath } from "@/lib/auth/rbac";

export type LoginState = {
  error?: string;
  needsOtp?: boolean;
  username?: string;
};

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const otp = String(formData.get("otp") ?? "").trim();
  const next = String(formData.get("next") ?? "").trim();

  if (
    !/^[a-z0-9._-]{3,40}$/.test(username) ||
    !password ||
    password.length > 128 ||
    otp.length > 8
  )
    return { error: "auth.invalid", username };

  const user = await db.user.findUnique({ where: { username } });

  // The same generic message whether or not the account exists.
  if (!user) {
    await writeAudit({
      userName: username,
      action: "LOGIN_FAILED",
      entity: "User",
      summary: `محاولة دخول باسم مستخدم غير موجود: ${username}`,
    });
    return { error: "auth.invalid", username };
  }

  if (!user.isActive) return { error: "auth.disabled", username };
  if (user.role === "EMPLOYEE") {
    const employee = user.employeeId
      ? await db.employee.findUnique({
          where: { id: user.employeeId },
          select: { isArchived: true, employmentStatus: true },
        })
      : null;
    if (
      !employee ||
      employee.isArchived ||
      employee.employmentStatus === "TERMINATED"
    )
      return { error: "auth.disabled", username };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: "auth.locked", username };
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = await db.user.update({
      where: { id: user.id },
      data: { failedAttempts: { increment: 1 } },
    });
    const attempts = failed.failedAttempts;
    if (attempts >= LOCKOUT_THRESHOLD)
      await db.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60000) },
      });
    await writeAudit({
      user: { id: user.id, name: user.name },
      action: "LOGIN_FAILED",
      entity: "User",
      entityId: user.id,
      summary: `كلمة مرور خاطئة (المحاولة ${attempts})`,
    });
    return {
      error: attempts >= LOCKOUT_THRESHOLD ? "auth.locked" : "auth.invalid",
      username,
    };
  }

  if (user.totpEnabled && !user.totpSecret)
    return { error: "auth.invalid", username };
  if (user.totpEnabled && user.totpSecret) {
    if (!otp) return { needsOtp: true, username };
    if (!verifyTotp(otp, user.totpSecret)) {
      const failed = await db.user.update({
        where: { id: user.id },
        data: { failedAttempts: { increment: 1 } },
      });
      if (failed.failedAttempts >= LOCKOUT_THRESHOLD)
        await db.user.update({
          where: { id: user.id },
          data: { lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60000) },
        });
      await writeAudit({
        user: { id: user.id, name: user.name },
        action: "LOGIN_FAILED",
        entity: "User",
        entityId: user.id,
        summary: "رمز تحقق ثنائي خاطئ",
      });
      return { needsOtp: true, error: "auth.invalidOtp", username };
    }
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
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
    user: { id: user.id, name: user.name },
    action: "LOGIN",
    entity: "User",
    entityId: user.id,
    summary: "تسجيل دخول ناجح",
  });

  redirect(
    user.mustChangePassword
      ? "/account/password"
      : next.startsWith("/") &&
          !next.startsWith("//") &&
          !next.includes("\\") &&
          canOpenPath(user.role, next.split("?")[0])
        ? next
        : user.role === "EMPLOYEE"
          ? "/portal"
          : "/dashboard",
  );
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    await writeAudit({
      user,
      action: "LOGOUT",
      entity: "User",
      entityId: user.id,
      summary: "تسجيل خروج",
    });
  }
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

export type PasswordState = { error?: string };

export async function changePasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const store = await cookies();
  const claims = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!claims) redirect("/login");
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next !== confirm) return { error: "auth.passwordMismatch" };
  if (!passwordIsStrong(next)) return { error: "auth.passwordWeak" };

  const user = await db.user.findUnique({ where: { id: claims.sub } });
  if (!user) redirect("/login");

  if (!(await verifyPassword(current, user.passwordHash)))
    return { error: "auth.invalid" };

  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(next),
      mustChangePassword: false,
      // Invalidate every other session opened with the old password.
      tokenVersion: { increment: 1 },
    },
  });

  const token = await signSession({
    sub: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    ver: updated.tokenVersion,
  });
  store.set(SESSION_COOKIE, token, sessionCookieOptions(IDLE_MINUTES * 60));

  await writeAudit({
    user: { id: user.id, name: user.name },
    action: "PASSWORD_CHANGE",
    entity: "User",
    entityId: user.id,
    summary: "تغيير كلمة المرور",
  });

  redirect(user.role === "EMPLOYEE" ? "/portal" : "/dashboard");
}

export type SetupState = { error?: string };

export async function setupAction(
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  try {
    if ((await db.user.count()) > 0) return { error: "setup.closed" };
  } catch (error) {
    console.error("[setup] failed to check existing users", error);
    return { error: "common.error" };
  }

  const expected = process.env.SETUP_TOKEN;
  if (!expected || String(formData.get("token") ?? "") !== expected)
    return { error: "setup.badToken" };

  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username))
    return { error: "common.error" };
  if (name.length < 2) return { error: "common.error" };
  if (!passwordIsStrong(password)) return { error: "auth.passwordWeak" };

  let user;
  try {
    const passwordHash = await hashPassword(password);
    user = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('clinic-bootstrap'))`;
      if (await tx.user.count()) throw new Error("setup.closed");
      return tx.user.create({
        data: { username, name, role: "ADMIN", passwordHash },
      });
    });
  } catch (error) {
    console.error("[setup] failed to create first administrator", error);
    return { error: "common.error" };
  }

  await writeAudit({
    user: { id: user.id, name: user.name },
    action: "USER_MANAGE",
    entity: "User",
    entityId: user.id,
    summary: "إنشاء حساب المسؤول الأول عبر التهيئة",
  });

  redirect("/login?setup=done");
}
