import type { AdvancedScenarioResult, Language } from "./types";

export function localized(language: Language, tr: string, az: string, en: string): string {
  if (language === "tr") return tr;
  if (language === "az") return az;
  return en;
}

export function localeTag(language: Language): string {
  if (language === "tr") return "tr-TR";
  if (language === "az") return "az-AZ";
  return "en-GB";
}

export function apiLanguage(language: Language): "tr" | "en" {
  return language === "en" ? "en" : "tr";
}

export function scenarioName(language: Language, scenario: Pick<AdvancedScenarioResult, "key" | "type" | "title">): string {
  if (scenario.type === "baseline") return localized(language, "Mevcut koridor", "Mövcud koridor", "Current corridor");
  if (scenario.type === "closure") return localized(language, "Güvenli bağlantı kapatma", "Təhlükəsiz bağlantı bağlanması", "Safe link closure");
  if (scenario.type === "signal") return localized(language, "Akıllı sinyal", "Ağıllı siqnal", "Adaptive signal");
  if (scenario.type === "emergencyPriority") return localized(language, "Acil araç önceliği", "Təcili nəqliyyat prioriteti", "Emergency priority");
  if (scenario.type === "newRoad") {
    if (scenario.key.includes("two-way")) return localized(language, "Yeni yol · Çift yön", "Yeni yol · İki istiqamət", "New road · Two-way");
    if (scenario.key.includes("one-way")) return localized(language, "Yeni yol · Tek yön", "Yeni yol · Bir istiqamət", "New road · One-way");
    return localized(language, "Çizilen yeni yol", "Çəkilmiş yeni yol", "Drawn new road");
  }
  return scenario.title;
}
