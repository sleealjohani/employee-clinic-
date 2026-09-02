import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { clinicDateTime } from "@/lib/clinic-config";
import { ACTIVE_APPOINTMENT_STATUSES, availableSlots } from "@/lib/scheduling";
import { readClinicConfig } from "./settings";
export async function loadSlots(
  serviceId: string,
  day: string,
  tx: Prisma.TransactionClient = db,
) {
  const service = await tx.clinicService.findFirst({
    where: { id: serviceId, isActive: true, mode: "APPOINTMENT" },
  });
  if (!service) return [];
  const start = clinicDateTime(day),
    end = new Date(start.getTime() + 86400000);
  if (!Number.isFinite(start.getTime())) return [];
  const [config, appointments, blocks] = await Promise.all([
    readClinicConfig(tx),
    tx.appointment.findMany({
      where: {
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        startsAt: { lt: end },
        endsAt: { gt: start },
      },
      select: { startsAt: true, endsAt: true },
    }),
    tx.scheduleBlock.findMany({
      where: { startsAt: { lt: end }, endsAt: { gt: start } },
    }),
  ]);
  return availableSlots(
    day,
    service.durationMinutes,
    config,
    appointments,
    blocks,
  );
}
