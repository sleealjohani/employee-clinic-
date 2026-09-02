import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { requestContext, type CurrentUser } from "@/lib/auth/current-user";

export type AuditAction =
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "CREATE"
  | "UPDATE"
  | "ARCHIVE"
  | "RESTORE"
  | "VOID"
  | "VIEW_SENSITIVE"
  | "EXPORT"
  | "IMPORT_UPLOAD"
  | "IMPORT_EXTRACT"
  | "IMPORT_COMMIT"
  | "CRITICAL_NOTIFY"
  | "REVIEW"
  | "USER_MANAGE"
  | "PASSWORD_CHANGE"
  | "TWO_FACTOR";

/**
 * Append-only. There is deliberately no update or delete path for AuditLog
 * anywhere in this codebase — not even for an administrator.
 */
export async function writeAudit(
  input: {
    user?: Pick<CurrentUser, "id" | "name"> | null;
    userName?: string;
    action: AuditAction;
    entity: string;
    entityId?: string | null;
    summary: string;
    meta?: Record<string, unknown>;
  },
  client: Prisma.TransactionClient = db,
): Promise<void> {
  const ctx = await requestContext();
  await client.auditLog.create({
    data: {
      userId: input.user?.id ?? null,
      userName: input.user?.name ?? input.userName ?? "—",
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      summary: input.summary,
      meta: input.meta ? JSON.parse(JSON.stringify(input.meta)) : undefined,
      ip: ctx.ip,
      userAgent: ctx.userAgent?.slice(0, 300) ?? null,
    },
  });
}
