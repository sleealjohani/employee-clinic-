import { requireEmployee } from "@/server/queries/portal";
import { getClinicConfig } from "@/server/queries/settings";
import { profileCompletion } from "@/lib/clinic-config";
import { getT } from "@/lib/i18n";
import { formatDate, toDateInput } from "@/lib/format";
import { Card, PageHeader, Field, KeyValue, Meter } from "@/components/ui";
import { ActionForm } from "@/components/ui/ActionForm";
import { requestProfileUpdate } from "@/server/actions/requests";
export default async function ProfilePage() {
  const { employee } = await requireEmployee();
  const t = await getT();
  const config = await getClinicConfig();
  const completion = profileCompletion(employee, config.requiredProfileFields);
  return (
    <>
      <PageHeader
        title={t("v2.myProfile")}
        subtitle={t("v2.profileReviewHint")}
      />
      <div className="content-columns">
        <Card>
          <h2 className="section-title">{employee.name}</h2>
          <dl className="form-grid">
            <KeyValue
              label={t("emp.nationalId")}
              value={employee.nationalId}
              mono
            />
            <KeyValue
              label={t("emp.employeeNo")}
              value={employee.employeeNo}
              mono
            />
            <KeyValue label={t("emp.department")} value={employee.department} />
            <KeyValue label={t("emp.jobTitle")} value={employee.jobTitle} />
            <KeyValue
              label={t("emp.hireDate")}
              value={formatDate(employee.hireDate, t.locale)}
            />
            <KeyValue
              label={t("emp.employmentType")}
              value={employee.employmentType}
            />
          </dl>
          <div className="completion-summary">
            <strong>
              {t("v2.profileComplete")} ·{" "}
              <span className="num">{completion.percent}%</span>
            </strong>
            <Meter value={completion.percent} />
            <p className="muted">{t("v2.profileDefinition")}</p>
          </div>
        </Card>
        <Card>
          <ActionForm
            action={requestProfileUpdate}
            label={t("v2.sendRequest")}
            className="stack-form"
          >
            <div className="form-grid">
              <Field label={t("emp.phone")}>
                <input
                  className="input"
                  type="tel"
                  name="phone"
                  dir="ltr"
                  defaultValue={employee.phone || ""}
                  maxLength={15}
                />
              </Field>
              <Field label={t("emp.email")}>
                <input
                  className="input"
                  type="email"
                  name="email"
                  dir="ltr"
                  defaultValue={employee.email || ""}
                />
              </Field>
              <Field label={t("emp.dob")}>
                <input
                  className="input"
                  type="date"
                  name="dob"
                  defaultValue={toDateInput(employee.dob)}
                />
              </Field>
              <Field label={t("emp.gender")}>
                <select
                  className="select"
                  name="gender"
                  defaultValue={employee.gender || ""}
                >
                  <option value="">—</option>
                  <option value="MALE">{t("gender.MALE")}</option>
                  <option value="FEMALE">{t("gender.FEMALE")}</option>
                </select>
              </Field>
              {(["nationality", "qualification", "workLocation"] as const).map(
                (f) => (
                  <Field key={f} label={t("emp." + f)}>
                    <input
                      className="input"
                      name={f}
                      defaultValue={employee[f] || ""}
                      maxLength={160}
                    />
                  </Field>
                ),
              )}
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
