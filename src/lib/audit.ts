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
type AuditInput = {
  user?: Pick<CurrentUser, "id" | "name"> | null;
  userName?: string;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  summary: string;
  meta?: Record<string, unknown>;
};

export async function writeAudit(
  input: AuditInput[],
  client?: Prisma.TransactionClient,
): Promise<void>;
export async function writeAudit(
  input: AuditInput,
  client?: Prisma.TransactionClient,
): Promise<void>;
export async function writeAudit(
  input: AuditInput | AuditInput[],
  client: Prisma.TransactionClient = db,
): Promise<void> {
  const ctx = await requestContext();
  const data = (Array.isArray(input) ? input : [input]).map((input) => ({
    userId: input.user?.id ?? null,
    userName: input.user?.name ?? input.userName ?? "—",
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    summary: input.summary,
    meta: input.meta ? JSON.parse(JSON.stringify(input.meta)) : undefined,
    ip: ctx.ip,
    userAgent: ctx.userAgent?.slice(0, 300) ?? null,
  }));
  if (Array.isArray(input)) {
    if (data.length) await client.auditLog.createMany({ data });
  } else {
    await client.auditLog.create({ data: data[0] });
  }
}
