import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n";
import { writeAudit } from "@/lib/audit";
import { formatDateTime } from "@/lib/format";
import {
  PageHeader,
  Card,
  Chip,
  LinkButton,
  Alert,
  Empty,
} from "@/components/ui";
import {
  SmartVisitForm,
  SmartLabForm,
} from "@/components/forms/SmartClinicalForms";
import { Modal } from "@/components/ui/Modal";
import { LabResultRow } from "@/components/employee/LabResultRow";
export const dynamic = "force-dynamic";
export default async function VisitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("clinical.read"),
    t = await getT(),
    { id } = await params;
  const visit = await db.visit.findUnique({
    where: { id },
    include: {
      employee: {
        include: {
          allergies: { where: { status: "ACTIVE", allergyStatus: "ACTIVE" } },
        },
      },
      createdBy: { select: { name: true } },
      labResults: { orderBy: { createdAt: "desc" } },
      appointment: true,
    },
  });
  if (!visit) notFound();
  await writeAudit({
    user,
    action: "VIEW_SENSITIVE",
    entity: "Visit",
    entityId: id,
    summary: "اطلاع على زيارة سريرية",
  });
  const writable =
    can(user.role, "clinical.write") &&
    !visit.employee.isArchived &&
    visit.status === "ACTIVE";
  return (
    <>
      <PageHeader
        title={t("v2.visitWorkspace")}
        subtitle={
          visit.employee.name +
          " · " +
          formatDateTime(visit.visitDate, t.locale)
        }
        badge={
          <Chip tone={visit.completedAt ? "ok" : "accent"}>
            {t(visit.completedAt ? "v2.completed" : "v2.inProgress")}
          </Chip>
        }
        actions={
          <LinkButton href={"/employees/" + visit.employeeId + "?tab=visits"}>
            {t("v2.employeeFile")}
          </LinkButton>
        }
      />
      {visit.employee.allergies.length > 0 && (
        <Alert tone="danger" title={t("allergy.title")}>
          {visit.employee.allergies
            .map((a) => a.substance + " — " + t("severity." + a.severity))
            .join("، ")}
        </Alert>
      )}
      {visit.status === "ENTERED_IN_ERROR" && (
        <Alert tone="danger">
          {t("recordStatus.ENTERED_IN_ERROR")}: {visit.voidReason}
        </Alert>
      )}
      <div className="workspace-columns">
        <Card>
          <p className="muted mb-4">
            {t("v2.recordedBy")}: {visit.createdBy?.name || "—"}
          </p>
          {writable ? (
            <SmartVisitForm visit={visit} />
          ) : (
            <dl className="stack">
              {["chiefComplaint", "diagnosis", "plan", "notes"].map((k) => (
                <div key={k}>
                  <dt>
                    {t(
                      k === "chiefComplaint"
                        ? "visit.chief"
                        : k === "notes"
                          ? "common.notes"
                          : "visit." + k,
                    )}
                  </dt>
                  <dd className="pre-wrap">
                    {visit[
                      k as "chiefComplaint" | "diagnosis" | "plan" | "notes"
                    ] || "—"}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
        <div className="stack">
          <Card>
            <div className="section-row">
              <h2>{t("v2.linkedLabs")}</h2>
              {writable && (
                <Modal
                  title={t("lab.new")}
                  trigger={
                    <button className="btn btn-primary">{t("lab.new")}</button>
                  }
                  wide
                >
                  <SmartLabForm
                    employeeId={visit.employeeId}
                    visitId={visit.id}
                  />
                </Modal>
              )}
            </div>
            {visit.labResults.length ? (
              visit.labResults.map((lab) => (
                <LabResultRow
                  key={lab.id}
                  lab={lab}
                  t={t}
                  canWrite={writable}
                  canVoid={can(user.role, "clinical.void")}
                />
              ))
            ) : (
              <Empty title={t("common.empty")} />
            )}
          </Card>
          {visit.appointment && (
            <Card>
              <h2>{t("v2.appointments")}</h2>
              <p>{formatDateTime(visit.appointment.startsAt, t.locale)}</p>
              <LinkButton href="/appointments">{t("action.open")}</LinkButton>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
