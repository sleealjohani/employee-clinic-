export const THEME_COOKIE = "clinic_theme";
export type Theme = "light" | "dark";

export function normaliseTheme(value: string | undefined | null): Theme {
  return value === "dark" ? "dark" : "light";
}
