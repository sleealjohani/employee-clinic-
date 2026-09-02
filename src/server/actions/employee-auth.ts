"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { requestContext } from "@/lib/auth/current-user";
import { hashPassword } from "@/lib/auth/password";
import {
  employeeAccessAllowed,
  employeeLoginId,
  employeeReturnPath,
} from "@/lib/auth/employee-access";
import {
  IDLE_MINUTES,
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
} from "@/lib/auth/session";

export type EmployeeLoginState = { error?: string };

/**
 * Owner-approved ID-only access. An ID is NOT proof of identity.
 * Never share this entry point with the clinic's privileged password login.
 * No employee/clinical records are created here, only a scoped portal account.
 */
export async function employeeLoginAction(
  _prev: EmployeeLoginState,
  form: FormData,
): Promise<EmployeeLoginState> {
  const nationalId = employeeLoginId(String(form.get("nationalId") ?? ""));
  const next = String(form.get("next") ?? "").trim();
  const { ip } = await requestContext();
  let result;
  try {
    result = await db.$transaction(
      async (tx) => {
        // Serialize provisioning and authorization with admin account management.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('clinic-users'))`;
        const failed = await tx.auditLog.count({
          where: {
            action: "LOGIN_FAILED",
            ip,
            at: { gte: new Date(Date.now() - 15 * 60000) },
            meta: { path: ["method"], equals: "NATIONAL_ID" },
          },
        });
        if (failed >= 30) return { error: "auth.employeeRateLimit" };
        const employee = nationalId
          ? await tx.employee.findUnique({
              where: { nationalId },
              include: { account: true },
            })
          : null;
        const account = employee?.account;
        if (
          !employee ||
          !employeeAccessAllowed(employee) ||
          (account &&
            (account.role !== "EMPLOYEE" ||
              !account.isActive ||
              (account.lockedUntil && account.lockedUntil > new Date())))
        ) {
          // Identical response for unknown, disabled, archived and privileged accounts.
          // Never put the submitted national ID in logs or action response state.
          await writeAudit(
            {
              userName: "Employee ID sign-in",
              action: "LOGIN_FAILED",
              entity: "User",
              summary: "تعذر الدخول إلى بوابة الموظف برقم الهوية",
              meta: { method: "NATIONAL_ID" },
            },
            tx,
          );
          return { error: "auth.employeeInvalid" };
        }
        const user = account
          ? await tx.user.update({
              where: { id: account.id },
              data: {
                lastLoginAt: new Date(),
                failedAttempts: 0,
                lockedUntil: null,
                mustChangePassword: false,
              },
            })
          : await tx.user.create({
              data: {
                username: `emp.${randomUUID()}`,
                name: employee.name,
                employeeId: employee.id,
                role: "EMPLOYEE",
                // Never derive passwords from an ID. Promotion needs an admin reset.
                passwordHash: await hashPassword(
                  randomBytes(32).toString("hex"),
                ),
                mustChangePassword: false,
                lastLoginAt: new Date(),
              },
            });
        if (!account)
          await writeAudit(
            {
              user: { id: user.id, name: user.name },
              action: "USER_MANAGE",
              entity: "User",
              entityId: user.id,
              summary: "إنشاء حساب بوابة لموظف مسجل عند الدخول برقم الهوية",
              meta: {
                method: "NATIONAL_ID",
                employeeId: employee.id,
                role: "EMPLOYEE",
              },
            },
            tx,
          );
        await writeAudit(
          {
            user: { id: user.id, name: user.name },
            action: "LOGIN",
            entity: "User",
            entityId: user.id,
            summary: "دخول برقم الهوية فقط — دون تحقق مستقل من هوية المستخدم",
            meta: { method: "NATIONAL_ID", identityVerified: false },
          },
          tx,
        );
        // Configuration errors roll back account provisioning too.
        return {
          token: await signSession({
            sub: user.id,
            username: user.username,
            name: user.name,
            role: "EMPLOYEE",
            ver: user.tokenVersion,
          }),
        };
      },
      { timeout: 15000 },
    );
  } catch {
    return { error: "common.error" };
  }
  if ("error" in result) return { error: result.error };
  const store = await cookies();
  store.set(
    SESSION_COOKIE,
    result.token,
    sessionCookieOptions(IDLE_MINUTES * 60),
  );
  redirect(employeeReturnPath(next));
}
