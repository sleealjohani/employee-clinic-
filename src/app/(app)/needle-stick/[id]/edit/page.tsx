import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { getT } from "@/lib/i18n";
import { toDateTimeInput } from "@/lib/format";
import { LinkButton, PageHeader } from "@/components/ui";
import {
  NeedleStickIncidentForm,
  type NeedleStickIncidentInitial,
} from "@/components/forms/NeedleStickIncidentForm";

export const dynamic = "force-dynamic";

const text = (value: string | null) => value || "";

export default async function EditNeedleStickIncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("clinical.write");
  const { id } = await params;
  const [t, incident] = await Promise.all([
    getT(),
    db.needleStickIncident.findUnique({
      where: { id, status: { not: "ENTERED_IN_ERROR" } },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            nationalId: true,
            employeeNo: true,
            department: true,
            isArchived: true,
          },
        },
      },
    }),
  ]);
  if (!incident || incident.employee.isArchived) notFound();

  const initial: NeedleStickIncidentInitial = {
    id: incident.id,
    employeeId: incident.employeeId,
    department: text(incident.department),
    nature: incident.nature,
    otherNature: text(incident.otherNature),
    incidentAt: toDateTimeInput(incident.incidentAt),
    staffSignature: text(incident.staffSignature),
    sourcePatientName: text(incident.sourcePatientName),
    sourcePatientFileNo: text(incident.sourcePatientFileNo),
    sourceWard: text(incident.sourceWard),
    sourceBloodBorneHistory:
      incident.sourceBloodBorneHistory === null
        ? "UNKNOWN"
        : incident.sourceBloodBorneHistory
          ? "YES"
          : "NO",
    sourceBloodBorneDetails: text(incident.sourceBloodBorneDetails),
    actionWashing: incident.actionWashing,
    actionIrrigation: incident.actionIrrigation,
    actionEmployeeClinic: incident.actionEmployeeClinic,
    actionImmunoglobulin: incident.actionImmunoglobulin,
    headOfDepartmentName: text(incident.headOfDepartmentName),
    headOfDepartmentSignature: text(incident.headOfDepartmentSignature),
    headOfDepartmentSignedAt: toDateTimeInput(
      incident.headOfDepartmentSignedAt,
    ),
    reportReceivedAt: toDateTimeInput(incident.reportReceivedAt),
    patientHivResult: text(incident.patientHivResult),
    patientHbvResult: text(incident.patientHbvResult),
    patientHcvResult: text(incident.patientHcvResult),
    patientOtherResult: text(incident.patientOtherResult),
    staffHivResult: text(incident.staffHivResult),
    staffHbvResult: text(incident.staffHbvResult),
    staffHcvResult: text(incident.staffHcvResult),
    staffOtherResult: text(incident.staffOtherResult),
    recommendation: text(incident.recommendation),
    physicianName: text(incident.physicianName),
    physicianSignature: text(incident.physicianSignature),
    physicianSignedAt: toDateTimeInput(incident.physicianSignedAt),
    completedAt: incident.completedAt?.toISOString() || "",
    revision: incident.revision,
  };

  return (
    <>
      <PageHeader
        title={t("needle.edit")}
        subtitle={`${incident.staffName} · ${t(`needle.nature.${incident.nature}`)}`}
        actions={
          <LinkButton href={`/needle-stick/${incident.id}`}>
            {t("action.back")}
          </LinkButton>
        }
      />
      <NeedleStickIncidentForm
        employees={[incident.employee]}
        defaultIncidentAt={initial.incidentAt}
        initial={initial}
      />
    </>
  );
}
