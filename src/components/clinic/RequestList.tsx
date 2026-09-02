import Link from "next/link";
import type { ServiceRequest, ClinicService } from "@prisma/client";
import { getT } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { Chip, Empty, Field } from "@/components/ui";
import { ActionForm } from "@/components/ui/ActionForm";
import { respondToRequest } from "@/server/actions/requests";
export async function RequestList({
  requests,
  staff = false,
}: {
  requests: (ServiceRequest & {
    service: ClinicService | null;
    employee?: { id: string; name: string };
  })[];
  staff?: boolean;
}) {
  const t = await getT();
  if (!requests.length) return <Empty title={t("v2.noRequests")} />;
  return (
    <div className="request-list">
      {requests.map((request) => (
        <article key={request.id} className="request-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3>
              {request.kind === "PROFILE_UPDATE"
                ? t("v2.profileRequest")
                : request.service
                  ? t.locale === "ar"
                    ? request.service.nameAr
                    : request.service.nameEn
                  : request.subject}
            </h3>
            <Chip
              tone={
                request.status === "COMPLETED"
                  ? "ok"
                  : request.status === "OPEN"
                    ? "accent"
                    : "neutral"
              }
            >
              {t("v2.status." + request.status)}
            </Chip>
          </div>
          <p className="muted">
            <span className="num">
              {formatDateTime(request.createdAt, t.locale)}
            </span>
            {staff && request.employee && (
              <>
                {" "}
                ·{" "}
                <Link
                  className="text-link"
                  href={"/employees/" + request.employee.id}
                >
                  {request.employee.name}
                </Link>
              </>
            )}
          </p>
          {request.kind !== "PROFILE_UPDATE" && (
            <p className="whitespace-pre-wrap mt-3">{request.message}</p>
          )}
          {request.kind === "PROFILE_UPDATE" &&
            request.payload &&
            typeof request.payload === "object" &&
            !Array.isArray(request.payload) && (
              <details className="review-details">
                <summary>{t("v2.proposedChanges")}</summary>
                <dl className="form-grid">
                  {Object.entries(request.payload)
                    .filter(([key]) =>
                      [
                        "phone",
                        "email",
                        "dob",
                        "gender",
                        "nationality",
                        "qualification",
                        "workLocation",
                      ].includes(key),
                    )
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt className="label">{t("emp." + key)}</dt>
                        <dd>
                          {key === "gender" && value
                            ? t("gender." + value)
                            : String(value || "—")}
                        </dd>
                      </div>
                    ))}
                </dl>
              </details>
            )}
          {request.response && (
            <div className="clinic-response">
              <strong>{t("v2.response")}</strong>
              <p className="whitespace-pre-wrap">{request.response}</p>
            </div>
          )}
          {["OPEN", "IN_PROGRESS"].includes(request.status) &&
            (staff ? (
              <ActionForm
                action={respondToRequest}
                className="request-response"
                label={t("action.save")}
                success={false}
              >
                <input type="hidden" name="id" value={request.id} />
                <Field label={t("v2.response")}>
                  <textarea
                    className="textarea"
                    name="response"
                    rows={2}
                    maxLength={2000}
                  />
                </Field>
                <Field label={t("common.status")}>
                  <select
                    className="select"
                    name="status"
                    defaultValue={
                      request.status === "OPEN" ? "IN_PROGRESS" : "COMPLETED"
                    }
                  >
                    <option value="IN_PROGRESS">{t("v2.startRequest")}</option>
                    <option value="COMPLETED">
                      {t(
                        request.kind === "PROFILE_UPDATE"
                          ? "v2.approveProfile"
                          : "v2.completeRequest",
                      )}
                    </option>
                    <option value="DECLINED">{t("v2.declineRequest")}</option>
                  </select>
                </Field>
              </ActionForm>
            ) : (
              <ActionForm
                action={respondToRequest}
                label={t("v2.cancelRequest")}
                danger
                success={false}
                className="mt-4"
              >
                <input type="hidden" name="id" value={request.id} />
                <input type="hidden" name="status" value="CANCELLED" />
              </ActionForm>
            ))}
        </article>
      ))}
    </div>
  );
}
