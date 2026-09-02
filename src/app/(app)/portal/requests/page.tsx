import { db } from "@/lib/db";
import { requireEmployee } from "@/server/queries/portal";
import { getT } from "@/lib/i18n";
import { Card, PageHeader, Field } from "@/components/ui";
import { ActionForm } from "@/components/ui/ActionForm";
import { RequestList } from "@/components/clinic/RequestList";
import { Pagination, safePage } from "@/components/ui/Pagination";
import { createServiceRequest } from "@/server/actions/requests";
export default async function MyRequests({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; page?: string }>;
}) {
  const { employee } = await requireEmployee();
  const t = await getT();
  const params = await searchParams;
  const services = await db.clinicService.findMany({
    where: { isActive: true, mode: "REQUEST" },
    orderBy: { sortOrder: "asc" },
  });
  const where = { employeeId: employee.id };
  const total = await db.serviceRequest.count({ where });
  const page = Math.min(
    safePage(params.page),
    Math.max(1, Math.ceil(total / 25)),
  );
  const requests = await db.serviceRequest.findMany({
    where,
    include: { service: true },
    orderBy: { createdAt: "desc" },
    take: 25,
    skip: (page - 1) * 25,
  });
  return (
    <>
      <PageHeader title={t("v2.requests")} />
      <div className="content-columns">
        <Card>
          <RequestList requests={requests} />
          <Pagination page={page} total={total} base="/portal/requests" />
        </Card>
        <Card>
          <h2 className="section-title">{t("v2.sendRequest")}</h2>
          <ActionForm
            action={createServiceRequest}
            label={t("v2.sendRequest")}
            className="stack-form"
          >
            <Field label={t("v2.chooseService")} required>
              <select
                className="select"
                name="serviceId"
                defaultValue={
                  services.some((s) => s.id === params.service)
                    ? params.service
                    : services[0]?.id
                }
                required
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {t.locale === "ar" ? s.nameAr : s.nameEn}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("v2.requestMessage")} required>
              <textarea
                className="textarea"
                name="message"
                rows={5}
                minLength={3}
                maxLength={2000}
                required
              />
            </Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
