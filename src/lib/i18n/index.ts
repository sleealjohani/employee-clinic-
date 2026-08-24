import { cookies } from "next/headers";
import { LOCALE_COOKIE, makeTranslator, normaliseLocale, type Translator } from "./core";

export * from "./core";

/** Server-side translator, read from the locale cookie. */
export async function getT(): Promise<Translator> {
  const store = await cookies();
  return makeTranslator(normaliseLocale(store.get(LOCALE_COOKIE)?.value));
}
