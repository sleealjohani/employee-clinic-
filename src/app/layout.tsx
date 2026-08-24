import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { cookies } from "next/headers";
import { I18nProvider } from "@/lib/i18n/client";
import { LOCALE_COOKIE, normaliseLocale } from "@/lib/i18n";
import { THEME_COOKIE, normaliseTheme } from "@/lib/theme";
import "./globals.css";

const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "عيادة الموظف | مستشفى الحديثة العام",
    template: "%s | عيادة الموظف",
  },
  description: "نظام إدارة الملفات الصحية لموظفي مستشفى الحديثة العام — تجمع الجوف الصحي",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0c161c" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const locale = normaliseLocale(store.get(LOCALE_COOKIE)?.value);
  const theme = normaliseTheme(store.get(THEME_COOKIE)?.value);
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} data-theme={theme} className={plex.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
