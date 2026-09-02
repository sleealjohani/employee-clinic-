import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { clinicDay, clinicDateTime, validDay } from "@/lib/clinic-config";
import { Card, PageHeader } from "@/components/ui";
import { AppointmentList } from "@/components/clinic/AppointmentList";
import { Pagination, safePage } from "@/components/ui/Pagination";
import type { Prisma } from "@prisma/client";
export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; status?: string; page?: string }>;
}) {
  await requirePermission("clinical.read");
  const t = await getT();
  const params = await searchParams;
  const day = params.day === undefined ? clinicDay() : params.day;
  const statuses = [
    "REQUESTED",
    "CONFIRMED",
    "CHECKED_IN",
    "COMPLETED",
    "CANCELLED",
    "NO_SHOW",
  ];
  const status = statuses.includes(params.status || "")
    ? params.status
    : undefined;
  const where: Prisma.AppointmentWhereInput = {
    ...(validDay(day)
      ? {
          startsAt: {
            gte: clinicDateTime(day),
            lt: new Date(clinicDateTime(day).getTime() + 86400000),
          },
        }
      : {}),
    ...(status
      ? { status: status as Prisma.EnumAppointmentStatusFilter["equals"] }
      : {}),
  };
  const total = await db.appointment.count({ where });
  const page = Math.min(
    safePage(params.page),
    Math.max(1, Math.ceil(total / 25)),
  );
  const appointments = await db.appointment.findMany({
    where,
    include: { service: true, employee: { select: { id: true, name: true } } },
    orderBy: { startsAt: "asc" },
    skip: (page - 1) * 25,
    take: 25,
  });
  return (
    <>
      <PageHeader
        title={t("v2.appointments")}
        subtitle={t("v2.bookSubtitle")}
        actions={
          <Link className="btn btn-primary" href="/appointments/new">
            {t("v2.book")}
          </Link>
        }
      />
      <Card>
        <form className="filter-bar" method="get">
          <label>
            <span className="label">{t("v2.date")}</span>
            <input
              className="input"
              type="date"
              name="day"
              defaultValue={day}
            />
          </label>
          <label>
            <span className="label">{t("common.status")}</span>
            <select
              className="select"
              name="status"
              defaultValue={status || ""}
            >
              <option value="">{t("v2.allAppointments")}</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {t("v2.status." + s)}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-ghost">{t("action.search")}</button>
          <Link className="text-link" href="/appointments?day=">
            {t("v2.viewAll")}
          </Link>
          <span className="count-label num">{total}</span>
        </form>
        <AppointmentList appointments={appointments} staff />
        <Pagination
          total={total}
          page={page}
          base="/appointments"
          params={{ day, status }}
        />
      </Card>
    </>
  );
}
