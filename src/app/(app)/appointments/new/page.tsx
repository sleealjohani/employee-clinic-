import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { getClinicConfig } from "@/server/queries/settings";
import { BookingForm } from "@/components/clinic/BookingForm";
import { Card, PageHeader } from "@/components/ui";
export default async function NewAppointment() {
  await requirePermission("clinical.write");
  const t = await getT();
  const [services, employees, config] = await Promise.all([
    db.clinicService.findMany({
      where: { isActive: true, mode: "APPOINTMENT" },
      orderBy: { sortOrder: "asc" },
    }),
    db.employee.findMany({
      where: { isArchived: false, employmentStatus: { not: "TERMINATED" } },
      select: { id: true, name: true, employeeNo: true },
      orderBy: { name: "asc" },
    }),
    getClinicConfig(),
  ]);
  return (
    <>
      <PageHeader title={t("v2.book")} subtitle={t("v2.bookSubtitle")} />
      <Card className="max-w-4xl">
        <BookingForm
          services={services}
          employees={employees}
          bookingDays={config.bookingDays}
        />
      </Card>
    </>
  );
}
