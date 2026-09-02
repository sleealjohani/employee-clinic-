import { db } from "@/lib/db";
import { requireEmployee } from "@/server/queries/portal";
import { getClinicConfig } from "@/server/queries/settings";
import { getT } from "@/lib/i18n";
import { Card, PageHeader } from "@/components/ui";
import { BookingForm } from "@/components/clinic/BookingForm";
export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  await requireEmployee();
  const t = await getT();
  const params = await searchParams;
  const [services, config] = await Promise.all([
    db.clinicService.findMany({
      where: { isActive: true, mode: "APPOINTMENT" },
      orderBy: { sortOrder: "asc" },
    }),
    getClinicConfig(),
  ]);
  return (
    <>
      <PageHeader title={t("v2.book")} subtitle={t("v2.bookSubtitle")} />
      <Card className="max-w-4xl">
        <BookingForm
          services={services}
          initialService={
            services.some((s) => s.id === params.service)
              ? params.service
              : undefined
          }
          enabled={config.employeeBooking}
          bookingDays={config.bookingDays}
        />
      </Card>
    </>
  );
}
