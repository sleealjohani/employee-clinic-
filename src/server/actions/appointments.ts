"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, requirePermission } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { writeAudit } from "@/lib/audit";
import {
  ClinicError,
  actionError,
  type ResultState,
} from "@/lib/action-result";
import { clinicDay, validDay } from "@/lib/clinic-config";
import { ACTIVE_APPOINTMENT_STATUSES } from "@/lib/scheduling";
import { readClinicConfig } from "@/server/queries/settings";
import { loadSlots } from "@/server/queries/appointments";
import { notifyClinic, notifyEmployee } from "@/server/clinic-notifications";

function refresh() {
  for (const path of [
    "/appointments",
    "/portal",
    "/portal/appointments",
    "/dashboard",
    "/visits",
    "/notifications",
  ])
    revalidatePath(path);
}
export async function getBookingSlots(serviceId: string, day: string) {
  const user = await requireUser();
  if (user.role !== "EMPLOYEE" && !can(user.role, "clinical.write")) return [];
  if (!validDay(day)) return [];
  const config = await readClinicConfig();
  if (user.role === "EMPLOYEE" && !config.employeeBooking) return [];
  return loadSlots(serviceId, day);
}
export async function bookAppointment(
  _prev: ResultState,
  form: FormData,
): Promise<ResultState> {
  const user = await requireUser();
  if (user.role !== "EMPLOYEE" && !can(user.role, "clinical.write"))
    return { error: "v2.denied" };
  const employeeId =
    user.role === "EMPLOYEE"
      ? user.employeeId
      : String(form.get("employeeId") ?? "");
  const serviceId = String(form.get("serviceId") ?? "");
  const startsAt = new Date(String(form.get("startsAt") ?? ""));
  const reason = String(form.get("reason") ?? "")
    .trim()
    .slice(0, 1000);
  const requestKey = String(form.get("requestKey") ?? "");
  if (
    !employeeId ||
    !serviceId ||
    !Number.isFinite(startsAt.getTime()) ||
    !/^[-a-zA-Z0-9_]{16,100}$/.test(requestKey)
  )
    return { error: "v2.invalid" };
  try {
    const result = await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('clinic-scheduling'))`;
        const existing = await tx.appointment.findUnique({
          where: { requestKey },
        });
        if (existing) {
          if (existing.employeeId !== employeeId)
            throw new ClinicError("v2.denied");
          return existing;
        }
        const [employee, config, service] = await Promise.all([
          tx.employee.findUnique({ where: { id: employeeId } }),
          readClinicConfig(tx),
          tx.clinicService.findFirst({
            where: { id: serviceId, isActive: true, mode: "APPOINTMENT" },
          }),
        ]);
        if (
          !employee ||
          employee.isArchived ||
          employee.employmentStatus === "TERMINATED" ||
          !service
        )
          throw new ClinicError("v2.invalid");
        if (user.role === "EMPLOYEE" && !config.employeeBooking)
          throw new ClinicError("v2.bookingClosed");
        const active = await tx.appointment.count({
          where: {
            employeeId,
            startsAt: { gte: new Date() },
            status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
          },
        });
        if (active >= config.maxActiveBookings)
          throw new ClinicError("v2.bookingLimit");
        const slots = await loadSlots(serviceId, clinicDay(startsAt), tx);
        const slot = slots.find(
          (s) => s.start === startsAt.toISOString() && s.available,
        );
        if (!slot) throw new ClinicError("v2.slotTaken");
        const clash = await tx.appointment.count({
          where: {
            employeeId,
            status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
            startsAt: { lt: new Date(slot.end) },
            endsAt: { gt: startsAt },
          },
        });
        if (clash) throw new ClinicError("v2.slotTaken");
        const appointment = await tx.appointment.create({
          data: {
            employeeId,
            serviceId,
            startsAt,
            endsAt: new Date(slot.end),
            reason,
            status: config.autoConfirm ? "CONFIRMED" : "REQUESTED",
            requestKey,
          },
        });
        await writeAudit(
          {
            user,
            action: "CREATE",
            entity: "Appointment",
            entityId: appointment.id,
            summary: "حجز موعد عيادة",
            meta: { employeeId, startsAt: startsAt.toISOString(), serviceId },
          },
          tx,
        );
        await notifyEmployee(
          tx,
          employeeId,
          "تم استلام حجز موعدك",
          "Your appointment has been booked",
          "/portal/appointments",
        );
        if (user.role === "EMPLOYEE")
          await notifyClinic(
            tx,
            "حجز موعد جديد",
            "New appointment booked",
            "/appointments",
          );
        return appointment;
      },
      { timeout: 15000 },
    );
    refresh();
    return { ok: true, id: result.id };
  } catch (e) {
    return actionError(e);
  }
}
export async function changeAppointmentStatus(
  _prev: ResultState,
  form: FormData,
): Promise<ResultState> {
  const user = await requireUser();
  const id = String(form.get("id") ?? ""),
    status = String(form.get("status") ?? "");
  const reason = String(form.get("reason") ?? "")
    .trim()
    .slice(0, 500);
  const isStaff = can(user.role, "clinical.write");
  if (!isStaff && (user.role !== "EMPLOYEE" || status !== "CANCELLED"))
    return { error: "v2.denied" };
  if (!["CONFIRMED", "CANCELLED", "CHECKED_IN", "NO_SHOW"].includes(status))
    return { error: "v2.invalid" };
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('clinic-scheduling'))`;
        const appt = await tx.appointment.findUnique({
          where: { id },
          include: { service: true },
        });
        if (!appt || (!isStaff && appt.employeeId !== user.employeeId))
          throw new ClinicError("v2.denied");
        if (appt.status === status) return;
        if (
          ["CANCELLED", "COMPLETED", "NO_SHOW"].includes(appt.status) ||
          appt.status === "CHECKED_IN"
        )
          throw new ClinicError("v2.invalidTransition");
        if (status === "CONFIRMED" && appt.status !== "REQUESTED")
          throw new ClinicError("v2.invalidTransition");
        const config = await readClinicConfig(tx);
        if (
          !isStaff &&
          appt.startsAt.getTime() - Date.now() <
            config.cancellationHours * 3600000
        )
          throw new ClinicError("v2.cancelTooLate");
        if (status === "CANCELLED" && reason.length < 3)
          throw new ClinicError("v2.reasonRequired");
        if (
          status === "CHECKED_IN" &&
          (appt.status !== "CONFIRMED" ||
            clinicDay(appt.startsAt) !== clinicDay())
        )
          throw new ClinicError("v2.checkInDay");
        if (status === "NO_SHOW" && appt.endsAt > new Date())
          throw new ClinicError("v2.invalidTransition");
        let visitId = appt.visitId;
        if (status === "CHECKED_IN") {
          const visit = await tx.visit.create({
            data: {
              employeeId: appt.employeeId,
              type: appt.service.visitType,
              chiefComplaint: appt.reason,
              createdById: user.id,
            },
          });
          visitId = visit.id;
          await writeAudit(
            {
              user,
              action: "CREATE",
              entity: "Visit",
              entityId: visitId,
              summary: "فتح زيارة من موعد",
              meta: { appointmentId: id },
            },
            tx,
          );
        }
        await tx.appointment.update({
          where: { id },
          data: {
            status: status as
              | "CONFIRMED"
              | "CANCELLED"
              | "CHECKED_IN"
              | "NO_SHOW",
            visitId,
            cancellationReason: status === "CANCELLED" ? reason : null,
          },
        });
        await writeAudit(
          {
            user,
            action: "UPDATE",
            entity: "Appointment",
            entityId: id,
            summary: "تحديث حالة الموعد",
            meta: { from: appt.status, to: status },
          },
          tx,
        );
        await notifyEmployee(
          tx,
          appt.employeeId,
          "تم تحديث حالة موعدك",
          "Your appointment status changed",
          "/portal/appointments",
        );
      },
      { timeout: 15000 },
    );
    refresh();
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
export async function saveScheduleBlock(
  _prev: ResultState,
  form: FormData,
): Promise<ResultState> {
  const user = await requirePermission("users.manage");
  const startsAt = new Date(String(form.get("startsAt") ?? "") + "+03:00"),
    endsAt = new Date(String(form.get("endsAt") ?? "") + "+03:00");
  const reason = String(form.get("reason") ?? "")
    .trim()
    .slice(0, 300);
  if (
    !Number.isFinite(startsAt.getTime()) ||
    !Number.isFinite(endsAt.getTime()) ||
    startsAt >= endsAt ||
    reason.length < 3
  )
    return { error: "v2.invalid" };
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('clinic-scheduling'))`;
      const clashes = await tx.appointment.count({
        where: {
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
          status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        },
      });
      if (clashes) throw new ClinicError("v2.blockConflict");
      const block = await tx.scheduleBlock.create({
        data: { startsAt, endsAt, reason },
      });
      await writeAudit(
        {
          user,
          action: "CREATE",
          entity: "ScheduleBlock",
          entityId: block.id,
          summary: "إغلاق فترة في جدول العيادة",
        },
        tx,
      );
    });
    refresh();
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
export async function removeScheduleBlock(
  _prev: ResultState,
  form: FormData,
): Promise<ResultState> {
  const user = await requirePermission("users.manage");
  const id = String(form.get("id") ?? "");
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('clinic-scheduling'))`;
      await tx.scheduleBlock.delete({ where: { id } });
      await writeAudit(
        {
          user,
          action: "UPDATE",
          entity: "ScheduleBlock",
          entityId: id,
          summary: "إعادة فتح فترة في جدول العيادة",
        },
        tx,
      );
    });
    revalidatePath("/settings");
    refresh();
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
