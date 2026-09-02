import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePath } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/rbac";
import { getT } from "@/lib/i18n";
import { writeAudit } from "@/lib/audit";
import {
  ageFrom,
  bmi,
  formatDate,
  formatDateTime,
  formatHijri,
} from "@/lib/format";
import { vitalOutOfRange } from "@/lib/clinical/rules";
import { profileCompletion } from "@/lib/clinic-config";
import { getClinicConfig } from "@/server/queries/settings";
import { hbvStatus, hbvTone } from "@/lib/clinical/hbv";
import { nextVaccineDue } from "@/lib/clinical/due";
import { OCCUPATIONAL_VACCINES, VACCINE_BY_CODE } from "@/lib/catalog/vaccines";
import {
  Alert,
  Card,
  Chip,
  Empty,
  KeyValue,
  LinkButton,
  Meter,
  PageHeader,
  SectionTitle,
} from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import {
  AllergyForm,
  EducationForm,
  LabForm,
  NoteForm,
  VaccinationForm,
  VisitForm,
  VoidRecordForm,
} from "@/components/forms/RecordForms";
import { RecordTabs, type TabKey } from "@/components/employee/RecordTabs";
import { LabResultRow } from "@/components/employee/LabResultRow";
import {
  ArchiveEmployeeButton,
  RestoreEmployeeButton,
} from "@/components/employee/ArchiveControls";
import { IconAllergy, IconPlus } from "@/components/layout/icons";

export const dynamic = "force-dynamic";

const TAB_KEYS: TabKey[] = [
  "overview",
  "visits",
  "labs",
  "allergies",
  "vaccines",
  "education",
  "notes",
];

