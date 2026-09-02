"use client";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import {
  bookAppointment,
  getBookingSlots,
} from "@/server/actions/appointments";
import { Field } from "@/components/ui";
import { SubmitButton } from "@/components/ui/ActionForm";
import { clinicDay } from "@/lib/clinic-config";
type Service = {
  id: string;
  nameAr: string;
  nameEn: string;
  durationMinutes: number;
};
export function BookingForm({
  services,
  employees,
  initialService,
  enabled = true,
  bookingDays = 30,
}: {
  services: Service[];
  employees?: { id: string; name: string; employeeNo: string | null }[];
  initialService?: string;
  enabled?: boolean;
  bookingDays?: number;
}) {
  const t = useT();
  const [serviceId, setService] = useState(
    initialService || services[0]?.id || "",
  );
  const [day, setDay] = useState(clinicDay());
  const [selected, setSelected] = useState("");
  const [key, setKey] = useState("");
  const [slots, setSlots] = useState<
    Awaited<ReturnType<typeof getBookingSlots>>
  >([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [state, action] = useActionState(bookAppointment, {});
  useEffect(() => setKey(crypto.randomUUID()), []);
  useEffect(() => {
    let cancelled = false;
    setSelected("");
    setLoading(true);
    setLoadError(false);
    getBookingSlots(serviceId, day)
      .then((data) => {
        if (!cancelled) setSlots(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceId, day, state.error]);
  if (!enabled) return <p className="empty-state">{t("v2.bookingClosed")}</p>;
  if (state.ok)
    return (
      <div className="success-panel" role="status">
        <div className="success-check">✓</div>
        <h2>{t("v2.booked")}</h2>
        <Link
          className="btn btn-primary"
          href={employees ? "/appointments" : "/portal/appointments"}
        >
          {t(employees ? "v2.appointments" : "v2.myAppointments")}
        </Link>
      </div>
    );
  return (
    <form action={action} className="booking-form">
      <input type="hidden" name="requestKey" value={key} />
      <input type="hidden" name="startsAt" value={selected} />
      {employees && (
        <Field label={t("v2.selectEmployee")} required>
          <select name="employeeId" className="select" required defaultValue="">
            <option value="">{t("v2.selectEmployee")}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.employeeNo ? " · " + e.employeeNo : ""}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="form-grid">
        <Field label={t("v2.chooseService")} required>
          <select
            className="select"
            name="serviceId"
            value={serviceId}
            onChange={(e) => setService(e.target.value)}
          >
            {services.map((s) => (
              <option value={s.id} key={s.id}>
                {t.locale === "ar" ? s.nameAr : s.nameEn} ·{" "}
                {t("v2.minutes", { n: s.durationMinutes })}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("v2.chooseDate")} required>
          <input
            className="input"
            type="date"
            value={day}
            min={clinicDay()}
            max={clinicDay(new Date(Date.now() + bookingDays * 86400000))}
            onChange={(e) => setDay(e.target.value)}
          />
        </Field>
      </div>
      <fieldset className="slot-field">
        <legend className="label">{t("v2.chooseTime")}</legend>
        {loading ? (
          <p className="muted" role="status">
            {t("v2.loading")}
          </p>
        ) : loadError ? (
          <p role="alert" className="form-error">
            {t("common.error")}
          </p>
        ) : slots.some((s) => s.available) ? (
          <div className="time-slots">
            {slots
              .filter((s) => s.available)
              .map((s) => (
                <button
                  type="button"
                  key={s.start}
                  className="time-slot num"
                  aria-pressed={selected === s.start}
                  onClick={() => setSelected(s.start)}
                >
                  {new Intl.DateTimeFormat("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Riyadh",
                  }).format(new Date(s.start))}
                </button>
              ))}
          </div>
        ) : (
          <p className="empty-inline">{t("v2.noSlots")}</p>
        )}
      </fieldset>
      <Field label={t("v2.reason")} hint={t("v2.reasonOptional")}>
        <textarea
          className="textarea"
          name="reason"
          rows={3}
          maxLength={1000}
        />
      </Field>
      {state.error && (
        <p className="form-error" role="alert">
          {t(state.error)}
        </p>
      )}
      <SubmitButton
        label={t("v2.book")}
        disabled={!selected || !key || loading}
      />
    </form>
  );
}
