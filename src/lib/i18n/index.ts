import type { Locale } from "./config";
import en from "./dictionaries/en";
import zhTW, { type Dictionary } from "./dictionaries/zh-TW";

export type { Dictionary };

const dictionaries: Record<Locale, Dictionary> = { "zh-TW": zhTW, en };

export function dictionaryFor(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/** 以 {key} 代入變數，例如 format(t.dashboard.welcome, { name }) */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}
