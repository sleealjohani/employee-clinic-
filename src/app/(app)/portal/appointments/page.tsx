import Link from "next/link";
import { db } from "@/lib/db";
import { requireEmployee } from "@/server/queries/portal";
import { getT } from "@/lib/i18n";
import { Card, PageHeader } from "@/components/ui";
import { AppointmentList } from "@/components/clinic/AppointmentList";
import { Pagination, safePage } from "@/components/ui/Pagination";
export default async function MyAppointments({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { employee } = await requireEmployee();
  const t = await getT();
  const params = await searchParams;
  const where = { employeeId: employee.id };
  const total = await db.appointment.count({ where });
  const page = Math.min(
    safePage(params.page),
    Math.max(1, Math.ceil(total / 25)),
  );
  const appointments = await db.appointment.findMany({
    where,
    include: { service: true },
    orderBy: { startsAt: "desc" },
    skip: (page - 1) * 25,
    take: 25,
  });
  return (
    <>
      <PageHeader
        title={t("v2.myAppointments")}
        subtitle={t("v2.bookSubtitle")}
        actions={
          <Link className="btn btn-primary" href="/portal/appointments/new">
            {t("v2.book")}
          </Link>
        }
      />
      <Card>
        <AppointmentList appointments={appointments} />
        <Pagination total={total} page={page} base="/portal/appointments" />
      </Card>
    </>
  );
}
