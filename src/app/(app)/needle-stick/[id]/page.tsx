import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { writeAudit } from "@/lib/audit";
import { formatDateTime } from "@/lib/format";
import {
  Alert,
  Card,
  Chip,
  KeyValue,
  LinkButton,
  PageHeader,
  SectionTitle,
} from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { VoidNeedleStickIncidentForm } from "@/components/forms/NeedleStickIncidentForm";

export const dynamic = "force-dynamic";

export default async function NeedleStickIncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("clinical.read");
  const { id } = await params;
  const [t, incident] = await Promise.all([
    getT(),
    db.needleStickIncident.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            nationalId: true,
            employeeNo: true,
            isArchived: true,
          },
        },
        createdBy: { select: { name: true } },
        updatedBy: { select: { name: true } },
      },
    }),
  ]);
  if (!incident) notFound();

  await writeAudit({
    user,
    action: "VIEW_SENSITIVE",
    entity: "NeedleStickIncident",
    entityId: incident.id,
    summary: `اطلاع على حادثة تعرض مهني: ${incident.staffName}`,
    meta: { employeeId: incident.employeeId },
  });

  const editable =
    can(user.role, "clinical.write") &&
    incident.status !== "ENTERED_IN_ERROR" &&
    !incident.employee.isArchived;
  const nature =
    incident.nature === "OTHER" && incident.otherNature
      ? `${t("needle.nature.OTHER")}: ${incident.otherNature}`
      : t(`needle.nature.${incident.nature}`);
  const actions = [
    [incident.actionWashing, t("needle.action.washing")],
    [incident.actionIrrigation, t("needle.action.irrigation")],
    [incident.actionEmployeeClinic, t("needle.action.employeeClinic")],
    [incident.actionImmunoglobulin, t("needle.action.immunoglobulin")],
  ] as const;

  return (
    <>
      <PageHeader
        title={t("needle.reportTitle")}
        subtitle={`${incident.staffName} · ${formatDateTime(incident.incidentAt, t.locale)}`}
        badge={
          <Chip
            tone={
              incident.status === "ENTERED_IN_ERROR"
                ? "neutral"
                : incident.completedAt
                  ? "ok"
                  : "warn"
            }
            dot
          >
            {incident.status === "ENTERED_IN_ERROR"
              ? t("recordStatus.ENTERED_IN_ERROR")
              : t(
                  incident.completedAt
                    ? "needle.status.COMPLETED"
                    : "needle.status.OPEN",
                )}
          </Chip>
        }
        actions={
          <>
            <LinkButton href="/needle-stick">{t("action.back")}</LinkButton>
            <Link
              className="btn btn-ghost"
              href={`/needle-stick/${incident.id}/print`}
            >
              {t("needle.openPrintForm")}
            </Link>
            {editable && (
              <LinkButton
                href={`/needle-stick/${incident.id}/edit`}
                variant="primary"
              >
                {t("action.edit")}
              </LinkButton>
            )}
            {can(user.role, "clinical.void") &&
              incident.status !== "ENTERED_IN_ERROR" && (
                <Modal
                  title={t("action.void")}
                  trigger={
                    <button className="btn btn-ghost">
                      {t("action.void")}
                    </button>
                  }
                >
                  <VoidNeedleStickIncidentForm incidentId={incident.id} />
                </Modal>
              )}
          </>
        }
      />

      {incident.status === "ENTERED_IN_ERROR" && incident.voidReason && (
        <div className="mb-4">
          <Alert tone="neutral" title={t("recordStatus.ENTERED_IN_ERROR")}>
            {incident.voidReason}
          </Alert>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>{t("needle.staffSection")}</SectionTitle>
          <dl className="grid gap-4 sm:grid-cols-2">
            <KeyValue
              label={t("emp.name")}
              value={
                <Link
                  className="text-link"
                  href={`/employees/${incident.employeeId}?tab=needleStick`}
                >
                  {incident.staffName}
                </Link>
              }
            />
            <KeyValue
              label={t("emp.nationalId")}
              value={<span dir="ltr">{incident.employee.nationalId}</span>}
              mono
            />
            <KeyValue
              label={t("emp.department")}
              value={incident.department || "—"}
            />
            <KeyValue label={t("needle.nature")} value={nature} />
            <KeyValue
              label={t("needle.incidentAt")}
              value={formatDateTime(incident.incidentAt, t.locale)}
              mono
            />
            <KeyValue
              label={t("needle.staffSignature")}
              value={incident.staffSignature || "—"}
            />
          </dl>
        </Card>

        <Card>
          <SectionTitle>{t("needle.sourceSection")}</SectionTitle>
          <dl className="grid gap-4 sm:grid-cols-2">
            <KeyValue
              label={t("needle.sourceName")}
              value={incident.sourcePatientName || "—"}
            />
            <KeyValue
              label={t("needle.sourceFileNo")}
              value={
                <span dir="ltr">{incident.sourcePatientFileNo || "—"}</span>
              }
              mono
            />
            <KeyValue
              label={t("needle.sourceWard")}
              value={incident.sourceWard || "—"}
            />
            <KeyValue
              label={t("needle.bloodBorneHistory")}
              value={
                incident.sourceBloodBorneHistory === null
                  ? t("needle.history.UNKNOWN")
                  : t(
                      incident.sourceBloodBorneHistory
                        ? "common.yes"
                        : "common.no",
                    )
              }
            />
            <div className="sm:col-span-2">
              <KeyValue
                label={t("needle.bloodBorneDetails")}
                value={incident.sourceBloodBorneDetails || "—"}
              />
            </div>
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle>{t("needle.actionsSection")}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {actions.some(([done]) => done) ? (
              actions.map(([done, label]) =>
                done ? (
                  <Chip key={label} tone="ok" dot>
                    {label}
                  </Chip>
                ) : null,
              )
            ) : (
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                {t("common.none")}
              </span>
            )}
          </div>
        </Card>

        <Card>
          <SectionTitle>{t("needle.departmentHeadSection")}</SectionTitle>
          <dl className="grid gap-4 sm:grid-cols-2">
            <KeyValue
              label={t("needle.departmentHeadName")}
              value={incident.headOfDepartmentName || "—"}
            />
            <KeyValue
              label={t("needle.departmentHeadSignature")}
              value={incident.headOfDepartmentSignature || "—"}
            />
            <KeyValue
              label={t("needle.signedAt")}
              value={formatDateTime(
                incident.headOfDepartmentSignedAt,
                t.locale,
              )}
              mono
            />
          </dl>
        </Card>

        <Card>
          <SectionTitle>{t("needle.clinicSection")}</SectionTitle>
          <dl className="grid gap-4 sm:grid-cols-2">
            <KeyValue
              label={t("needle.reportReceivedAt")}
              value={formatDateTime(incident.reportReceivedAt, t.locale)}
              mono
            />
            <KeyValue
              label={t("needle.physicianName")}
              value={incident.physicianName || "—"}
            />
            <KeyValue
              label={t("needle.physicianSignature")}
              value={incident.physicianSignature || "—"}
            />
            <KeyValue
              label={t("needle.physicianSignedAt")}
              value={formatDateTime(incident.physicianSignedAt, t.locale)}
              mono
            />
          </dl>
        </Card>

        <Card className="lg:col-span-2" pad={false}>
          <div className="px-4 pt-4">
            <SectionTitle>{t("needle.investigations")}</SectionTitle>
          </div>
          <div className="table-wrap border-t">
            <table className="data">
              <thead>
                <tr>
                  <th>{t("needle.resultSubject")}</th>
                  <th>HIV</th>
                  <th>HBV</th>
                  <th>HCV</th>
                  <th>{t("needle.result.OTHER")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>{t("needle.patientResults")}</th>
                  <td>{incident.patientHivResult || "—"}</td>
                  <td>{incident.patientHbvResult || "—"}</td>
                  <td>{incident.patientHcvResult || "—"}</td>
                  <td>{incident.patientOtherResult || "—"}</td>
                </tr>
                <tr>
                  <th>{t("needle.staffResults")}</th>
                  <td>{incident.staffHivResult || "—"}</td>
                  <td>{incident.staffHbvResult || "—"}</td>
                  <td>{incident.staffHcvResult || "—"}</td>
                  <td>{incident.staffOtherResult || "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="border-t px-4 py-4">
            <KeyValue
              label={t("needle.recommendation")}
              value={incident.recommendation || "—"}
            />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle>{t("needle.recordDetails")}</SectionTitle>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KeyValue
              label={t("common.recordedBy")}
              value={incident.createdBy?.name || "—"}
            />
            <KeyValue
              label={t("needle.lastUpdatedBy")}
              value={incident.updatedBy?.name || "—"}
            />
            <KeyValue
              label={t("needle.createdAt")}
              value={formatDateTime(incident.createdAt, t.locale)}
              mono
            />
            <KeyValue
              label={t("needle.updatedAt")}
              value={formatDateTime(incident.updatedAt, t.locale)}
              mono
            />
          </dl>
        </Card>
      </div>
    </>
  );
}
