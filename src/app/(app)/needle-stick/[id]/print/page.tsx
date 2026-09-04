import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { writeAudit } from "@/lib/audit";
import { getT } from "@/lib/i18n";
import { PrintButton } from "@/components/ui/PrintButton";
import styles from "./NeedleStickPrint.module.css";

export const dynamic = "force-dynamic";

function parts(value: Date | null) {
  if (!value) return { date: "", time: "" };
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Riyadh",
  }).format(value);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Riyadh",
  }).format(value);
  return { date, time };
}

function Value({
  value,
  className,
  signature = false,
}: {
  value: string | null | undefined;
  className: string;
  signature?: boolean;
}) {
  if (!value) return null;
  return (
    <span
      className={`${signature ? styles.signature : styles.value} ${className}`}
    >
      {value}
    </span>
  );
}

function Check({ show, className }: { show: boolean; className: string }) {
  return show ? (
    <span className={`${styles.check} ${className}`}>✓</span>
  ) : null;
}

export default async function NeedleStickPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("clinical.read");
  const { id } = await params;
  const [incident, t] = await Promise.all([
    db.needleStickIncident.findUnique({
      where: { id },
      // The sheet is an English form, so it wants the employee's English name.
      // The stored staffName is the snapshot taken when the incident was
      // reported and stays the record of what was filed; it is the fallback
      // for anyone whose English name has not been entered yet.
      include: { employee: { select: { nameEn: true } } },
    }),
    getT(),
  ]);
  if (!incident) notFound();

  await writeAudit({
    user,
    action: "EXPORT",
    entity: "NeedleStickIncident",
    entityId: incident.id,
    summary: `فتح نموذج حادثة التعرض للطباعة: ${incident.staffName}`,
    meta: { employeeId: incident.employeeId, format: "PRINT_FORM" },
  });

  const incidentAt = parts(incident.incidentAt);
  const headSignedAt = parts(incident.headOfDepartmentSignedAt);
  const receivedAt = parts(incident.reportReceivedAt);
  const physicianSignedAt = parts(incident.physicianSignedAt);

  return (
    <div className={styles.root}>
      <div className={`${styles.toolbar} no-print`}>
        <div>
          <Link className="btn btn-ghost" href={`/needle-stick/${incident.id}`}>
            {t("action.back")}
          </Link>
          <span className="mx-2 inline-block">
            <PrintButton />
          </span>
        </div>
        <p className={styles.toolbarText}>{t("needle.printHint")}</p>
      </div>

      <article className={styles.sheet} aria-label={t("needle.reportTitle")}>
        <Image
          className={styles.template}
          src="/forms/needle-stick-template.png"
          alt=""
          width={1643}
          height={2466}
          sizes="(max-width: 900px) 100vw, 794px"
          priority
          unoptimized
        />

        <Value
          value={incident.employee.nameEn || incident.staffName}
          className={styles.staffName}
        />
        <Value value={incident.department} className={styles.department} />
        <Check
          show={incident.nature === "NEEDLE_STICK"}
          className={styles.needleCheck}
        />
        <Check show={incident.nature === "CUT"} className={styles.cutCheck} />
        <Check
          show={incident.nature === "SPLASH"}
          className={styles.splashCheck}
        />
        <Value
          value={
            incident.nature === "OTHER"
              ? incident.otherNature || t("needle.nature.OTHER")
              : null
          }
          className={styles.otherNature}
        />
        <Value
          value={incident.staffSignature}
          className={styles.staffSignature}
          signature
        />
        <Value value={incidentAt.date} className={styles.incidentDate} />
        <Value value={incidentAt.time} className={styles.incidentTime} />

        <Value
          value={incident.sourcePatientName}
          className={styles.sourceName}
        />
        <Value
          value={incident.sourcePatientFileNo}
          className={styles.sourceFile}
        />
        <Value value={incident.sourceWard} className={styles.sourceWard} />
        <Check
          show={incident.sourceBloodBorneHistory === false}
          className={styles.historyNo}
        />
        <Check
          show={incident.sourceBloodBorneHistory === true}
          className={styles.historyYes}
        />
        <Value
          value={incident.sourceBloodBorneDetails}
          className={styles.historyDetails}
        />

        <Check show={incident.actionWashing} className={styles.washingCheck} />
        <Check
          show={incident.actionIrrigation}
          className={styles.irrigationCheck}
        />
        <Check
          show={incident.actionEmployeeClinic}
          className={styles.clinicCheck}
        />
        <Check
          show={incident.actionImmunoglobulin}
          className={styles.immunoglobulinCheck}
        />

        <Value
          value={incident.headOfDepartmentName}
          className={styles.headName}
        />
        <Value
          value={incident.headOfDepartmentSignature}
          className={styles.headSignature}
          signature
        />
        <Value value={headSignedAt.date} className={styles.headDate} />
        <Value value={headSignedAt.time} className={styles.headTime} />

        <Value value={receivedAt.date} className={styles.receivedDate} />
        <Value value={receivedAt.time} className={styles.receivedTime} />

        <Value
          value={incident.patientHivResult}
          className={styles.patientHiv}
        />
        <Value
          value={incident.patientHbvResult}
          className={styles.patientHbv}
        />
        <Value
          value={incident.patientHcvResult}
          className={styles.patientHcv}
        />
        <Value
          value={incident.patientOtherResult}
          className={styles.patientOther}
        />
        <Value value={incident.staffHivResult} className={styles.staffHiv} />
        <Value value={incident.staffHbvResult} className={styles.staffHbv} />
        <Value value={incident.staffHcvResult} className={styles.staffHcv} />
        <Value
          value={incident.staffOtherResult}
          className={styles.staffOther}
        />

        <Value
          value={incident.recommendation}
          className={`${styles.recommendation}`}
        />
        <Value
          value={incident.physicianName}
          className={styles.physicianName}
        />
        <Value
          value={incident.physicianSignature}
          className={styles.physicianSignature}
          signature
        />
        <Value
          value={physicianSignedAt.date}
          className={styles.physicianDate}
        />
        <Value
          value={physicianSignedAt.time}
          className={styles.physicianTime}
        />

        {incident.status === "ENTERED_IN_ERROR" && (
          <span className={styles.voidMark}>
            {t("recordStatus.ENTERED_IN_ERROR")}
          </span>
        )}
      </article>
    </div>
  );
}
