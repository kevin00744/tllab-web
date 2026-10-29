import "server-only";
import { cookies } from "next/headers";

import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { dictionaryFor } from ".";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : defaultLocale;
}

export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: dictionaryFor(locale) };
}
