import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current-user";
import { getClinicConfig } from "@/server/queries/settings";
import { getT } from "@/lib/i18n";
import { PROFILE_FIELDS } from "@/lib/clinic-config";
import { formatDateTime } from "@/lib/format";
import { saveClinicSettings, saveService } from "@/server/actions/settings";
import {
  saveScheduleBlock,
  removeScheduleBlock,
} from "@/server/actions/appointments";
import { Card, PageHeader, Field, Chip } from "@/components/ui";
import { ActionForm } from "@/components/ui/ActionForm";
import type { ClinicService } from "@prisma/client";
export default async function SettingsPage() {
  await requirePermission("users.manage");
  const t = await getT();
  const [config, services, blocks] = await Promise.all([
    getClinicConfig(),
    db.clinicService.findMany({ orderBy: { sortOrder: "asc" } }),
    db.scheduleBlock.findMany({
      where: { endsAt: { gt: new Date() } },
      orderBy: { startsAt: "asc" },
    }),
  ]);
  const textFields = [
    "nameAr",
    "nameEn",
    "welcomeAr",
    "welcomeEn",
    "locationAr",
    "locationEn",
    "contactPhone",
  ] as const;
  const numbers = [
    "slotMinutes",
    "capacity",
    "bookingDays",
    "minimumNoticeHours",
    "cancellationHours",
    "maxActiveBookings",
  ] as const;
  const ranges = {
    slotMinutes: [10, 60],
    capacity: [1, 20],
    bookingDays: [1, 90],
    minimumNoticeHours: [0, 72],
    cancellationHours: [0, 48],
    maxActiveBookings: [1, 10],
  };
  async function ServiceEditor({ service }: { service?: ClinicService }) {
    return (
      <ActionForm action={saveService} className="stack-form">
        <input name="id" type="hidden" value={service?.id || ""} />
        <div className="form-grid">
          {(
            ["nameAr", "nameEn", "descriptionAr", "descriptionEn"] as const
          ).map((f) => (
            <Field key={f} label={t("v2." + f)} required={f.startsWith("name")}>
              <input
                className="input"
                name={f}
                required={f.startsWith("name")}
                defaultValue={service?.[f] || ""}
                maxLength={f.startsWith("name") ? 100 : 500}
                dir={f.endsWith("En") ? "ltr" : "rtl"}
              />
            </Field>
          ))}
          <Field label={t("v2.serviceMode")}>
            <select
              className="select"
              name="mode"
              defaultValue={service?.mode || "APPOINTMENT"}
            >
              <option value="APPOINTMENT">{t("v2.mode.APPOINTMENT")}</option>
              <option value="REQUEST">{t("v2.mode.REQUEST")}</option>
            </select>
          </Field>
          <Field label={t("visit.type")}>
            <select
              className="select"
              name="visitType"
              defaultValue={service?.visitType || "CONSULTATION"}
            >
              {[
                "CONSULTATION",
                "ACUTE_CARE",
                "FOLLOW_UP",
                "PRE_EMPLOYMENT",
                "PERIODIC",
                "VACCINATION",
                "INJURY",
                "EXPOSURE",
                "OTHER",
              ].map((v) => (
                <option value={v} key={v}>
                  {t("visitType." + v)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("v2.duration")}>
            <input
              className="input"
              name="durationMinutes"
              type="number"
              min={10}
              max={180}
              defaultValue={service?.durationMinutes || 20}
              required
            />
          </Field>
          <Field label={t("v2.order")}>
            <input
              className="input"
              name="sortOrder"
              type="number"
              min={0}
              max={999}
              defaultValue={service?.sortOrder || 0}
              required
            />
          </Field>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={service?.isActive ?? true}
          />
          {t("v2.active")}
        </label>
      </ActionForm>
    );
  }
  return (
    <>
      <PageHeader title={t("v2.settings")} subtitle={t("v2.scheduleHint")} />
      <ActionForm action={saveClinicSettings} className="settings-form">
        <Card>
          <h2 className="section-title">{t("v2.branding")}</h2>
          <div className="form-grid">
            {textFields.map((f) => (
              <Field
                key={f}
                label={t("v2." + f)}
                required={f.startsWith("name")}
              >
                <input
                  className="input"
                  name={f}
                  defaultValue={config[f]}
                  maxLength={
                    f.startsWith("welcome")
                      ? 300
                      : f.startsWith("name")
                        ? 100
                        : 160
                  }
                  required={f.startsWith("name")}
                  dir={f.endsWith("En") ? "ltr" : undefined}
                />
              </Field>
            ))}
            <Field label={t("v2.accent")}>
              <select
                className="select"
                name="accent"
                defaultValue={config.accent}
              >
                {["teal", "blue", "violet"].map((c) => (
                  <option key={c} value={c}>
                    {t("v2." + c)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <label className="check-label mt-4">
            <input
              type="checkbox"
              name="motion"
              defaultChecked={config.motion}
            />
            {t("v2.motion")}
          </label>
        </Card>
        <Card>
          <h2 className="section-title">{t("v2.scheduling")}</h2>
          <fieldset>
            <legend className="label">{t("v2.workingDays")}</legend>
            <div className="weekday-options">
              {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                <label className="check-label" key={n}>
                  <input
                    type="checkbox"
                    name="workingDays"
                    value={n}
                    defaultChecked={config.workingDays.includes(n)}
                  />
                  {new Intl.DateTimeFormat(t.locale, {
                    weekday: "long",
                    timeZone: "UTC",
                  }).format(new Date(Date.UTC(2026, 7, 30 + n)))}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="form-grid mt-5">
            {(["opensAt", "closesAt"] as const).map((f) => (
              <Field key={f} label={t("v2." + f)} required>
                <input
                  className="input"
                  name={f}
                  type="time"
                  defaultValue={config[f]}
                  required
                />
              </Field>
            ))}
            {numbers.map((f) => (
              <Field key={f} label={t("v2." + f)} required>
                <input
                  className="input"
                  name={f}
                  type="number"
                  min={ranges[f][0]}
                  max={ranges[f][1]}
                  defaultValue={config[f]}
                  required
                />
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap gap-6 mt-5">
            {(["employeeBooking", "autoConfirm"] as const).map((f) => (
              <label key={f} className="check-label">
                <input type="checkbox" name={f} defaultChecked={config[f]} />
                {t("v2." + f)}
              </label>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="section-title">{t("v2.requiredFields")}</h2>
          <div className="form-grid">
            {PROFILE_FIELDS.map((f) => (
              <label key={f} className="check-label">
                <input
                  type="checkbox"
                  name="requiredProfileFields"
                  value={f}
                  defaultChecked={config.requiredProfileFields.includes(f)}
                />
                {t("emp." + f)}
              </label>
            ))}
          </div>
        </Card>
      </ActionForm>
      <section className="mt-8">
        <h2 className="section-title">{t("v2.services")}</h2>
        <div className="settings-services">
          {services.map((s) => (
            <details key={s.id} className="card">
              <summary className="service-editor-title">
                <strong>{t.locale === "ar" ? s.nameAr : s.nameEn}</strong>
                <Chip tone={s.isActive ? "ok" : "neutral"}>
                  {t("v2.mode." + s.mode)}
                </Chip>
                <span>{t("v2.editService")}</span>
              </summary>
              <div className="card-pad">
                <ServiceEditor service={s} />
              </div>
            </details>
          ))}
          <details className="card">
            <summary className="service-editor-title">
              <strong>＋ {t("v2.addService")}</strong>
            </summary>
            <div className="card-pad">
              <ServiceEditor />
            </div>
          </details>
        </div>
      </section>
      <div className="content-columns mt-8">
        <Card>
          <h2 className="section-title">{t("v2.blockTime")}</h2>
          <ActionForm
            action={saveScheduleBlock}
            label={t("v2.blockTime")}
            className="stack-form"
          >
            <div className="form-grid">
              <Field label={t("v2.from")} required>
                <input
                  className="input"
                  type="datetime-local"
                  name="startsAt"
                  required
                />
              </Field>
              <Field label={t("v2.to")} required>
                <input
                  className="input"
                  type="datetime-local"
                  name="endsAt"
                  required
                />
              </Field>
            </div>
            <Field label={t("v2.blockReason")} required>
              <input
                className="input"
                name="reason"
                minLength={3}
                maxLength={300}
                required
              />
            </Field>
          </ActionForm>
        </Card>
        <Card>
          <h2 className="section-title">{t("v2.blocks")}</h2>
          {blocks.length ? (
            blocks.map((b) => (
              <div className="block-row" key={b.id}>
                <p>{b.reason}</p>
                <p className="muted num">
                  {formatDateTime(b.startsAt, t.locale)} —{" "}
                  {formatDateTime(b.endsAt, t.locale)}
                </p>
                <ActionForm
                  action={removeScheduleBlock}
                  label={t("v2.reopen")}
                  success={false}
                >
                  <input type="hidden" name="id" value={b.id} />
                </ActionForm>
              </div>
            ))
          ) : (
            <p className="muted">{t("v2.noBlocks")}</p>
          )}
        </Card>
      </div>
    </>
  );
}
