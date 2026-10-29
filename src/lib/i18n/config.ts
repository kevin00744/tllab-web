export const locales = ["zh-TW", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "zh-TW";
export const LOCALE_COOKIE = "locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