export default async function EmployeeRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requirePath("/employees");
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const t = await getT();

  const tab: TabKey = TAB_KEYS.includes(rawTab as TabKey)
    ? (rawTab as TabKey)
    : "overview";

  const employee = await db.employee.findUnique({
    where: { id },
    include: {
      visits: {
        where: { status: { not: "ENTERED_IN_ERROR" } },
        orderBy: { visitDate: "desc" },
      },
      labResults: { orderBy: [{ collectedAt: "desc" }, { createdAt: "desc" }] },
      allergies: { orderBy: { recordedAt: "desc" } },
      vaccinations: {
        where: { status: "ACTIVE" },
        orderBy: { givenAt: "desc" },
      },
      educations: {
        where: { status: "ACTIVE" },
        orderBy: { providedAt: "desc" },
      },
      notes: {
        where: { status: "ACTIVE" },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      },
      employmentHistory: { orderBy: { effectiveFrom: "desc" } },
      createdBy: { select: { name: true } },
    },
  });

  if (!employee) notFound();

  const canWrite = can(user.role, "clinical.write") && !employee.isArchived;
  const canVoid = can(user.role, "clinical.void");
  const canEdit = can(user.role, "employee.write");

  const activeLabs = employee.labResults.filter(
    (l) => l.status !== "ENTERED_IN_ERROR",
  );
  const activeAllergies = employee.allergies.filter(
    (a) => a.allergyStatus === "ACTIVE" && a.status !== "ENTERED_IN_ERROR",
  );
  const severeAllergy = activeAllergies.some(
    (a) => a.severity === "SEVERE" || a.severity === "LIFE_THREATENING",
  );

  const hepBDoses = employee.vaccinations.filter(
    (v) => v.vaccineCode === "HEP_B",
  );
  const hbv = hbvStatus(
    activeLabs.map((l) => ({
      testCode: l.testCode,
      flag: l.flag,
      valueNum: l.valueNum,
      unit: l.unit,
      comparator: l.comparator,
      reviewedAt: l.reviewedAt,
      collectedAt: l.collectedAt,
    })),
    hepBDoses,
    t.locale,
  );

  const config = await getClinicConfig();
  const completion = profileCompletion(employee, config.requiredProfileFields);
  const c = { score: completion.percent, missing: completion.missing };
  const lastVisit = employee.visits[0];
  const lastLab = activeLabs[0];

  // Reading a record that carries blood-borne-virus serology is itself an event.
  if (
    activeLabs.some((l) =>
      ["HIV_AGAB", "HBSAG", "ANTI_HCV", "ANTI_HBC_TOTAL"].includes(l.testCode),
    )
  ) {
    await writeAudit({
      user,
      action: "VIEW_SENSITIVE",
      entity: "Employee",
      entityId: employee.id,
      summary: `اطلاع على ملف يحتوي نتائج مصلية حساسة: ${employee.name}`,
    });
  }

  const counts: Partial<Record<TabKey, number>> = {
    visits: employee.visits.length,
    labs: activeLabs.length,
    allergies: activeAllergies.length,
    vaccines: employee.vaccinations.length,
    education: employee.educations.length,
    notes: employee.notes.length,
  };

  const labels: Record<TabKey, string> = {
    overview: t("tab.overview"),
    visits: t("tab.visits"),
    labs: t("tab.labs"),
    allergies: t("tab.allergies"),
    vaccines: t("tab.vaccines"),
    education: t("tab.education"),
    notes: t("tab.notes"),
  };

  return (
    <>
      <PageHeader
        title={employee.name}
        subtitle={
          [employee.jobTitle, employee.department]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        badge={
          <>
            <Chip
              tone={employee.employmentStatus === "ACTIVE" ? "ok" : "neutral"}
              dot
            >
              {t(`empst.${employee.employmentStatus}`)}
            </Chip>
            {employee.isArchived && (
              <Chip tone="neutral">{t("emp.archived")}</Chip>
            )}
          </>
        }
        actions={
          <>
            <LinkButton
              href={`/employees?q=${encodeURIComponent(employee.nationalId)}`}
            >
              {t("action.back")}
            </LinkButton>
            {canEdit && (
              <LinkButton href={`/employees/${employee.id}/edit`}>
                {t("action.edit")}
              </LinkButton>
            )}
            {can(user.role, "employee.archive") &&
              (employee.isArchived ? (
                <RestoreEmployeeButton employeeId={employee.id} />
              ) : (
                <ArchiveEmployeeButton employeeId={employee.id} />
              ))}
          </>
        }
      />

      {activeAllergies.length > 0 && (
        <div className="mb-4">
          <Alert
            tone={severeAllergy ? "danger" : "warn"}
            title={t("allergy.banner")}
          >
            <span className="flex flex-wrap items-center gap-1.5">
              <IconAllergy size={15} />
              {activeAllergies.map((a) => (
                <span key={a.id} className="font-semibold">
                  {a.substance} ({t(`severity.${a.severity}`)})
                </span>
              ))}
            </span>
          </Alert>
        </div>
      )}

      {employee.isArchived && employee.archiveReason && (
        <div className="mb-4">
          <Alert tone="neutral">
            {t("action.archive")}: {employee.archiveReason} —{" "}
            {formatDate(employee.archivedAt, t.locale)}
          </Alert>
        </div>
      )}

      {/* summary strip */}
      <div className="stagger mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <KeyValue
            label={t("emp.nationalId")}
            value={<span dir="ltr">{employee.nationalId}</span>}
            mono
          />
          <div className="mt-2">
            <KeyValue
              label={t("emp.employeeNo")}
              value={employee.employeeNo ?? "—"}
              mono
            />
          </div>
        </Card>
        <Card>
          <KeyValue
            label={t("emp.bloodType")}
            value={
              employee.bloodType ? (
                <span dir="ltr">{employee.bloodType}</span>
              ) : (
                t("common.notRecorded")
              )
            }
          />
          <div className="mt-2">
            <KeyValue
              label={t("emp.age")}
              value={
                ageFrom(employee.dob)
                  ? `${ageFrom(employee.dob)}`
                  : t("common.notRecorded")
              }
              mono
            />
          </div>
        </Card>
        <Card>
          <p
            className="text-[0.7rem] font-semibold"
            style={{ color: "var(--text-faint)" }}
          >
            {t("emp.hbvStatus")}
          </p>
          <div className="mt-1">
            <Chip tone={hbvTone(hbv.status)} dot>
              {t(`hbv.${hbv.status}`)}
            </Chip>
          </div>
          {hbv.basis.length > 0 && (
            <p
              className="num mt-1.5 text-[0.68rem]"
              style={{ color: "var(--text-faint)" }}
              dir="ltr"
            >
              {hbv.basis.join(" · ")}
            </p>
          )}
        </Card>
        <Card>
          <div className="mb-1 flex items-center justify-between">
            <p
              className="text-[0.7rem] font-semibold"
              style={{ color: "var(--text-faint)" }}
            >
              {t("emp.completeness")}
            </p>
            <span className="num text-xs font-bold">{c.score}%</span>
          </div>
          <Meter
            value={c.score}
            tone={c.score === 100 ? "ok" : c.score >= 70 ? "accent" : "warn"}
          />
          {c.missing.length > 0 && (
            <p
              className="mt-1.5 text-[0.68rem]"
              style={{ color: "var(--text-faint)" }}
            >
              {t("emp.missingFields")}:{" "}
              {c.missing.map((f) => t("emp." + f)).join("، ")}
            </p>
          )}
        </Card>
      </div>

      <RecordTabs
        employeeId={employee.id}
        active={tab}
        labels={labels}
        counts={counts}
      />

      {/* ---------------------------------------------------------------- overview */}
      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <SectionTitle>{t("emp.title")}</SectionTitle>
            <dl className="grid gap-3 sm:grid-cols-3">
              <KeyValue
                label={t("emp.nameEn")}
                value={employee.nameEn ?? "—"}
              />
              {(
                [
                  "nationality",
                  "qualification",
                  "employmentType",
                  "assignedFacility",
                  "workLocation",
                  "personnelNotes",
                ] as const
              ).map((key) => (
                <KeyValue
                  key={key}
                  label={t("emp." + key)}
                  value={employee[key] || "—"}
                />
              ))}
              <KeyValue
                label={t("emp.gender")}
                value={employee.gender ? t(`gender.${employee.gender}`) : "—"}
              />
              <KeyValue
                label={t("emp.dob")}
                value={
                  employee.dob ? (
                    // Each date is one unbreakable run: a Hijri date split
                    // across lines reads as two different numbers.
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="num whitespace-nowrap" dir="ltr">
                        {formatDate(employee.dob, t.locale)}
                      </span>
                      <span
                        className="whitespace-nowrap text-xs"
                        style={{ color: "var(--text-faint)" }}
                      >
                        <span className="num" dir="ltr">
                          {formatHijri(employee.dob)}
                        </span>{" "}
                        هـ
                      </span>
                    </span>
                  ) : (
                    "—"
                  )
                }
              />
              <KeyValue
                label={t("emp.phone")}
                value={<span dir="ltr">{employee.phone ?? "—"}</span>}
                mono
              />
              <KeyValue
                label={t("emp.email")}
                value={<span dir="ltr">{employee.email ?? "—"}</span>}
              />
              <KeyValue
                label={t("emp.hireDate")}
                value={formatDate(employee.hireDate, t.locale)}
                mono
              />
              <KeyValue
                label={t("emp.chronic")}
                value={
                  employee.chronicConditions.length
                    ? employee.chronicConditions.join("، ")
                    : t("common.none")
                }
              />
              <KeyValue
                label={t("emp.medications")}
                value={
                  employee.currentMedications.length
                    ? employee.currentMedications.join("، ")
                    : t("common.none")
                }
              />
              <KeyValue
                label={t("emp.lastVisit")}
                value={
                  lastVisit
                    ? formatDate(lastVisit.visitDate, t.locale)
                    : t("common.none")
                }
                mono
              />
              <KeyValue
                label={t("emp.lastLab")}
                value={
                  lastLab
                    ? formatDate(lastLab.collectedAt, t.locale)
                    : t("common.none")
                }
                mono
              />
            </dl>
          </Card>

          <Card>
            <SectionTitle>{t("vac.title")}</SectionTitle>
            <ul className="space-y-2.5">
              {OCCUPATIONAL_VACCINES.map((vac) => {
                const doses = employee.vaccinations.filter(
                  (v) => v.vaccineCode === vac.code,
                );
                const next = nextVaccineDue(vac.code, doses);
                const overdue = next && next.dueDate < new Date();
                return (
                  <li
                    key={vac.code}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {t.locale === "ar" ? vac.nameAr : vac.nameEn}
                    </span>
                    {doses.length === 0 ? (
                      <Chip tone="warn">{t("common.none")}</Chip>
                    ) : next ? (
                      <Chip tone={overdue ? "danger" : "warn"}>
                        {overdue ? t("vac.overdue") : t("vac.dueSoon")}
                      </Chip>
                    ) : (
                      <Chip tone="ok" dot>
                        {t("vac.upToDate")}
                      </Chip>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          {employee.employmentHistory.length > 1 && (
            <Card className="lg:col-span-3">
              <SectionTitle>{t("emp.employmentStatus")}</SectionTitle>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{t("emp.department")}</th>
                      <th>{t("emp.jobTitle")}</th>
                      <th>{t("emp.employeeNo")}</th>
                      <th>{t("common.status")}</th>
                      <th>{t("rep.from")}</th>
                      <th>{t("rep.to")}</th>
                    </tr>
                  </thead>
                  <tbody className="row-in">
                    {employee.employmentHistory.map((h) => (
                      <tr key={h.id}>
                        <td>{h.department ?? "—"}</td>
                        <td>{h.jobTitle ?? "—"}</td>
                        <td className="num">{h.employeeNo ?? "—"}</td>
                        <td>{t(`empst.${h.status}`)}</td>
                        <td className="num">
                          {formatDate(h.effectiveFrom, t.locale)}
                        </td>
                        <td className="num">
                          {h.effectiveTo
                            ? formatDate(h.effectiveTo, t.locale)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- visits */}
      {tab === "visits" && (
        <Card pad={false}>
          <div className="flex items-center justify-between px-4 py-3">
            <SectionTitle>{t("visit.title")}</SectionTitle>
            {canWrite && (
              <Modal
                title={t("visit.new")}
                wide
                trigger={
                  <button className="btn btn-primary btn-sm">
                    <IconPlus /> {t("visit.new")}
                  </button>
                }
              >
                <VisitForm employeeId={employee.id} />
              </Modal>
            )}
          </div>
          {employee.visits.length === 0 ? (
            <Empty title={t("common.empty")} hint={t("common.emptyHint")} />
          ) : (
            <div className="border-t">
              {employee.visits.map((visit) => {
                const abnormal =
                  vitalOutOfRange("tempC", visit.tempC) ||
                  vitalOutOfRange("systolic", visit.systolic) ||
                  vitalOutOfRange("diastolic", visit.diastolic) ||
                  vitalOutOfRange("pulse", visit.pulse) ||
                  vitalOutOfRange("spo2", visit.spo2);
                const b = bmi(visit.weightKg, visit.heightCm);
                return (
                  <details key={visit.id} className="border-b last:border-b-0">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 hover:bg-[var(--surface-2)]">
                      <span className="num text-sm font-semibold">
                        {formatDate(visit.visitDate, t.locale)}
                      </span>
                      <Chip tone={visit.completedAt ? "ok" : "accent"}>
                        {t(
                          visit.completedAt ? "v2.completed" : "v2.inProgress",
                        )}
                      </Chip>
                      <Chip tone="accent">{t(`visitType.${visit.type}`)}</Chip>
                      <span
                        className="min-w-0 flex-1 truncate text-sm"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {visit.chiefComplaint ?? visit.diagnosis ?? "—"}
                      </span>
                      {abnormal && (
                        <Chip tone="warn">{t("visit.abnormalVitals")}</Chip>
                      )}
                    </summary>
                    <div
                      className="border-t px-4 py-4"
                      style={{ background: "var(--surface-2)" }}
                    >
                      <Link
                        className="btn btn-primary mb-4"
                        href={"/visits/" + visit.id}
                      >
                        {t("v2.openVisit")}
                      </Link>
                      <dl className="grid gap-3 sm:grid-cols-4">
                        <KeyValue
                          label={t("visit.temp")}
                          value={visit.tempC ?? "—"}
                          mono
                        />
                        <KeyValue
                          label={t("visit.bp")}
                          value={
                            visit.systolic && visit.diastolic
                              ? `${visit.systolic}/${visit.diastolic}`
                              : "—"
                          }
                          mono
                        />
                        <KeyValue
                          label={t("visit.pulse")}
                          value={visit.pulse ?? "—"}
                          mono
                        />
                        <KeyValue
                          label={t("visit.spo2")}
                          value={visit.spo2 ?? "—"}
                          mono
                        />
                        <KeyValue
                          label={t("visit.rr")}
                          value={visit.respRate ?? "—"}
                          mono
                        />
                        <KeyValue
                          label={t("visit.weight")}
                          value={visit.weightKg ?? "—"}
                          mono
                        />
                        <KeyValue
                          label={t("visit.height")}
                          value={visit.heightCm ?? "—"}
                          mono
                        />
                        <KeyValue
                          label={t("visit.bmi")}
                          value={b ?? "—"}
                          mono
                        />
                      </dl>
                      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                        <KeyValue
                          label={t("visit.chief")}
                          value={visit.chiefComplaint ?? "—"}
                        />
                        <KeyValue
                          label={t("visit.diagnosis")}
                          value={visit.diagnosis ?? "—"}
                        />
                        <KeyValue
                          label={t("visit.plan")}
                          value={visit.plan ?? "—"}
                        />
                        <KeyValue
                          label={t("common.notes")}
                          value={visit.notes ?? "—"}
                        />
                      </dl>
                      {canVoid && (
                        <div className="mt-4 no-print">
                          <Modal
                            title={t("action.void")}
                            trigger={
                              <button className="btn btn-ghost btn-sm">
                                {t("action.void")}
                              </button>
                            }
                          >
                            <VoidRecordForm entity="Visit" id={visit.id} />
                          </Modal>
                        </div>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ---------------------------------------------------------------- labs */}
      {tab === "labs" && (
        <Card pad={false}>
          <div className="flex items-center justify-between px-4 py-3">
            <SectionTitle>{t("lab.title")}</SectionTitle>
            {canWrite && (
              <Modal
                title={t("lab.new")}
                wide
                trigger={
                  <button className="btn btn-primary btn-sm">
                    <IconPlus /> {t("lab.new")}
                  </button>
                }
              >
                <LabForm employeeId={employee.id} sex={employee.gender} />
              </Modal>
            )}
          </div>
          {employee.labResults.length === 0 ? (
            <Empty title={t("common.empty")} hint={t("common.emptyHint")} />
          ) : (
            <div className="border-t">
              {employee.labResults.map((lab) => (
                <LabResultRow
                  key={lab.id}
                  lab={lab}
                  t={t}
                  canWrite={canWrite}
                  canVoid={canVoid}
                />
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ---------------------------------------------------------------- allergies */}
      {tab === "allergies" && (
        <Card pad={false}>
          <div className="flex items-center justify-between px-4 py-3">
            <SectionTitle>{t("allergy.title")}</SectionTitle>
            {canWrite && (
              <Modal
                title={t("allergy.new")}
                wide
                trigger={
                  <button className="btn btn-primary btn-sm">
                    <IconPlus /> {t("allergy.new")}
                  </button>
                }
              >
                <AllergyForm employeeId={employee.id} />
              </Modal>
            )}
          </div>
          {employee.allergies.length === 0 ? (
            <Empty title={t("emp.noAllergies")} hint={t("common.emptyHint")} />
          ) : (
            <div className="table-wrap border-t">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("allergy.substance")}</th>
                    <th>{t("allergy.type")}</th>
                    <th>{t("allergy.severity")}</th>
                    <th>{t("allergy.certainty")}</th>
                    <th>{t("allergy.reaction")}</th>
                    <th>{t("allergy.action")}</th>
                    <th>{t("allergy.state")}</th>
                    <th>{t("common.date")}</th>
                  </tr>
                </thead>
                <tbody className="row-in">
                  {employee.allergies.map((a) => (
                    <tr
                      key={a.id}
                      style={{
                        opacity: a.allergyStatus === "ACTIVE" ? 1 : 0.55,
                      }}
                    >
                      <td className="font-semibold">{a.substance}</td>
                      <td>{t(`allergyType.${a.type}`)}</td>
                      <td>
                        <Chip
                          tone={
                            a.severity === "LIFE_THREATENING"
                              ? "danger"
                              : a.severity === "SEVERE"
                                ? "danger"
                                : a.severity === "MODERATE"
                                  ? "warn"
                                  : "neutral"
                          }
                        >
                          {t(`severity.${a.severity}`)}
                        </Chip>
                      </td>
                      <td>{t(`certainty.${a.certainty}`)}</td>
                      <td>{a.reaction ?? "—"}</td>
                      <td>{a.action ?? "—"}</td>
                      <td>{t(`allergyStatus.${a.allergyStatus}`)}</td>
                      <td className="num">
                        {formatDate(a.recordedAt, t.locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ---------------------------------------------------------------- vaccines */}
      {tab === "vaccines" && (
        <div className="space-y-4">
          <Card>
            <SectionTitle
              action={
                canWrite ? (
                  <Modal
                    title={t("vac.new")}
                    wide
                    trigger={
                      <button className="btn btn-primary btn-sm">
                        <IconPlus /> {t("vac.new")}
                      </button>
                    }
                  >
                    <VaccinationForm employeeId={employee.id} />
                  </Modal>
                ) : null
              }
            >
              {t("vac.series")}
            </SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {OCCUPATIONAL_VACCINES.map((vac) => {
                const doses = employee.vaccinations.filter(
                  (v) => v.vaccineCode === vac.code,
                );
                const next = nextVaccineDue(vac.code, doses);
                const pct = Math.min(
                  100,
                  Math.round((doses.length / vac.doses) * 100),
                );
                const overdue = next && next.dueDate < new Date();
                return (
                  <div key={vac.code} className="rounded-xl border p-3">
                    <p className="text-sm font-bold">
                      {t.locale === "ar" ? vac.nameAr : vac.nameEn}
                    </p>
                    <p
                      className="num mt-0.5 text-xs"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {doses.length} / {vac.doses}
                    </p>
                    <div className="mt-2">
                      <Meter value={pct} tone={pct === 100 ? "ok" : "warn"} />
                    </div>
                    <div className="mt-2">
                      {next ? (
                        <Chip tone={overdue ? "danger" : "warn"}>
                          {t("vac.nextDue")}:{" "}
                          {formatDate(next.dueDate, t.locale)}
                        </Chip>
                      ) : (
                        <Chip tone="ok" dot>
                          {t("vac.seriesComplete")}
                        </Chip>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card pad={false}>
            {employee.vaccinations.length === 0 ? (
              <Empty title={t("common.empty")} hint={t("common.emptyHint")} />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{t("vac.vaccine")}</th>
                      <th>{t("vac.dose")}</th>
                      <th>{t("vac.givenAt")}</th>
                      <th>{t("vac.lot")}</th>
                      <th>{t("vac.site")}</th>
                      <th>{t("vac.provider")}</th>
                    </tr>
                  </thead>
                  <tbody className="row-in">
                    {employee.vaccinations.map((v) => (
                      <tr key={v.id}>
                        <td className="font-semibold">
                          {VACCINE_BY_CODE[v.vaccineCode]
                            ? t.locale === "ar"
                              ? VACCINE_BY_CODE[v.vaccineCode].nameAr
                              : VACCINE_BY_CODE[v.vaccineCode].nameEn
                            : v.vaccineName}
                        </td>
                        <td className="num">{v.doseNumber}</td>
                        <td className="num">
                          {formatDate(v.givenAt, t.locale)}
                        </td>
                        <td className="num" dir="ltr">
                          {v.lotNumber ?? "—"}
                        </td>
                        <td>{v.site ?? "—"}</td>
                        <td>{v.provider ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------------- education */}
      {tab === "education" && (
        <Card pad={false}>
          <div className="flex items-center justify-between px-4 py-3">
            <SectionTitle>{t("edu.title")}</SectionTitle>
            {canWrite && (
              <Modal
                title={t("edu.new")}
                wide
                trigger={
                  <button className="btn btn-primary btn-sm">
                    <IconPlus /> {t("edu.new")}
                  </button>
                }
              >
                <EducationForm employeeId={employee.id} />
              </Modal>
            )}
          </div>
          {employee.educations.length === 0 ? (
            <Empty title={t("common.empty")} hint={t("common.emptyHint")} />
          ) : (
            <div className="table-wrap border-t">
              <table className="data">
                <thead>
                  <tr>
                    <th>{t("edu.topic")}</th>
                    <th>{t("edu.method")}</th>
                    <th>{t("edu.providedAt")}</th>
                    <th>{t("common.notes")}</th>
                  </tr>
                </thead>
                <tbody className="row-in">
                  {employee.educations.map((e) => (
                    <tr key={e.id}>
                      <td className="font-semibold">{e.topic}</td>
                      <td>{e.method ?? "—"}</td>
                      <td className="num">
                        {formatDate(e.providedAt, t.locale)}
                      </td>
                      <td>{e.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ---------------------------------------------------------------- notes */}
      {tab === "notes" && (
        <Card pad={false}>
          <div className="flex items-center justify-between px-4 py-3">
            <SectionTitle>{t("note.title")}</SectionTitle>
            {canWrite && (
              <Modal
                title={t("note.new")}
                trigger={
                  <button className="btn btn-primary btn-sm">
                    <IconPlus /> {t("note.new")}
                  </button>
                }
              >
                <NoteForm employeeId={employee.id} />
              </Modal>
            )}
          </div>
          {employee.notes.length === 0 ? (
            <Empty title={t("common.empty")} hint={t("common.emptyHint")} />
          ) : (
            <ul className="border-t">
              {employee.notes.map((n) => (
                <li key={n.id} className="border-b px-4 py-3 last:border-b-0">
                  <div className="mb-1 flex items-center gap-2">
                    {n.isPinned && (
                      <Chip tone="accent">{t("note.pinned")}</Chip>
                    )}
                    <span
                      className="num text-xs"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {formatDateTime(n.createdAt, t.locale)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <p className="mt-6 text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
        {t("common.recordedBy")}: {employee.createdBy?.name ?? "—"} ·{" "}
        <span className="num">
          {formatDateTime(employee.createdAt, t.locale)}
        </span>
        {" · "}
        <Link
          href={`/audit?entity=Employee&entityId=${employee.id}`}
          style={{ color: "var(--accent-text)" }}
        >
          {t("audit.title")}
        </Link>
      </p>
    </>
  );
}
