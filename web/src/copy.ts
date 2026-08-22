import type { Language } from "./types";

const copy = {
  tr: {
    brand: "Braess Lab",
    descriptor: "Braess paradoksu analizörü",
    nav: { analysis: "Analiz", live: "Canlı Trafik", methodology: "Metodoloji", about: "Hakkında" },
    common: {
      analyze: "Analizi çalıştır", refresh: "Yenile", close: "Kapat", minutes: "dk",
      vehiclesHour: "araç/saat", dataQuality: "Veri kalitesi",
      worseningProbability: "Kötüleşme olasılığı", live: "Canlı",
      estimated: "Tahmini", user: "Kullanıcı girişi"
    }
  },
  en: {
    brand: "Braess Lab",
    descriptor: "Braess paradox analyzer",
    nav: { analysis: "Analysis", live: "Live Traffic", methodology: "Methodology", about: "About" },
    common: {
      analyze: "Run analysis", refresh: "Refresh", close: "Close", minutes: "min",
      vehiclesHour: "veh/hour", dataQuality: "Data quality",
      worseningProbability: "Probability of worsening", live: "Live",
      estimated: "Estimated", user: "User input"
    }
  }
};

export function getCopy(language: Language) {
  return copy[language];
}
