import { dictionaries, type DictKey, type Locale } from "./dict";
import { v2Dictionaries } from "./v2";

export const LOCALE_COOKIE = "clinic_locale";
export const DEFAULT_LOCALE: Locale = "ar";

export type Translator = ((
  key: DictKey | string,
  vars?: Record<string, string | number>,
) => string) & {
  locale: Locale;
  dir: "rtl" | "ltr";
  /** A missing key renders as the key itself, so callers that build a key at
   *  runtime (`${error}.hint`) must be able to ask before they render it. */
  has: (key: DictKey | string) => boolean;
};

export function makeTranslator(locale: Locale): Translator {
  const dict = {
    ...(dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE]),
    ...v2Dictionaries[locale],
  };
  const t = ((key: string, vars?: Record<string, string | number>) => {
    let out: string = (dict as Record<string, string>)[key] ?? key;
    if (vars)
      for (const [k, v] of Object.entries(vars))
        out = out.replaceAll(`{${k}}`, String(v));
    return out;
  }) as Translator;
  t.locale = locale;
  t.dir = locale === "ar" ? "rtl" : "ltr";
  t.has = (key: string) => Object.hasOwn(dict as Record<string, string>, key);
  return t;
}

export function normaliseLocale(value: string | undefined | null): Locale {
  return value === "en" ? "en" : DEFAULT_LOCALE;
}

export type { DictKey, Locale };
