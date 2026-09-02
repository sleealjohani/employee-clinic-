import { getT } from "@/lib/i18n";
import { TESTS } from "@/lib/catalog/tests";
import { ActionForm } from "@/components/ui/ActionForm";
import { addManualImportItem } from "@/server/actions/import";
export async function ManualImportForm({
  batchId,
  employees,
}: {
  batchId: string;
  employees: { id: string; name: string; nationalId: string }[];
}) {
  const t = await getT();
  return (
    <ActionForm
      action={addManualImportItem}
      label={t("v2.addForReview")}
      className="stack mt-4"
    >
      <input type="hidden" name="batchId" value={batchId} />
      <p className="muted">{t("v2.manualResultHint")}</p>
      <div className="form-grid">
        <label className="field">
          {t("common.selectEmployee")}
          <select name="employeeId" className="select" required>
            <option value="">—</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {e.nationalId}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t("lab.test")}
          <select name="testCode" className="select" required>
            <option value="">—</option>
            {TESTS.map((v) => (
              <option key={v.code} value={v.code}>
                {t.locale === "ar" ? v.nameAr : v.nameEn}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t("v2.resultType")}
          <select name="resultType" className="select">
            <option value="QUANTITATIVE">{t("lab.quantitative")}</option>
            <option value="QUALITATIVE">{t("lab.qualitative")}</option>
          </select>
        </label>
        <label className="field">
          {t("v2.comparator")}
          <select className="select" name="comparator" dir="ltr">
            {Object.entries({
              EQ: "=",
              LT: "<",
              LE: "≤",
              GT: ">",
              GE: "≥",
            }).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t("lab.quantitative")}
          <input
            className="input num"
            name="valueNum"
            type="number"
            step="any"
            dir="ltr"
          />
        </label>
        <label className="field">
          {t("lab.qualitative")}
          <input className="input" name="valueText" maxLength={200} />
        </label>
        <label className="field">
          {t("lab.unit")}
          <input className="input" name="unit" dir="ltr" maxLength={80} />
        </label>
        <label className="field">
          {t("lab.collectedAt")}
          <input className="input" name="collectedAt" type="date" />
        </label>
        <label className="field">
          {t("v2.refLow")}
          <input className="input" name="refLow" type="number" step="any" />
        </label>
        <label className="field">
          {t("v2.refHigh")}
          <input className="input" name="refHigh" type="number" step="any" />
        </label>
        <label className="field">
          {t("common.page")}
          <input
            className="input"
            name="page"
            type="number"
            min={1}
            max={1000}
            defaultValue={1}
            required
          />
        </label>
      </div>
    </ActionForm>
  );
}
