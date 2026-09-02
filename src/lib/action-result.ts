import { Prisma } from "@prisma/client";
export type ResultState = { ok?: boolean; error?: string; id?: string };
export class ClinicError extends Error {
  constructor(public key: string) {
    super(key);
  }
}
export function actionError(error: unknown): ResultState {
  if (error instanceof ClinicError) return { error: error.key };
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2034"].includes(error.code)
  )
    return { error: "v2.conflict" };
  console.error(
    "[clinic-action]",
    error instanceof Error ? error.name : "UnknownError",
  );
  return { error: "common.error" };
}
