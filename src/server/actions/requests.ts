"use server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  actionError,
  ClinicError,
  type ResultState,
} from "@/lib/action-result";
import { notifyClinic, notifyEmployee } from "@/server/clinic-notifications";
import { validDay } from "@/lib/clinic-config";

const optionalText = z.string().trim().max(160).optional();
const profileSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^(05\d{8}|\+9665\d{8})$/)
    .optional()
    .or(z.literal("")),
  email: z.email().max(160).optional().or(z.literal("")),
  dob: z
    .string()
    .refine(
      (v) =>
        validDay(v) &&
        new Date(v) < new Date() &&
        new Date(v).getFullYear() >= 1900,
    )
    .optional()
    .or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE"]).optional().or(z.literal("")),
  nationality: optionalText,
  qualification: optionalText,
  workLocation: optionalText,
});
function refresh() {
  for (const path of [
    "/portal",
    "/portal/profile",
    "/portal/requests",
    "/requests",
    "/employees",
    "/notifications",
  ])
    revalidatePath(path);
}

export async function createServiceRequest(
  _prev: ResultState,
  form: FormData,
): Promise<ResultState> {
  const user = await requireUser();
  if (user.role !== "EMPLOYEE" || !user.employeeId)
    return { error: "v2.denied" };
  const serviceId = String(form.get("serviceId") ?? ""),
    message = String(form.get("message") ?? "").trim();
  if (message.length < 3 || message.length > 2000)
    return { error: "v2.invalid" };
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"request:" + user.id}))`;
      const service = await tx.clinicService.findFirst({
        where: { id: serviceId, isActive: true, mode: "REQUEST" },
      });
      if (!service) throw new ClinicError("v2.invalid");
      const pending = await tx.serviceRequest.count({
        where: {
          employeeId: user.employeeId!,
          serviceId,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      });
      if (pending) throw new ClinicError("v2.pendingRequest");
      const request = await tx.serviceRequest.create({
        data: {
          employeeId: user.employeeId!,
          serviceId,
          subject: service.nameAr,
          message,
        },
      });
      await writeAudit(
        {
          user,
          action: "CREATE",
          entity: "ServiceRequest",
          entityId: request.id,
          summary: "تقديم طلب خدمة",
        },
        tx,
      );
      await notifyClinic(
        tx,
        "طلب خدمة جديد",
        "New service request",
        "/requests",
      );
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
export async function requestProfileUpdate(
  _prev: ResultState,
  form: FormData,
): Promise<ResultState> {
  const user = await requireUser();
  if (user.role !== "EMPLOYEE" || !user.employeeId)
    return { error: "v2.denied" };
  const parsed = profileSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success || !Object.keys(parsed.data).length)
    return { error: "v2.invalidProfile" };
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"request:" + user.id}))`;
      if (
        await tx.serviceRequest.count({
          where: {
            employeeId: user.employeeId!,
            kind: "PROFILE_UPDATE",
            status: { in: ["OPEN", "IN_PROGRESS"] },
          },
        })
      )
        throw new ClinicError("v2.pendingRequest");
      const request = await tx.serviceRequest.create({
        data: {
          employeeId: user.employeeId!,
          kind: "PROFILE_UPDATE",
          subject: "تحديث بيانات الملف",
          message: "طلب مراجعة بيانات الموظف",
          payload: parsed.data,
        },
      });
      await writeAudit(
        {
          user,
          action: "CREATE",
          entity: "ServiceRequest",
          entityId: request.id,
          summary: "طلب تصحيح بيانات الملف",
        },
        tx,
      );
      await notifyClinic(
        tx,
        "طلب تحديث بيانات موظف",
        "Employee profile update requested",
        "/requests",
      );
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
export async function respondToRequest(
  _prev: ResultState,
  form: FormData,
): Promise<ResultState> {
  const user = await requireUser();
  const id = String(form.get("id") ?? ""),
    status = String(form.get("status") ?? ""),
    response = String(form.get("response") ?? "")
      .trim()
      .slice(0, 2000);
  const staff = can(user.role, "clinical.write");
  if (!staff && (user.role !== "EMPLOYEE" || status !== "CANCELLED"))
    return { error: "v2.denied" };
  if (!["IN_PROGRESS", "COMPLETED", "DECLINED", "CANCELLED"].includes(status))
    return { error: "v2.invalid" };
  if (
    staff &&
    ["COMPLETED", "DECLINED"].includes(status) &&
    response.length < 3
  )
    return { error: "v2.reasonRequired" };
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"service-request:" + id}))`;
      const request = await tx.serviceRequest.findUnique({ where: { id } });
      if (!request || (!staff && request.employeeId !== user.employeeId))
        throw new ClinicError("v2.denied");
      if (!["OPEN", "IN_PROGRESS"].includes(request.status))
        throw new ClinicError("v2.invalidTransition");
      if (request.kind === "PROFILE_UPDATE" && status === "COMPLETED") {
        const profile = profileSchema.parse(request.payload);
        const { phone, email, dob, gender, ...textFields } = profile;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"employee:" + request.employeeId}))`;
        const employee = await tx.employee.findUnique({
          where: { id: request.employeeId },
        });
        if (!employee || employee.isArchived)
          throw new ClinicError("v2.invalid");
        await tx.employee.update({
          where: { id: request.employeeId },
          data: {
            ...textFields,
            ...(phone !== undefined ? { phone: phone || null } : {}),
            ...(email !== undefined ? { email: email || null } : {}),
            ...(dob !== undefined ? { dob: dob ? new Date(dob) : null } : {}),
            ...(gender !== undefined ? { gender: gender || null } : {}),
          },
        });
        await writeAudit(
          {
            user,
            action: "UPDATE",
            entity: "Employee",
            entityId: request.employeeId,
            summary: "اعتماد تصحيح بيانات الموظف",
            meta: { requestId: id, fields: Object.keys(profile) },
          },
          tx,
        );
      }
      await tx.serviceRequest.update({
        where: { id },
        data: {
          status: status as
            | "IN_PROGRESS"
            | "COMPLETED"
            | "DECLINED"
            | "CANCELLED",
          response: staff ? response : request.response,
          resolvedAt: status === "IN_PROGRESS" ? null : new Date(),
        },
      });
      await writeAudit(
        {
          user,
          action: "UPDATE",
          entity: "ServiceRequest",
          entityId: id,
          summary: "تحديث حالة طلب الخدمة",
          meta: { status },
        },
        tx,
      );
      if (staff)
        await notifyEmployee(
          tx,
          request.employeeId,
          "يوجد تحديث على طلبك",
          "Your service request has an update",
          "/portal/requests",
        );
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
export async function markNotificationsRead(): Promise<void> {
  const user = await requireUser();
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
}
