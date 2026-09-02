import Link from "next/link";
import { db } from "@/lib/db";
import { requireEmployee } from "@/server/queries/portal";
import { getClinicConfig } from "@/server/queries/settings";
import { getT } from "@/lib/i18n";
import {
  profileCompletion,
  clinicDay,
  clinicDateTime,
} from "@/lib/clinic-config";
import { Card, Chip, Meter, SectionTitle } from "@/components/ui";
import { AppointmentList } from "@/components/clinic/AppointmentList";
import {
  IconVisit,
  IconLab,
  IconVaccine,
  IconEmployees,
} from "@/components/layout/icons";
export default async function PortalPage() {
  const { employee, user } = await requireEmployee();
  const t = await getT();
  const [config, appointments, services, labs, vaccinations, requests] =
    await Promise.all([
      getClinicConfig(),
      db.appointment.findMany({
        where: {
          employeeId: employee.id,
          status: { in: ["CONFIRMED", "REQUESTED", "CHECKED_IN"] },
          startsAt: { gte: clinicDateTime(clinicDay()) },
        },
        include: { service: true },
        orderBy: { startsAt: "asc" },
        take: 3,
      }),
      db.clinicService.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
      db.labResult.count({
        where: {
          employeeId: employee.id,
          status: "ACTIVE",
          releasedAt: { not: null },
        },
      }),
      db.vaccination.count({
        where: { employeeId: employee.id, status: "ACTIVE" },
      }),
      db.serviceRequest.count({
        where: {
          employeeId: employee.id,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      }),
    ]);
  const completion = profileCompletion(employee, config.requiredProfileFields);
  return (
    <div className="portal-page">
      <header className="welcome-panel">
        <div>
          <span className="eyebrow">{t("v2.portal")}</span>
          <h1>{t("v2.welcome", { name: user.name.split(" ")[0] })}</h1>
          <p>{t.locale === "ar" ? config.welcomeAr : config.welcomeEn}</p>
          <Link href="/portal/appointments/new" className="btn btn-white">
            {t("v2.book")} <span aria-hidden>↗</span>
          </Link>
        </div>
        <div className="welcome-emblem" aria-hidden>
          <IconVisit size={74} />
        </div>
      </header>
      <div className="metric-grid">
        <Link href="/portal/profile" className="metric-card">
          <span className="metric-icon">
            <IconEmployees />
          </span>
          <span className="metric-label">{t("v2.profileComplete")}</span>
          <strong className="num">
            {completion.percent}
            <small>%</small>
          </strong>
          <Meter value={completion.percent} />
        </Link>
        <Link href="/portal/records" className="metric-card">
          <span className="metric-icon">
            <IconLab />
          </span>
          <span className="metric-label">{t("v2.releasedLabs")}</span>
          <strong className="num">{labs}</strong>
        </Link>
        <Link href="/portal/records" className="metric-card">
          <span className="metric-icon">
            <IconVaccine />
          </span>
          <span className="metric-label">{t("v2.recordedVaccines")}</span>
          <strong className="num">{vaccinations}</strong>
        </Link>
        <Link href="/portal/requests" className="metric-card">
          <span className="metric-icon">
            <IconVisit />
          </span>
          <span className="metric-label">{t("v2.status.IN_PROGRESS")}</span>
          <strong className="num">{requests}</strong>
        </Link>
      </div>
      <div className="content-columns">
        <Card>
          <SectionTitle
            action={
              <Link className="text-link" href="/portal/appointments">
                {t("v2.viewAll")}
              </Link>
            }
          >
            {t("v2.upcoming")}
          </SectionTitle>
          <AppointmentList appointments={appointments} />
        </Card>
        <Card>
          <SectionTitle>{t("v2.profileComplete")}</SectionTitle>
          <div className="completion-number num">
            {completion.percent}
            <small>%</small>
          </div>
          <Meter value={completion.percent} />
          <p className="muted mt-4">{t("v2.profileDefinition")}</p>
          {completion.missing.length ? (
            <>
              <div className="tag-list mt-4">
                {completion.missing.map((f) => (
                  <Chip key={f} tone="warn">
                    {t("emp." + f)}
                  </Chip>
                ))}
              </div>
              <Link className="btn btn-primary mt-5" href="/portal/profile">
                {t("v2.completeProfile")}
              </Link>
            </>
          ) : (
            <p className="form-success mt-4">{t("v2.allComplete")}</p>
          )}
        </Card>
      </div>
      <section>
        <SectionTitle>{t("v2.services")}</SectionTitle>
        <div className="service-grid">
          {services.map((service, i) => (
            <Link
              key={service.id}
              className="service-card"
              href={
                service.mode === "APPOINTMENT"
                  ? "/portal/appointments/new?service=" + service.id
                  : "/portal/requests?service=" + service.id
              }
            >
              <span className="service-number num">
                {String(i + 1).padStart(2, "0")}
              </span>
              <Chip tone="accent">{t("v2.mode." + service.mode)}</Chip>
              <h3>{t.locale === "ar" ? service.nameAr : service.nameEn}</h3>
              <p>
                {t.locale === "ar"
                  ? service.descriptionAr
                  : service.descriptionEn}
              </p>
              <span className="service-arrow" aria-hidden>
                ↗
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
