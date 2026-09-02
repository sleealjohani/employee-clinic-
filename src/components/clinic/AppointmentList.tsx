import Link from "next/link";
import type { Appointment, ClinicService, Employee } from "@prisma/client";
import { getT } from "@/lib/i18n";
import { clinicDay } from "@/lib/clinic-config";
import { formatDateTime } from "@/lib/format";
import { Chip, Empty } from "@/components/ui";
import { ActionForm } from "@/components/ui/ActionForm";
import { changeAppointmentStatus } from "@/server/actions/appointments";
export async function AppointmentList({
  appointments,
  staff = false,
}: {
  appointments: (Appointment & {
    service: ClinicService;
    employee?: Pick<Employee, "id" | "name">;
  })[];
  staff?: boolean;
}) {
  const t = await getT();
  if (!appointments.length) return <Empty title={t("v2.noAppointments")} />;
  return (
    <div className="appointment-list">
      {appointments.map((appt) => {
        const terminal = ["CANCELLED", "COMPLETED", "NO_SHOW"].includes(
          appt.status,
        );
        return (
          <article className="appointment-card" key={appt.id}>
            <div className="appointment-date">
              <strong className="num">
                {new Intl.DateTimeFormat("en-GB", {
                  day: "2-digit",
                  timeZone: "Asia/Riyadh",
                }).format(appt.startsAt)}
              </strong>
              <span>
                {new Intl.DateTimeFormat(t.locale, {
                  month: "short",
                  timeZone: "Asia/Riyadh",
                }).format(appt.startsAt)}
              </span>
            </div>
            <div className="appointment-info">
              <div className="flex flex-wrap items-center gap-2">
                <h3>
                  {t.locale === "ar"
                    ? appt.service.nameAr
                    : appt.service.nameEn}
                </h3>
                <Chip
                  tone={
                    appt.status === "CONFIRMED"
                      ? "accent"
                      : appt.status === "COMPLETED"
                        ? "ok"
                        : appt.status === "CANCELLED"
                          ? "neutral"
                          : "warn"
                  }
                >
                  {t("v2.status." + appt.status)}
                </Chip>
              </div>
              {staff && appt.employee && (
                <Link
                  className="text-link"
                  href={"/employees/" + appt.employee.id}
                >
                  {appt.employee.name}
                </Link>
              )}
              <p className="muted num">
                {formatDateTime(appt.startsAt, t.locale)} ·{" "}
                {t("v2.minutes", {
                  n: Math.round(
                    (appt.endsAt.getTime() - appt.startsAt.getTime()) / 60000,
                  ),
                })}
              </p>
              {appt.reason && (
                <p className="appointment-reason">{appt.reason}</p>
              )}
              {appt.cancellationReason && (
                <p className="muted">
                  {t("v2.cancelReason")}: {appt.cancellationReason}
                </p>
              )}
            </div>
            <div className="appointment-actions no-print">
              {staff && appt.visitId && (
                <Link
                  className="btn btn-primary btn-sm"
                  href={"/visits/" + appt.visitId}
                >
                  {t("v2.openVisit")}
                </Link>
              )}
              {staff && appt.status === "REQUESTED" && (
                <ActionForm
                  action={changeAppointmentStatus}
                  label={t("v2.confirmAppointment")}
                  success={false}
                >
                  <input type="hidden" name="id" value={appt.id} />
                  <input type="hidden" name="status" value="CONFIRMED" />
                </ActionForm>
              )}
              {staff &&
                appt.status === "CONFIRMED" &&
                clinicDay(appt.startsAt) === clinicDay() && (
                  <ActionForm
                    action={changeAppointmentStatus}
                    label={t("v2.checkIn")}
                    success={false}
                  >
                    <input type="hidden" name="id" value={appt.id} />
                    <input type="hidden" name="status" value="CHECKED_IN" />
                  </ActionForm>
                )}
              {staff &&
                !terminal &&
                appt.status !== "CHECKED_IN" &&
                appt.endsAt < new Date() && (
                  <ActionForm
                    action={changeAppointmentStatus}
                    label={t("v2.noShow")}
                    success={false}
                  >
                    <input type="hidden" name="id" value={appt.id} />
                    <input type="hidden" name="status" value="NO_SHOW" />
                  </ActionForm>
                )}
              {!terminal && appt.status !== "CHECKED_IN" && (
                <details className="inline-details">
                  <summary>{t("v2.cancelBooking")}</summary>
                  <ActionForm
                    action={changeAppointmentStatus}
                    danger
                    label={t("v2.cancelBooking")}
                    success={false}
                  >
                    <input type="hidden" name="id" value={appt.id} />
                    <input type="hidden" name="status" value="CANCELLED" />
                    <label className="label" htmlFor={"cancel-" + appt.id}>
                      {t("v2.cancelReason")}
                    </label>
                    <input
                      id={"cancel-" + appt.id}
                      name="reason"
                      className="input"
                      minLength={3}
                      maxLength={500}
                      required
                    />
                  </ActionForm>
                </details>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
