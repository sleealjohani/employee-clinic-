"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { makeTranslator, type Locale, type Translator } from "./core";

const I18nContext = createContext<Translator | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = useMemo(() => makeTranslator(locale), [locale]);
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

export function useT(): Translator {
  const t = useContext(I18nContext);
  if (!t) throw new Error("useT must be used inside <I18nProvider>");
  return t;
}
