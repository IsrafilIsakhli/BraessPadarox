import { CheckCircle2, Database, Sigma, TriangleAlert } from "lucide-react";
import { localized, scenarioName } from "../localization";
import type { AdvancedScenarioResult, AdvancedSimulationResponse, AnalysisMode, Language } from "../types";

type Props = {
  language: Language;
  mode: AnalysisMode;
  routeCount: number;
  result: AdvancedSimulationResponse | null;
  selectedScenario: AdvancedScenarioResult | null;
};

function fixed(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

export function ResearchRail({ language, mode, routeCount, result, selectedScenario }: Props) {
  const t = (tr: string, az: string, en: string) => localized(language, tr, az, en);
  const baseline = result?.baseline ?? null;
  const scenario = selectedScenario ?? result?.scenarios[0] ?? null;
  const status = result?.decision.status;
  const statusLabel = status === "detected"
    ? t("Braess paradoksu ile uyumlu", "Braess paradoksu ilə uyğundur", "Consistent with Braess paradox")
    : status === "possible"
      ? t("Etki belirsiz; ek veri gerekli", "Təsir qeyri-müəyyəndir; əlavə məlumat lazımdır", "Effect uncertain; more data required")
      : status === "inconclusive"
        ? t("Model yakınsamadı", "Model yaxınlaşmadı", "Model did not converge")
        : t("Braess etkisi tespit edilmedi", "Braess təsiri aşkar edilmədi", "No Braess effect detected");

  const rows = baseline && scenario ? [
    {
      label: t("Denge süresi", "Tarazlıq müddəti", "Equilibrium time"),
      base: `${fixed(baseline.metrics.averageTravelTimeMinutes)} ${t("dk", "dəq", "min")}`,
      scenario: `${fixed(scenario.metrics.averageTravelTimeMinutes)} ${t("dk", "dəq", "min")}`,
      direction: scenario.deltaMinutes
    },
    {
      label: t("Ort. gecikme", "Orta gecikmə", "Avg. delay"),
      base: `${fixed(baseline.metrics.averageDelayMinutes)} ${t("dk", "dəq", "min")}`,
      scenario: `${fixed(scenario.metrics.averageDelayMinutes)} ${t("dk", "dəq", "min")}`,
      direction: scenario.metrics.averageDelayMinutes - baseline.metrics.averageDelayMinutes
    },
    {
      label: t("Toplam sistem süresi", "Ümumi sistem müddəti", "Total system time"),
      base: `${fixed(baseline.metrics.totalSystemTravelTimeHours)} h`,
      scenario: `${fixed(scenario.metrics.totalSystemTravelTimeHours)} h`,
      direction: scenario.metrics.totalSystemTravelTimeHours - baseline.metrics.totalSystemTravelTimeHours
    },
    {
      label: t("Seyahat süresi değişimi", "Səfər müddəti dəyişikliyi", "Travel-time change"),
      base: "—",
      scenario: `${scenario.deltaPercent > 0 ? "+" : ""}${fixed(scenario.deltaPercent)}%`,
      direction: scenario.deltaPercent
    },
    {
      label: t("Kötüleşme olasılığı", "Pisləşmə ehtimalı", "Worsening probability"),
      base: "—",
      scenario: `${Math.round((scenario.uncertainty?.probabilityOfWorsening ?? result?.decision.probabilityOfWorsening ?? 0) * 100)}%`,
      direction: (scenario.uncertainty?.probabilityOfWorsening ?? 0) - .5
    }
  ] : [];

  return <aside className="research-rail evidence-panel" aria-label={t("Kanıt ve temel göstergeler", "Sübutlar və əsas göstəricilər", "Evidence and key indicators") }>
    <header className="evidence-panel-title">
      <span>{t("Kanıt ve Temel Göstergeler", "Sübutlar və Əsas Göstəricilər", "Evidence & Key Indicators")}</span>
      <small>TABLE 01</small>
    </header>

    {result && baseline && scenario ? <>
      <div className="evidence-comparison-head">
        <span>{t("Gösterge", "Göstərici", "Indicator")}</span>
        <span>{t("Mevcut ağ", "Mövcud şəbəkə", "Baseline")}</span>
        <span>{scenarioName(language, scenario)}</span>
      </div>
      <div className="evidence-comparison-body">
        {rows.map((row) => <div key={row.label}>
          <span>{row.label}</span>
          <strong>{row.base}</strong>
          <strong className={row.direction > .01 ? "is-worse" : row.direction < -.01 ? "is-better" : ""}>{row.scenario}</strong>
        </div>)}
        <div><span>{t("Veri kalitesi", "Məlumat keyfiyyəti", "Data quality")}</span><strong>—</strong><strong className={result.dataQuality.score >= 70 ? "is-better" : "is-warning"}>{result.dataQuality.score}/100</strong></div>
      </div>
      <div className={`evidence-verdict status-${status}`}>
        {status === "detected" ? <TriangleAlert size={18}/> : <CheckCircle2 size={18}/>}<p><b>{t("Sonuç:", "Nəticə:", "Finding:")}</b> {statusLabel}.</p>
      </div>
    </> : <>
      <div className="evidence-empty">
        <Sigma size={26}/>
        <strong>{t("Karşılaştırma bekleniyor", "Müqayisə gözlənilir", "Awaiting comparison")}</strong>
        <p>{t("Analiz çalıştırıldığında mevcut ağ ve müdahale senaryosu aynı talep altında karşılaştırılır.", "Analiz başladıldıqda mövcud şəbəkə və müdaxilə ssenarisi eyni tələb altında müqayisə olunur.", "Once run, the baseline and intervention are compared under identical demand.")}</p>
        <ul>
          <li><span>↔</span>{t("Tek ve çift yönlü yeni yol", "Bir və iki istiqamətli yeni yol", "One-way and two-way new road")}</li>
          <li><span>🚦</span>{t("Webster sinyal optimizasyonu", "Webster siqnal optimallaşdırılması", "Webster signal optimization")}</li>
          <li><span>×</span>{t("Ağ bağlantısını bozmayan kapatma", "Şəbəkəni pozmayan bağlanma", "Connectivity-safe closure")}</li>
          <li><span>+</span>{t("Acil müdahale koridoru", "Təcili müdaxilə koridoru", "Emergency response corridor")}</li>
        </ul>
      </div>
      <div className="evidence-protocol">
        <div><span>{t("Veri modu", "Məlumat rejimi", "Data mode")}</span><strong>{mode === "live-calibrated" ? t("Canlı", "Canlı", "Live") : t("Statik", "Statik", "Static")}</strong></div>
        <div><span>{t("Rota", "Marşrut", "Routes")}</span><strong>{routeCount || "—"}</strong></div>
        <div><span>{t("Çözücü", "Həlledici", "Solver")}</span><strong>Frank–Wolfe</strong></div>
        <div><span>{t("Örnekleme", "Nümunə", "Sampling")}</span><strong>100×</strong></div>
      </div>
    </>}

    <footer className="evidence-source"><Database size={15}/><span>{t("OSRM rota ağı · BPR maliyet fonksiyonu · Wardrop kullanıcı dengesi", "OSRM marşrut şəbəkəsi · BPR xərc funksiyası · Wardrop istifadəçi tarazlığı", "OSRM route network · BPR cost function · Wardrop user equilibrium")}</span></footer>
  </aside>;
}
