import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, CircleDot, Download, FileCode2, MapPinned, Route, Sigma, Waypoints } from "lucide-react";
import type { CSSProperties } from "react";
import type { AdvancedScenarioResult, AdvancedSimulationResponse, Language } from "../types";

type Props = {
  language: Language;
  result: AdvancedSimulationResponse;
  selectedScenarioKey?: string;
  onScenarioSelect?: (scenario: AdvancedScenarioResult) => void;
  onScenarioFocus?: (scenario: AdvancedScenarioResult) => void;
};

function formatNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

function downloadBlob(filename: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvReport(result: AdvancedSimulationResponse): string {
  const rows = [result.baseline, ...result.scenarios];
  const header = ["scenario", "type", "average_minutes", "delay_minutes", "delta_percent", "p10", "median", "p90", "worsening_probability", "converged"];
  const body = rows.map((row) => [
    row.title,
    row.type,
    row.metrics.averageTravelTimeMinutes,
    row.metrics.averageDelayMinutes,
    row.deltaPercent,
    row.uncertainty?.p10DeltaPercent ?? "",
    row.uncertainty?.medianDeltaPercent ?? "",
    row.uncertainty?.p90DeltaPercent ?? "",
    row.uncertainty?.probabilityOfWorsening ?? "",
    row.metrics.converged
  ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","));
  const metadata = [
    `# generated_at=${new Date().toISOString()}`,
    `# sources=${result.provenance.map((item) => item.source).join("+")}`,
    `# model=${result.diagnostics.model}`,
    `# data_quality=${result.dataQuality.score}`
  ];
  return [...metadata, header.join(","), ...body].join("\n");
}

function htmlReport(result: AdvancedSimulationResponse, language: Language): string {
  const tr = language === "tr";
  const rows = [result.baseline, ...result.scenarios].map((row) => `
    <tr><td>${row.title}</td><td>${formatNumber(row.metrics.averageTravelTimeMinutes)} dk</td><td>${formatNumber(row.deltaPercent)}%</td><td>${row.uncertainty ? `${formatNumber(row.uncertainty.p10DeltaPercent)}–${formatNumber(row.uncertainty.p90DeltaPercent)}%` : "—"}</td></tr>`).join("");
  return `<!doctype html><html lang="${language}"><meta charset="utf-8"><title>Braess Lab Report</title><style>body{font:16px Arial;max-width:960px;margin:48px auto;color:#132238}small{color:#5c6878}table{border-collapse:collapse;width:100%;margin-top:28px}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left}.decision{border-left:6px solid #087f78;padding:18px;background:#f4f1e9}</style><body><small>BRAESS LAB · ${new Date().toISOString()}</small><h1>${result.decision.headline}</h1><div class="decision">${result.decision.summary}</div><p>${tr ? "Veri kalitesi" : "Data quality"}: ${result.dataQuality.score}/100 · ${tr ? "Kaynak" : "Source"}: ${result.provenance.map((item) => item.source).join(" + ")}</p><table><thead><tr><th>${tr ? "Senaryo" : "Scenario"}</th><th>${tr ? "Süre" : "Time"}</th><th>${tr ? "Fark" : "Delta"}</th><th>P10–P90</th></tr></thead><tbody>${rows}</tbody></table><h2>${tr ? "Varsayımlar" : "Assumptions"}</h2><ul>${result.diagnostics.assumptions.map((item) => `<li>${item}</li>`).join("")}</ul></body></html>`;
}

function pngReport(result: AdvancedSimulationResponse, language: Language) {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1000;
  const context = canvas.getContext("2d");
  if (!context) return;
  const tr = language === "tr";
  context.fillStyle = "#f3f1ea";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#132238";
  context.font = "600 28px Arial";
  context.fillText("BRAESS LAB · CORRIDOR REPORT", 90, 90);
  context.font = "700 58px Arial";
  const headline = result.decision.headline.length > 52 ? `${result.decision.headline.slice(0, 52)}…` : result.decision.headline;
  context.fillText(headline, 90, 180);
  context.font = "400 25px Arial";
  context.fillStyle = "#5c6878";
  context.fillText(`${tr ? "Veri kalitesi" : "Data quality"}: ${result.dataQuality.score}/100 · ${tr ? "Kötüleşme olasılığı" : "Worsening probability"}: ${Math.round(result.decision.probabilityOfWorsening * 100)}%`, 90, 235);
  const rows = [result.baseline, ...result.scenarios].slice(0, 7);
  rows.forEach((row, index) => {
    const y = 330 + index * 82;
    context.fillStyle = "#132238";
    context.font = "600 22px Arial";
    context.fillText(row.title.slice(0, 38), 90, y);
    const delta = row.uncertainty?.medianDeltaPercent ?? row.deltaPercent;
    const width = Math.min(Math.abs(delta) * 18, 520);
    context.fillStyle = delta > 0 ? "#b43b36" : delta < 0 ? "#087f78" : "#aeb5b8";
    context.fillRect(650 + (delta < 0 ? -width : 0), y - 24, Math.max(width, 4), 28);
    context.fillStyle = "#132238";
    context.fillText(`${delta > 0 ? "+" : ""}${formatNumber(delta)}%`, 1220, y);
  });
  context.font = "400 18px Arial";
  context.fillStyle = "#5c6878";
  context.fillText(`${new Date().toISOString()} · ${result.provenance.map((item) => item.source).join(" + ")} · ${result.diagnostics.model}`, 90, 925);
  canvas.toBlob((blob) => blob && downloadBlob("braess-analysis.png", blob, "image/png"));
}

function decisionIcon(status: AdvancedSimulationResponse["decision"]["status"]) {
  if (status === "detected") return <AlertTriangle aria-hidden="true" />;
  if (status === "not-detected") return <CheckCircle2 aria-hidden="true" />;
  return <Sigma aria-hidden="true" />;
}

function impactExplanation(scenario: AdvancedScenarioResult, language: Language): string {
  const tr = language === "tr";
  const delta = scenario.deltaMinutes;
  const changed = Math.abs(delta) > 0.05;

  if (scenario.type === "newRoad") {
    if (!changed) return tr
      ? "Model akışı bu bağlantıya anlamlı biçimde yönlendirmedi; mevcut yolculuk süresi değişmedi."
      : "The model did not route meaningful flow onto this link, so the current travel time did not change.";
    return delta < 0
      ? (tr ? "Yeni bağlantı sürücülere daha kısa bir seçenek açıyor ve koridorun ortalama yolculuk süresini düşürüyor." : "The new link gives drivers a shorter option and lowers average corridor travel time.")
      : (tr ? "Yeni bağlantı sürücüleri aynı darboğaza çekiyor; ağ dengesi bozulduğu için ortalama süre yükseliyor." : "The new link attracts drivers to the same bottleneck, increasing average time as network balance worsens.");
  }
  if (scenario.type === "signal") {
    if (!changed) return tr
      ? "Webster sinyal ayarı mevcut gecikmeden daha iyi bir sonuç üretmedi; bu noktada lamba değişikliği önerilmiyor."
      : "The Webster timing did not outperform the current delay, so no signal change is recommended at this point.";
    return delta < 0
      ? (tr ? "Yeşil süreleri trafik yüküne göre düzenlendiğinde kavşak beklemesi ve koridor süresi azalıyor." : "Balancing green time with demand reduces intersection waiting and corridor travel time.")
      : (tr ? "Bu sinyal planı kuyrukları yeterince boşaltamıyor ve koridor süresini yükseltiyor." : "This signal plan does not clear queues effectively and increases corridor time.");
  }
  if (scenario.type === "closure") {
    if (!scenario.affectedGeometry?.length) return tr
      ? "Ağ bağlantısını bozmadan süreyi azaltan güvenli bir kapatma adayı bulunmadı."
      : "No safe closure was found that reduces time without breaking network connectivity.";
    return delta < 0
      ? (tr ? "Bu bağlantı kapatıldığında sürücüler daha dengeli rotalara dağılıyor ve toplam süre azalıyor." : "Closing this link redistributes drivers more evenly and lowers total travel time.")
      : (tr ? "Bu bağlantıyı kapatmak trafiği kalan yollara yığıyor ve süreyi yükseltiyor." : "Closing this link shifts too much traffic onto the remaining roads and raises travel time.");
  }
  return tr
    ? "Acil geçiş önceliği yalnızca müdahale aracının ETA'sını etkiler; genel ağ çözümü olarak değerlendirilmez."
    : "Emergency priority changes response-vehicle ETA only and is not treated as a general network solution.";
}

function impactIcon(scenario: AdvancedScenarioResult) {
  if (scenario.type === "signal") return <CircleDot aria-hidden="true" />;
  if (scenario.type === "closure") return <Route aria-hidden="true" />;
  return <Waypoints aria-hidden="true" />;
}

export function ResultsDashboard({ language, result, selectedScenarioKey, onScenarioSelect, onScenarioFocus }: Props) {
  const tr = language === "tr";
  const allResults = [result.baseline, ...result.scenarios];
  const networkResults = allResults.filter((item) => item.category === "network");
  const roadResults = result.scenarios.filter((item) => item.type === "newRoad");
  const recommendation = allResults.find((item) => item.key === result.decision.recommendedScenarioKey) ?? result.baseline;
  const culprit = [...roadResults].sort(
    (a, b) => (b.uncertainty?.medianDeltaPercent ?? b.deltaPercent) - (a.uncertainty?.medianDeltaPercent ?? a.deltaPercent)
  )[0];
  const recommendedGain = result.baseline.metrics.averageTravelTimeMinutes - recommendation.metrics.averageTravelTimeMinutes;
  const explanationScenarios = result.scenarios.filter((item) => item.category === "network");
  const verdict = result.decision.status === "detected"
    ? (tr ? "BRAESS PARADOKSU: VAR" : "BRAESS PARADOX: DETECTED")
    : result.decision.status === "possible"
      ? (tr ? "BRAESS PARADOKSU: OLASI" : "BRAESS PARADOX: POSSIBLE")
      : result.decision.status === "inconclusive"
        ? (tr ? "SONUÇ: YETERSİZ" : "RESULT: INCONCLUSIVE")
        : (tr ? "BRAESS PARADOKSU: YOK" : "BRAESS PARADOX: NOT DETECTED");
  const solutionTitle = recommendation.type === "signal"
    ? (tr ? "Trafik sinyalini optimize edin" : "Optimize the traffic signal")
    : recommendation.type === "closure"
      ? (tr ? "Darboğaz bağlantısını kapatın" : "Close the bottleneck link")
      : recommendation.type === "newRoad"
        ? recommendation.title
        : culprit && (culprit.uncertainty?.medianDeltaPercent ?? culprit.deltaPercent) > 0
          ? (tr ? "Yeni yolu eklemeyin; mevcut ağı koruyun" : "Do not add the road; keep the current network")
          : (tr ? "Mevcut ağı koruyun" : "Keep the current network");
  const solutionText = recommendation.key === "baseline"
    ? (tr ? "Test edilen müdahaleler mevcut ağdan daha iyi ve güvenilir bir denge üretmedi." : "The tested interventions did not produce a better, reliable equilibrium than the current network.")
    : (tr
        ? `${recommendation.title}, ortalama denge süresini ${formatNumber(Math.max(0, recommendedGain))} dakika azaltan en iyi yakınsamış seçenektir.`
        : `${recommendation.title} is the best converged option, reducing average equilibrium time by ${formatNumber(Math.max(0, recommendedGain))} minutes.`);
  const maxMagnitude = Math.max(3, ...networkResults.flatMap((item) => [
    Math.abs(item.uncertainty?.p10DeltaPercent ?? item.deltaPercent),
    Math.abs(item.uncertainty?.p90DeltaPercent ?? item.deltaPercent)
  ]));
  const solutionMapTarget = recommendation.affectedGeometry?.length ? recommendation : culprit?.affectedGeometry?.length ? culprit : null;

  return (
    <section className="results-dashboard" aria-labelledby="analysis-result-title">
      <div className={`decision-hero status-${result.decision.status}`}>
        <div className="decision-icon">{decisionIcon(result.decision.status)}</div>
        <div>
          <span className="eyebrow">{tr ? "BRAESS PARADOKSU SONUCU" : "BRAESS PARADOX RESULT"}</span>
          <h2 id="analysis-result-title">{verdict}</h2>
          <p><strong>{result.decision.headline}.</strong> {result.decision.summary}</p>
        </div>
        <div className="decision-number">
          <strong>{Math.round(result.decision.probabilityOfWorsening * 100)}%</strong>
          <span>{tr ? "yeni yolun kötüleştirme olasılığı" : "probability the new road worsens traffic"}</span>
        </div>
      </div>

      <div className="evidence-strip">
        <div><span>{tr ? "Mevcut denge süresi" : "Current equilibrium time"}</span><strong>{formatNumber(result.baseline.metrics.averageTravelTimeMinutes)} {tr ? "dk" : "min"}</strong></div>
        <div><span>{tr ? "Kötüleşme olasılığı" : "Probability of worsening"}</span><strong>{Math.round(result.decision.probabilityOfWorsening * 100)}%</strong></div>
        <div><span>{tr ? "Veri kalitesi" : "Data quality"}</span><strong>{result.dataQuality.score}<small>/100</small></strong></div>
        <div><span>{tr ? "Talep kaynağı" : "Demand source"}</span><strong className="is-text">{result.dataQuality.demandSource === "manual" ? (tr ? "Kullanıcı girişi" : "User input") : (tr ? "Ters BPR tahmini" : "Inverse BPR estimate")}</strong></div>
      </div>

      <div className="solution-board">
        <article className="recommended-solution">
          <span className="eyebrow">{tr ? "ÖNERİLEN ÇÖZÜM" : "RECOMMENDED ACTION"}</span>
          <h3>{solutionTitle}</h3>
          <p>{solutionText}</p>
          <div className="solution-metrics"><span><small>{tr ? "Mevcut" : "Current"}</small><strong>{formatNumber(result.baseline.metrics.averageTravelTimeMinutes)} {tr ? "dk" : "min"}</strong></span><i>→</i><span><small>{tr ? "Önerilen" : "Recommended"}</small><strong>{formatNumber(recommendation.metrics.averageTravelTimeMinutes)} {tr ? "dk" : "min"}</strong></span></div>
          {solutionMapTarget && <button type="button" className="solution-map-button" onClick={() => onScenarioFocus?.(solutionMapTarget)}><MapPinned size={17} />{recommendation.key === "baseline" ? (tr ? "Test edilen yolu haritada göster" : "Show the tested road on map") : (tr ? "Çözümü haritada göster" : "Show solution on map")}</button>}
        </article>
        <div className="road-verdicts">
          <div className="road-verdicts-heading"><span className="eyebrow">{tr ? "YENİ YOL KARŞILAŞTIRMASI" : "NEW-ROAD COMPARISON"}</span><strong>{tr ? "Tek yön mü, çift yön mü?" : "One-way or two-way?"}</strong></div>
          {roadResults.length ? roadResults.map((scenario) => {
            const median = scenario.uncertainty?.medianDeltaPercent ?? scenario.deltaPercent;
            const probability = scenario.uncertainty?.probabilityOfWorsening ?? 0;
            const state = median >= 2 && probability >= .8 ? "worse" : median < -.2 ? "better" : probability >= .55 ? "risk" : "neutral";
            const label = state === "worse" ? (tr ? "KÖTÜLEŞTİRİYOR" : "WORSENS") : state === "better" ? (tr ? "İYİLEŞTİRİYOR" : "IMPROVES") : state === "risk" ? (tr ? "RİSKLİ" : "RISKY") : (tr ? "BELİRGİN ETKİ YOK" : "NO MATERIAL EFFECT");
            return <button type="button" key={scenario.key} className={`road-verdict state-${state} ${selectedScenarioKey === scenario.key ? "is-selected" : ""}`} onClick={() => onScenarioSelect?.(scenario)}><span><b>{scenario.title}</b><small>{label}</small></span><strong>{median > 0 ? "+" : ""}{formatNumber(median)}%</strong><em>{tr ? "kötüleşme" : "worsening"} {Math.round(probability * 100)}%</em></button>;
          }) : <p className="no-road-result">{tr ? "Yeni yol senaryosu çalıştırılmadı." : "No new-road scenario was run."}</p>}
        </div>
      </div>

      <section className="plain-impact-section" aria-labelledby="plain-impact-title">
        <div className="plain-impact-heading"><span className="eyebrow">{tr ? "ÇÖZÜM AÇIKLAMASI" : "SOLUTION EXPLANATION"}</span><h3 id="plain-impact-title">{tr ? "Hangi müdahale neyi değiştiriyor?" : "What does each intervention change?"}</h3><p>{tr ? "Bir seçeneğe dokunarak etkisini okuyun; harita düğmesi müdahalenin yerini ve geometrisini gösterir." : "Read each option's effect; the map button shows its location and geometry."}</p></div>
        <div className="plain-impact-grid">{explanationScenarios.map((scenario) => {
          const delta = scenario.deltaMinutes;
          const state = delta < -0.05 ? "better" : delta > 0.05 ? "worse" : "neutral";
          const stateLabel = state === "better" ? (tr ? "SÜRE AZALIYOR" : "TIME DECREASES") : state === "worse" ? (tr ? "SÜRE YÜKSELİYOR" : "TIME INCREASES") : (tr ? "BELİRGİN DEĞİŞİM YOK" : "NO MATERIAL CHANGE");
          return <article key={scenario.key} className={`plain-impact-card is-${state} ${selectedScenarioKey === scenario.key ? "is-selected" : ""}`}>
            <div className="plain-impact-card-head"><span>{impactIcon(scenario)}</span><div><small>{stateLabel}</small><h4>{scenario.title}</h4></div><strong>{delta > 0 ? "+" : ""}{formatNumber(delta)} {tr ? "dk" : "min"}</strong></div>
            <p>{impactExplanation(scenario, language)}</p>
            <div className="plain-impact-times"><span>{tr ? "Önce" : "Before"} <b>{formatNumber(result.baseline.metrics.averageTravelTimeMinutes)} {tr ? "dk" : "min"}</b></span><i>→</i><span>{tr ? "Sonra" : "After"} <b>{formatNumber(scenario.metrics.averageTravelTimeMinutes)} {tr ? "dk" : "min"}</b></span></div>
            {scenario.affectedGeometry?.length ? <button type="button" onClick={(event) => { event.stopPropagation(); onScenarioFocus?.(scenario); }}><MapPinned size={16} />{tr ? "Haritada göster" : "Show on map"}</button> : <span className="map-unavailable">{tr ? "Haritada işaretlenecek güvenli konum yok" : "No safe location to mark on the map"}</span>}
          </article>;
        })}</div>
      </section>

      <details className="model-output-details">
        <summary><Sigma size={18} /><span><b>{tr ? "Ayrıntılı matematiksel karşılaştırmayı aç" : "Open detailed mathematical comparison"}</b><small>{tr ? "Belirsizlik aralıkları, senaryo tablosu ve raporlar" : "Uncertainty ranges, scenario table and reports"}</small></span></summary>
        <div className="model-output-body">
      <div className="result-section delta-section">
        <div className="section-heading">
          <div><span className="eyebrow">{tr ? "ETKİ KARŞILAŞTIRMASI" : "IMPACT COMPARISON"}</span><h3>{tr ? "Başlangıca göre denge süresi farkı" : "Equilibrium time difference from baseline"}</h3></div>
          <p>{tr ? "Çizgi P10–P90 belirsizlik aralığını, işaret medyan sonucu gösterir." : "The line shows the P10–P90 range; the marker is the median result."}</p>
        </div>
        <div className="delta-chart" role="img" aria-label={tr ? "Senaryo etki grafiği" : "Scenario impact chart"}>
          <div className="delta-axis"><span>−{formatNumber(maxMagnitude, 0)}%</span><span>0</span><span>+{formatNumber(maxMagnitude, 0)}%</span></div>
          {networkResults.map((scenario) => {
            const low = scenario.uncertainty?.p10DeltaPercent ?? scenario.deltaPercent;
            const high = scenario.uncertainty?.p90DeltaPercent ?? scenario.deltaPercent;
            const median = scenario.uncertainty?.medianDeltaPercent ?? scenario.deltaPercent;
            const left = 50 + (low / maxMagnitude) * 45;
            const width = ((high - low) / maxMagnitude) * 45;
            const marker = 50 + (median / maxMagnitude) * 45;
            const style = {
              "--range-left": `${Math.max(5, Math.min(95, left))}%`,
              "--range-width": `${Math.max(2, Math.min(90, width))}%`,
              "--marker-left": `${Math.max(5, Math.min(95, marker))}%`
            } as CSSProperties;
            return (
              <button type="button" className={`delta-row ${selectedScenarioKey === scenario.key ? "is-selected" : ""}`} key={scenario.key} onClick={() => onScenarioSelect?.(scenario)}>
                <span className="delta-label">{scenario.title}</span>
                <span className="delta-track" style={style}><i className="delta-range" /><i className={`delta-marker ${median > 0 ? "is-negative" : median < 0 ? "is-positive" : ""}`} /></span>
                <strong className={median > 0 ? "metric-worse" : median < 0 ? "metric-better" : ""}>{median > 0 ? "+" : ""}{formatNumber(median)}%</strong>
              </button>
            );
          })}
        </div>
      </div>

      <div className="result-section scenario-ledger">
        <div className="section-heading is-inline">
          <div><span className="eyebrow">{tr ? "SENARYO DEFTERİ" : "SCENARIO LEDGER"}</span><h3>{tr ? "Karşılaştırılabilir model çıktıları" : "Comparable model outputs"}</h3></div>
          <div className="report-actions">
            <button type="button" onClick={() => downloadBlob("braess-analysis.csv", csvReport(result), "text/csv;charset=utf-8")}><Download size={15} />CSV</button>
            <button type="button" onClick={() => pngReport(result, language)}><Download size={15} />PNG</button>
            <button type="button" onClick={() => downloadBlob("braess-analysis.html", htmlReport(result, language), "text/html;charset=utf-8")}><FileCode2 size={15} />HTML</button>
          </div>
        </div>
        <div className="scenario-table" role="table">
          <div className="scenario-table-head" role="row"><span>{tr ? "Senaryo" : "Scenario"}</span><span>{tr ? "Denge süresi" : "Equilibrium time"}</span><span>{tr ? "Fark" : "Delta"}</span><span>P10–P90</span><span>{tr ? "Yakınsama" : "Convergence"}</span></div>
          {allResults.map((scenario) => (
            <button type="button" role="row" className={`scenario-table-row ${selectedScenarioKey === scenario.key ? "is-selected" : ""}`} key={scenario.key} onClick={() => onScenarioSelect?.(scenario)}>
              <span><b>{scenario.title}</b><small>{scenario.note}</small></span>
              <span data-label={tr ? "Denge süresi" : "Equilibrium time"}>{formatNumber(scenario.metrics.averageTravelTimeMinutes)} {tr ? "dk" : "min"}</span>
              <span data-label={tr ? "Fark" : "Delta"} className={scenario.deltaPercent > 0 ? "metric-worse" : scenario.deltaPercent < 0 ? "metric-better" : ""}>{scenario.deltaPercent > 0 ? <ArrowUpRight size={15} /> : scenario.deltaPercent < 0 ? <ArrowDownRight size={15} /> : null}{scenario.deltaPercent > 0 ? "+" : ""}{formatNumber(scenario.deltaPercent)}%</span>
              <span data-label="P10–P90">{scenario.uncertainty ? `${formatNumber(scenario.uncertainty.p10DeltaPercent)}–${formatNumber(scenario.uncertainty.p90DeltaPercent)}%` : "—"}</span>
              <span data-label={tr ? "Yakınsama" : "Convergence"}><i className={`status-dot ${scenario.metrics.converged ? "is-ok" : "is-error"}`} />{scenario.metrics.converged ? `${scenario.metrics.iterations} ${tr ? "iter." : "iter."}` : (tr ? "Yakınsamadı" : "Not converged")}</span>
            </button>
          ))}
        </div>
      </div>
        </div>
      </details>

      <details className="technical-details">
        <summary><Sigma size={17} />{tr ? "Model denklemleri, varsayımlar ve tanılama" : "Model equations, assumptions and diagnostics"}</summary>
        <div className="technical-grid">
          <div><span className="eyebrow">BPR</span><code>tₐ(xₐ) = tₐ⁰ [1 + 0.15(xₐ/cₐ)⁴] + dₛ</code><p>{tr ? "Kapasite ve sinyal gecikmesini birlikte kullanan yönlü kenar maliyeti." : "Directed edge cost using capacity and signal delay."}</p></div>
          <div><span className="eyebrow">FRANK–WOLFE</span><code>relative gap ≤ 1 × 10⁻⁴</code><p>{result.diagnostics.model}</p></div>
          <div><span className="eyebrow">{tr ? "AĞ" : "NETWORK"}</span><code>{result.diagnostics.nodeCount} {tr ? "düğüm" : "nodes"} · {result.diagnostics.edgeCount} {tr ? "kenar" : "edges"}</code><p>{result.diagnostics.assumptions.join(" ")}</p></div>
          <div><span className="eyebrow">{tr ? "KAYNAKLAR" : "SOURCES"}</span><code>{result.provenance.map((item) => item.source).join(" + ")}</code><p>{result.provenance.map((item) => item.label).join(" · ")}</p></div>
        </div>
        {result.diagnostics.edgeFlows.length > 0 && <div className="edge-flow-panel">
          <div><span className="eyebrow">{tr ? "EN YOĞUN KENARLAR" : "MOST LOADED EDGES"}</span><p>{tr ? "Akım, kapasite ve denge maliyeti; kapasite kaynağıyla birlikte gösterilir." : "Flow, capacity and equilibrium cost are shown with the capacity source."}</p></div>
          <div className="edge-flow-table">
            <div><span>{tr ? "Kenar" : "Edge"}</span><span>{tr ? "Akım / kapasite" : "Flow / capacity"}</span><span>V/C</span><span>{tr ? "Maliyet" : "Cost"}</span><span>{tr ? "Kapasite kaynağı" : "Capacity source"}</span></div>
            {result.diagnostics.edgeFlows.slice(0, 8).map((edge) => <div key={edge.edgeId}><span data-label={tr ? "Kenar" : "Edge"} title={edge.edgeId}>{edge.edgeId}</span><span data-label={tr ? "Akım / kapasite" : "Flow / capacity"}>{formatNumber(edge.flowVehPerHour, 0)} / {formatNumber(edge.capacityVehPerHour, 0)}</span><strong data-label="V/C" className={edge.volumeCapacityRatio > 1 ? "metric-worse" : edge.volumeCapacityRatio > .8 ? "metric-warning" : ""}>{formatNumber(edge.volumeCapacityRatio, 2)}</strong><span data-label={tr ? "Maliyet" : "Cost"}>{formatNumber(edge.travelTimeMinutes, 2)} {tr ? "dk" : "min"}</span><span data-label={tr ? "Kapasite kaynağı" : "Capacity source"}>{edge.capacitySource === "user" ? (tr ? "Kullanıcı" : "User") : edge.capacitySource === "road-class" ? (tr ? "Yol sınıfı" : "Road class") : (tr ? "Hız sınıfı tahmini" : "Speed-class estimate")}</span></div>)}
          </div>
        </div>}
      </details>
    </section>
  );
}
