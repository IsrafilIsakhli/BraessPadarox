import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, CircleDot, Download, FileCode2, MapPinned, Route, Sigma, Waypoints } from "lucide-react";
import type { CSSProperties } from "react";
import { localized, scenarioName } from "../localization";
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
  const t = (tr: string, az: string, en: string) => localized(language, tr, az, en);
  const rows = [result.baseline, ...result.scenarios].map((row) => `
    <tr><td>${scenarioName(language, row)}</td><td>${formatNumber(row.metrics.averageTravelTimeMinutes)} ${t("dk", "dəq", "min")}</td><td>${formatNumber(row.deltaPercent)}%</td><td>${row.uncertainty ? `${formatNumber(row.uncertainty.p10DeltaPercent)}–${formatNumber(row.uncertainty.p90DeltaPercent)}%` : "—"}</td></tr>`).join("");
  return `<!doctype html><html lang="${language}"><meta charset="utf-8"><title>Braess Lab Report</title><style>body{font:16px Arial;max-width:960px;margin:48px auto;color:#132238}small{color:#5c6878}table{border-collapse:collapse;width:100%;margin-top:28px}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left}.decision{border-left:6px solid #087f78;padding:18px;background:#f4f1e9}</style><body><small>BRAESS LAB · ${new Date().toISOString()}</small><h1>${t("Braess koridor analiz raporu", "Braess koridor analiz hesabatı", "Braess corridor analysis report")}</h1><div class="decision">${t("Karar, medyan etki ve kötüleşme olasılığına dayanır.", "Qərar median təsir və pisləşmə ehtimalına əsaslanır.", "The decision is based on median effect and probability of worsening.")}</div><p>${t("Veri kalitesi", "Məlumat keyfiyyəti", "Data quality")}: ${result.dataQuality.score}/100 · ${t("Kaynak", "Mənbə", "Source")}: ${result.provenance.map((item) => item.source).join(" + ")}</p><table><thead><tr><th>${t("Senaryo", "Ssenari", "Scenario")}</th><th>${t("Süre", "Müddət", "Time")}</th><th>${t("Fark", "Fərq", "Delta")}</th><th>P10–P90</th></tr></thead><tbody>${rows}</tbody></table><h2>${t("Varsayımlar", "Fərziyyələr", "Assumptions")}</h2><ul>${result.diagnostics.assumptions.map((item) => `<li>${item}</li>`).join("")}</ul></body></html>`;
}

function pngReport(result: AdvancedSimulationResponse, language: Language) {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1000;
  const context = canvas.getContext("2d");
  if (!context) return;
  const t = (tr: string, az: string, en: string) => localized(language, tr, az, en);
  context.fillStyle = "#f3f1ea";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#132238";
  context.font = "600 28px Arial";
  context.fillText("BRAESS LAB · CORRIDOR REPORT", 90, 90);
  context.font = "700 58px Arial";
  const headline = t("BRAESS KORİDOR ANALİZİ", "BRAESS KORİDOR ANALİZİ", "BRAESS CORRIDOR ANALYSIS");
  context.fillText(headline, 90, 180);
  context.font = "400 25px Arial";
  context.fillStyle = "#5c6878";
  context.fillText(`${t("Veri kalitesi", "Məlumat keyfiyyəti", "Data quality")}: ${result.dataQuality.score}/100 · ${t("Kötüleşme olasılığı", "Pisləşmə ehtimalı", "Worsening probability")}: ${Math.round(result.decision.probabilityOfWorsening * 100)}%`, 90, 235);
  const rows = [result.baseline, ...result.scenarios].slice(0, 7);
  rows.forEach((row, index) => {
    const y = 330 + index * 82;
    context.fillStyle = "#132238";
    context.font = "600 22px Arial";
    context.fillText(scenarioName(language, row).slice(0, 38), 90, y);
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
  const t = (tr: string, az: string, en: string) => localized(language, tr, az, en);
  const delta = scenario.deltaMinutes;
  const changed = Math.abs(delta) > 0.05;

  if (scenario.type === "newRoad") {
    if (!changed) return t("Model akışı bu bağlantıya anlamlı biçimde yönlendirmedi; yolculuk süresi değişmedi.", "Model axını bu bağlantıya əhəmiyyətli şəkildə yönəltmədi; səfər müddəti dəyişmədi.", "The model did not route meaningful flow onto this link, so travel time did not change.");
    return delta < 0
      ? t("Yeni bağlantı daha kısa bir seçenek açıyor ve ortalama koridor süresini düşürüyor.", "Yeni bağlantı daha qısa seçim yaradır və orta koridor müddətini azaldır.", "The new link gives drivers a shorter option and lowers average corridor travel time.")
      : t("Yeni bağlantı sürücüleri aynı darboğaza çekiyor; ağ dengesi bozulduğu için süre yükseliyor.", "Yeni bağlantı sürücüləri eyni darboğaza çəkir; şəbəkə tarazlığı pozulduğu üçün müddət artır.", "The new link attracts drivers to the same bottleneck, increasing average time as network balance worsens.");
  }
  if (scenario.type === "signal") {
    if (!changed) return t("Webster sinyal ayarı mevcut gecikmeden daha iyi sonuç üretmedi; değişiklik önerilmiyor.", "Webster siqnal tənzimləməsi mövcud gecikmədən daha yaxşı nəticə vermədi; dəyişiklik tövsiyə edilmir.", "The Webster timing did not outperform the current delay, so no signal change is recommended.");
    return delta < 0
      ? t("Yeşil süreleri trafik yüküne göre düzenlendiğinde kavşak beklemesi azalıyor.", "Yaşıl müddətlər trafik yükünə uyğunlaşdırıldıqda kəsişmə gözləməsi azalır.", "Balancing green time with demand reduces intersection waiting and corridor travel time.")
      : t("Bu sinyal planı kuyrukları yeterince boşaltamıyor ve koridor süresini yükseltiyor.", "Bu siqnal planı növbələri kifayət qədər boşaltmır və koridor müddətini artırır.", "This signal plan does not clear queues effectively and increases corridor time.");
  }
  if (scenario.type === "closure") {
    if (!scenario.affectedGeometry?.length) return t("Ağ bağlantısını bozmadan süreyi azaltan güvenli kapatma adayı bulunmadı.", "Şəbəkə əlaqəsini pozmadan müddəti azaldan təhlükəsiz bağlanma namizədi tapılmadı.", "No safe closure was found that reduces time without breaking network connectivity.");
    return delta < 0
      ? t("Bu bağlantı kapatıldığında sürücüler daha dengeli rotalara dağılıyor ve süre azalıyor.", "Bu bağlantı bağlandıqda sürücülər daha taraz marşrutlara paylanır və müddət azalır.", "Closing this link redistributes drivers more evenly and lowers total travel time.")
      : t("Bu bağlantıyı kapatmak trafiği kalan yollara yığıyor ve süreyi yükseltiyor.", "Bu bağlantını bağlamaq trafiki qalan yollara yığır və müddəti artırır.", "Closing this link shifts too much traffic onto the remaining roads and raises travel time.");
  }
  return t("Acil geçiş önceliği yalnızca müdahale aracının ETA'sını etkiler; genel ağ çözümü değildir.", "Təcili keçid prioriteti yalnız müdaxilə avtomobilinin ETA-sına təsir edir; ümumi şəbəkə həlli deyil.", "Emergency priority changes response-vehicle ETA only and is not treated as a general network solution.");
}

function impactIcon(scenario: AdvancedScenarioResult) {
  if (scenario.type === "signal") return <CircleDot aria-hidden="true" />;
  if (scenario.type === "closure") return <Route aria-hidden="true" />;
  return <Waypoints aria-hidden="true" />;
}

export function ResultsDashboard({ language, result, selectedScenarioKey, onScenarioSelect, onScenarioFocus }: Props) {
  const t = (tr: string, az: string, en: string) => localized(language, tr, az, en);
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
    ? t("BRAESS PARADOKSU: VAR", "BRAESS PARADOKSU: AŞKARLANDI", "BRAESS PARADOX: DETECTED")
    : result.decision.status === "possible"
      ? t("BRAESS PARADOKSU: OLASI", "BRAESS PARADOKSU: MÜMKÜNDÜR", "BRAESS PARADOX: POSSIBLE")
      : result.decision.status === "inconclusive"
        ? t("SONUÇ: YETERSİZ", "NƏTİCƏ: QEYRİ-KAFİ", "RESULT: INCONCLUSIVE")
        : t("BRAESS PARADOKSU: YOK", "BRAESS PARADOKSU: AŞKARLANMADI", "BRAESS PARADOX: NOT DETECTED");
  const decisionLead = result.decision.status === "detected"
    ? t("Yeni bağlantı kullanıcı dengesi altında koridor süresini artırıyor.", "Yeni bağlantı istifadəçi tarazlığında koridor müddətini artırır.", "The new connection increases corridor time under user equilibrium.")
    : result.decision.status === "possible"
      ? t("Yeni yolun etkisi belirsizlik aralığında yön değiştiriyor.", "Yeni yolun təsiri qeyri-müəyyənlik intervalında istiqamət dəyişir.", "The new road changes direction within the uncertainty interval.")
      : result.decision.status === "inconclusive"
        ? t("Model güvenilir bir denge kararına ulaşmadı.", "Model etibarlı tarazlıq qərarına çatmadı.", "The model did not reach a reliable equilibrium decision.")
        : t("Yeni yol için güçlü bir Braess etkisi görülmedi.", "Yeni yol üçün güclü Braess təsiri görünmədi.", "No strong Braess effect was observed for the new road.");
  const decisionDetail = t("Karar medyan değişim, P10–P90 aralığı ve 100 örnekteki kötüleşme oranıyla sınıflandırıldı.", "Qərar median dəyişmə, P10–P90 intervalı və 100 nümunədə pisləşmə nisbəti ilə təsnif edildi.", "The verdict combines median change, the P10–P90 interval and worsening frequency across 100 samples.");
  const solutionTitle = recommendation.type === "signal"
    ? t("Trafik sinyalini optimize edin", "Trafik siqnalını optimallaşdırın", "Optimize the traffic signal")
    : recommendation.type === "closure"
      ? t("Darboğaz bağlantısını kapatın", "Darboğaz bağlantısını bağlayın", "Close the bottleneck link")
      : recommendation.type === "newRoad"
        ? scenarioName(language, recommendation)
        : culprit && (culprit.uncertainty?.medianDeltaPercent ?? culprit.deltaPercent) > 0
          ? t("Yeni yolu eklemeyin; mevcut ağı koruyun", "Yeni yolu əlavə etməyin; mövcud şəbəkəni qoruyun", "Do not add the road; keep the current network")
          : t("Mevcut ağı koruyun", "Mövcud şəbəkəni qoruyun", "Keep the current network");
  const solutionText = recommendation.key === "baseline"
    ? t("Test edilen müdahaleler mevcut ağdan daha iyi ve güvenilir bir denge üretmedi.", "Sınaqdan keçirilən müdaxilələr mövcud şəbəkədən daha yaxşı və etibarlı tarazlıq yaratmadı.", "The tested interventions did not produce a better, reliable equilibrium than the current network.")
    : t(`${scenarioName(language, recommendation)}, ortalama denge süresini ${formatNumber(Math.max(0, recommendedGain))} dakika azaltan en iyi yakınsamış seçenektir.`, `${scenarioName(language, recommendation)} orta tarazlıq müddətini ${formatNumber(Math.max(0, recommendedGain))} dəqiqə azaldan ən yaxşı yaxınlaşmış seçimdir.`, `${scenarioName(language, recommendation)} is the best converged option, reducing average equilibrium time by ${formatNumber(Math.max(0, recommendedGain))} minutes.`);
  const maxMagnitude = Math.max(3, ...networkResults.flatMap((item) => [
    Math.abs(item.uncertainty?.p10DeltaPercent ?? item.deltaPercent),
    Math.abs(item.uncertainty?.p90DeltaPercent ?? item.deltaPercent)
  ]));
  const solutionMapTarget = recommendation.affectedGeometry?.length ? recommendation : culprit?.affectedGeometry?.length ? culprit : null;
  const priorityActions = [...result.scenarios]
    .filter((item) => item.category === "network" && item.metrics.converged)
    .sort((a, b) => a.deltaMinutes - b.deltaMinutes)
    .slice(0, 4);
  const emergencyScenario = result.scenarios.find((item) => item.type === "emergencyPriority");
  const uncertaintyRows = [result.baseline, culprit ?? recommendation].filter((item, index, items) => items.findIndex((candidate) => candidate.key === item.key) === index);

  return (
    <section className="results-dashboard" aria-labelledby="analysis-result-title">
      <div className={`decision-hero status-${result.decision.status}`}>
        <div className="decision-icon">{decisionIcon(result.decision.status)}</div>
        <div>
          <span className="eyebrow">{t("BRAESS PARADOKSU SONUCU", "BRAESS PARADOKSU NƏTİCƏSİ", "BRAESS PARADOX RESULT")}</span>
          <h2 id="analysis-result-title">{verdict}</h2>
          <p><strong>{decisionLead}</strong> {decisionDetail}</p>
        </div>
        <div className="decision-number">
          <strong>{Math.round(result.decision.probabilityOfWorsening * 100)}%</strong>
          <span>{t("yeni yolun kötüleştirme olasılığı", "yeni yolun trafiki pisləşdirmə ehtimalı", "probability the new road worsens traffic")}</span>
        </div>
      </div>

      <div className="evidence-strip">
        <div><span>{t("Mevcut denge süresi", "Mövcud tarazlıq müddəti", "Current equilibrium time")}</span><strong>{formatNumber(result.baseline.metrics.averageTravelTimeMinutes)} {t("dk", "dəq", "min")}</strong></div>
        <div><span>{t("Kötüleşme olasılığı", "Pisləşmə ehtimalı", "Probability of worsening")}</span><strong>{Math.round(result.decision.probabilityOfWorsening * 100)}%</strong></div>
        <div><span>{t("Veri kalitesi", "Məlumat keyfiyyəti", "Data quality")}</span><strong>{result.dataQuality.score}<small>/100</small></strong></div>
        <div><span>{t("Talep kaynağı", "Tələb mənbəyi", "Demand source")}</span><strong className="is-text">{result.dataQuality.demandSource === "manual" ? t("Kullanıcı girişi", "İstifadəçi girişi", "User input") : t("Ters BPR tahmini", "Tərs BPR təxmini", "Inverse BPR estimate")}</strong></div>
      </div>

      <section className="academic-primary-grid" aria-label={t("Birincil analiz çıktıları", "Əsas analiz nəticələri", "Primary analysis outputs")}>
        <article className="academic-panel scenario-compact-panel">
          <header><span>{t("Senaryo Karşılaştırması", "Ssenari Müqayisəsi", "Scenario Comparison")}</span><small>TABLE 02</small></header>
          <div className="compact-table-head"><span>{t("Senaryo", "Ssenari", "Scenario")}</span><span>{t("Denge", "Tarazlıq", "Equilibrium")}</span><span>Δ</span><span>Δ%</span></div>
          {[result.baseline, ...roadResults.slice(0, 2)].map((scenario) => <button type="button" key={scenario.key} className={selectedScenarioKey === scenario.key ? "is-selected" : ""} onClick={() => onScenarioSelect?.(scenario)}>
            <span><b>{scenarioName(language, scenario)}</b><small>{scenario.key === result.baseline.key ? t("Baz senaryo", "Baza ssenari", "Baseline") : scenario.type === "newRoad" ? t("Yeni bağlantı", "Yeni bağlantı", "New link") : t("Müdahale", "Müdaxilə", "Intervention")}</small></span>
            <strong>{formatNumber(scenario.metrics.averageTravelTimeMinutes)} {t("dk", "dəq", "min")}</strong>
            <strong className={scenario.deltaMinutes > 0 ? "metric-worse" : scenario.deltaMinutes < 0 ? "metric-better" : ""}>{scenario.deltaMinutes > 0 ? "+" : ""}{formatNumber(scenario.deltaMinutes)} {t("dk", "dəq", "min")}</strong>
            <strong className={scenario.deltaPercent > 0 ? "metric-worse" : scenario.deltaPercent < 0 ? "metric-better" : ""}>{scenario.deltaPercent > 0 ? "+" : ""}{formatNumber(scenario.deltaPercent)}%</strong>
          </button>)}
        </article>

        <article className="academic-panel uncertainty-compact-panel">
          <header><span>{t("Belirsizlik Analizi", "Qeyri-müəyyənlik Analizi", "Uncertainty Analysis")}</span><small>100× MONTE CARLO</small></header>
          <div className="uncertainty-axis"><span>−{formatNumber(maxMagnitude, 0)}%</span><span>0</span><span>+{formatNumber(maxMagnitude, 0)}%</span></div>
          {uncertaintyRows.map((scenario) => {
            const low = scenario.uncertainty?.p10DeltaPercent ?? scenario.deltaPercent;
            const high = scenario.uncertainty?.p90DeltaPercent ?? scenario.deltaPercent;
            const median = scenario.uncertainty?.medianDeltaPercent ?? scenario.deltaPercent;
            const style = {
              "--u-left": `${Math.max(7, Math.min(93, 50 + (low / maxMagnitude) * 42))}%`,
              "--u-width": `${Math.max(2, Math.min(86, ((high - low) / maxMagnitude) * 42))}%`,
              "--u-marker": `${Math.max(7, Math.min(93, 50 + (median / maxMagnitude) * 42))}%`
            } as CSSProperties;
            return <div className="uncertainty-compact-row" key={scenario.key}><span>{scenarioName(language, scenario)}</span><i style={style}><b/><em/></i><strong>{median > 0 ? "+" : ""}{formatNumber(median)}%</strong></div>;
          })}
          <p>{t("Çizgi P10–P90 aralığını; kare işaret medyan etkiyi gösterir.", "Xətt P10–P90 intervalını; kvadrat median təsiri göstərir.", "The line is P10–P90; the square marks the median effect.")}</p>
        </article>

        <article className="academic-panel priority-panel">
          <header><span>{t("Önerilen Müdahaleler", "Tövsiyə Edilən Müdaxilələr", "Recommended Interventions")}</span><small>{t("ÖNCELİK SIRASI", "PRİORİTET", "PRIORITY")}</small></header>
          <ol>{priorityActions.length ? priorityActions.map((scenario, index) => <li key={scenario.key}>
            <span>{index + 1}</span><button type="button" onClick={() => onScenarioFocus?.(scenario)}>{scenarioName(language, scenario)}</button><strong className={scenario.deltaMinutes <= 0 ? "metric-better" : "metric-worse"}>{scenario.deltaMinutes > 0 ? "+" : ""}{formatNumber(scenario.deltaMinutes)} {t("dk", "dəq", "min")}</strong>
          </li>) : <li className="is-empty">{t("Yakınsamış müdahale bulunamadı.", "Yaxınlaşmış müdaxilə tapılmadı.", "No converged intervention was found.")}</li>}</ol>
          <footer><b>{t("En iyi seçenek", "Ən yaxşı seçim", "Best option")}</b><span>{scenarioName(language, recommendation)}</span></footer>
        </article>
      </section>

      {emergencyScenario && <section className="emergency-corridor-result">
        <div className="emergency-corridor-icon">+</div>
        <div><span className="eyebrow">{t("ACİL MÜDAHALE ANALİZİ", "TƏCİLİ MÜDAXİLƏ ANALİZİ", "EMERGENCY RESPONSE ANALYSIS")}</span><h3>{t("Acil koridor ayrı bir ETA çıktısıdır", "Təcili koridor ayrıca ETA nəticəsidir", "Emergency corridor is a separate ETA output")}</h3><p>{t("Bu katman ambulans ve itfaiye geçişini inceler; genel trafik için en iyi çözüm sıralamasına dahil edilmez.", "Bu lay təcili yardım və yanğınsöndürmə keçidini təhlil edir; ümumi trafik həlli sıralamasına daxil edilmir.", "This layer evaluates ambulance and fire response; it is not ranked as a general traffic solution.")}</p></div>
        <div className="emergency-corridor-metric"><small>{t("ETA etkisi", "ETA təsiri", "ETA effect")}</small><strong>{emergencyScenario.deltaMinutes > 0 ? "+" : ""}{formatNumber(emergencyScenario.deltaMinutes)} {t("dk", "dəq", "min")}</strong></div>
        {emergencyScenario.affectedGeometry?.length ? <button type="button" onClick={() => onScenarioFocus?.(emergencyScenario)}><MapPinned size={16}/>{t("Acil koridoru haritada göster", "Təcili koridoru xəritədə göstər", "Show emergency corridor")}</button> : null}
      </section>}

      <section className="causal-chain" aria-label={t("Neden böyle oldu", "Niyə belə oldu", "Why this happened")}>
        <div className="causal-chain-heading"><span className="eyebrow">{t("NEDEN BÖYLE OLDU?", "NİYƏ BELƏ OLDU?", "WHY DID THIS HAPPEN?")}</span><p>{t("Modelin karar mantığı dört adımda okunabilir.", "Modelin qərar məntiqi dörd addımda oxunur.", "Read the model's reasoning in four steps.")}</p></div>
        <ol><li><span>01</span><b>{t("Yeni seçenek açıldı", "Yeni seçim açıldı", "New option opened")}</b><small>{t("Sürücüler bireysel olarak daha kısa görünen bağlantıya yöneldi.", "Sürücülər fərdi olaraq daha qısa görünən bağlantıya yönəldi.", "Drivers moved toward the individually shorter-looking link.")}</small></li><li><span>02</span><b>{t("Akış yeniden dağıldı", "Axın yenidən paylandı", "Flow redistributed")}</b><small>{t("Ortak yol parçaları beklenenden fazla talep aldı.", "Ortaq yol hissələri gözləniləndən çox tələb aldı.", "Shared road sections received more demand than expected.")}</small></li><li><span>03</span><b>{t("Darboğaz maliyeti değişti", "Darboğaz xərci dəyişdi", "Bottleneck cost changed")}</b><small>{t("BPR maliyeti akım/kapasite oranıyla büyüdü.", "BPR xərci axın/tutum nisbəti ilə artdı.", "BPR cost increased with the volume/capacity ratio.")}</small></li><li><span>04</span><b>{t("Yeni denge oluştu", "Yeni tarazlıq yarandı", "New equilibrium formed")}</b><small>{t("Karar medyan süre farkı ve belirsizlik dağılımından üretildi.", "Qərar median müddət fərqi və qeyri-müəyyənlik paylanmasından yaradıldı.", "The verdict came from median time change and its uncertainty distribution.")}</small></li></ol>
      </section>

      <div className="solution-board">
        <article className="recommended-solution">
          <span className="eyebrow">{t("ÖNERİLEN ÇÖZÜM", "TÖVSİYƏ EDİLƏN HƏLL", "RECOMMENDED ACTION")}</span>
          <h3>{solutionTitle}</h3>
          <p>{solutionText}</p>
          <div className="solution-metrics"><span><small>{t("Mevcut", "Mövcud", "Current")}</small><strong>{formatNumber(result.baseline.metrics.averageTravelTimeMinutes)} {t("dk", "dəq", "min")}</strong></span><i>→</i><span><small>{t("Önerilen", "Tövsiyə", "Recommended")}</small><strong>{formatNumber(recommendation.metrics.averageTravelTimeMinutes)} {t("dk", "dəq", "min")}</strong></span></div>
          {solutionMapTarget && <button type="button" className="solution-map-button" onClick={() => onScenarioFocus?.(solutionMapTarget)}><MapPinned size={17}/>{recommendation.key === "baseline" ? t("Test edilen yolu haritada göster", "Sınaq yolunu xəritədə göstər", "Show the tested road on map") : t("Çözümü haritada göster", "Həlli xəritədə göstər", "Show solution on map")}</button>}
        </article>
        <div className="road-verdicts">
          <div className="road-verdicts-heading"><span className="eyebrow">{t("YENİ YOL KARŞILAŞTIRMASI", "YENİ YOL MÜQAYİSƏSİ", "NEW-ROAD COMPARISON")}</span><strong>{t("Tek yön mü, çift yön mü?", "Bir, yoxsa iki istiqamət?", "One-way or two-way?")}</strong></div>
          {roadResults.length ? roadResults.map((scenario) => {
            const median = scenario.uncertainty?.medianDeltaPercent ?? scenario.deltaPercent;
            const probability = scenario.uncertainty?.probabilityOfWorsening ?? 0;
            const state = median >= 2 && probability >= .8 ? "worse" : median < -.2 ? "better" : probability >= .55 ? "risk" : "neutral";
            const label = state === "worse" ? t("KÖTÜLEŞTİRİYOR", "PİSLƏŞDİRİR", "WORSENS") : state === "better" ? t("İYİLEŞTİRİYOR", "YAXŞILAŞDIRIR", "IMPROVES") : state === "risk" ? t("RİSKLİ", "RİSKLİ", "RISKY") : t("BELİRGİN ETKİ YOK", "ƏHƏMİYYƏTLİ TƏSİR YOXDUR", "NO MATERIAL EFFECT");
            return <button type="button" key={scenario.key} className={`road-verdict state-${state} ${selectedScenarioKey === scenario.key ? "is-selected" : ""}`} onClick={() => onScenarioSelect?.(scenario)}><span><b>{scenarioName(language, scenario)}</b><small>{label}</small></span><strong>{median > 0 ? "+" : ""}{formatNumber(median)}%</strong><em>{t("kötüleşme", "pisləşmə", "worsening")} {Math.round(probability * 100)}%</em></button>;
          }) : <p className="no-road-result">{t("Yeni yol senaryosu çalıştırılmadı.", "Yeni yol ssenarisi işlədilmədi.", "No new-road scenario was run.")}</p>}
        </div>
      </div>

      <section className="plain-impact-section" aria-labelledby="plain-impact-title">
        <div className="plain-impact-heading"><span className="eyebrow">{t("ÇÖZÜM AÇIKLAMASI", "HƏLLİN İZAHI", "SOLUTION EXPLANATION")}</span><h3 id="plain-impact-title">{t("Hangi müdahale neyi değiştiriyor?", "Hansı müdaxilə nəyi dəyişir?", "What does each intervention change?")}</h3><p>{t("Her seçeneğin etkisini okuyun; harita düğmesi yerini ve geometrisini gösterir.", "Hər seçimin təsirini oxuyun; xəritə düyməsi yerini və geometriyasını göstərir.", "Read each option's effect; the map button shows its location and geometry.")}</p></div>
        <div className="plain-impact-grid">{explanationScenarios.map((scenario) => {
          const delta = scenario.deltaMinutes;
          const state = delta < -0.05 ? "better" : delta > 0.05 ? "worse" : "neutral";
          const stateLabel = state === "better" ? t("SÜRE AZALIYOR", "MÜDDƏT AZALIR", "TIME DECREASES") : state === "worse" ? t("SÜRE YÜKSELİYOR", "MÜDDƏT ARTIR", "TIME INCREASES") : t("BELİRGİN DEĞİŞİM YOK", "ƏHƏMİYYƏTLİ DƏYİŞİKLİK YOXDUR", "NO MATERIAL CHANGE");
          return <article key={scenario.key} className={`plain-impact-card is-${state} ${selectedScenarioKey === scenario.key ? "is-selected" : ""}`}>
            <div className="plain-impact-card-head"><span>{impactIcon(scenario)}</span><div><small>{stateLabel}</small><h4>{scenarioName(language, scenario)}</h4></div><strong>{delta > 0 ? "+" : ""}{formatNumber(delta)} {t("dk", "dəq", "min")}</strong></div>
            <p>{impactExplanation(scenario, language)}</p>
            <div className="plain-impact-times"><span>{t("Önce", "Əvvəl", "Before")} <b>{formatNumber(result.baseline.metrics.averageTravelTimeMinutes)} {t("dk", "dəq", "min")}</b></span><i>→</i><span>{t("Sonra", "Sonra", "After")} <b>{formatNumber(scenario.metrics.averageTravelTimeMinutes)} {t("dk", "dəq", "min")}</b></span></div>
            {scenario.affectedGeometry?.length ? <button type="button" onClick={(event) => { event.stopPropagation(); onScenarioFocus?.(scenario); }}><MapPinned size={16}/>{t("Haritada göster", "Xəritədə göstər", "Show on map")}</button> : <span className="map-unavailable">{t("Haritada işaretlenecek güvenli konum yok", "Xəritədə işarələnəcək təhlükəsiz mövqe yoxdur", "No safe location to mark on the map")}</span>}
          </article>;
        })}</div>
      </section>

      <details className="model-output-details">
        <summary><Sigma size={18}/><span><b>{t("Ayrıntılı matematiksel karşılaştırmayı aç", "Ətraflı riyazi müqayisəni aç", "Open detailed mathematical comparison")}</b><small>{t("Belirsizlik aralıkları, senaryo tablosu ve raporlar", "Qeyri-müəyyənlik intervalları, ssenari cədvəli və hesabatlar", "Uncertainty ranges, scenario table and reports")}</small></span></summary>
        <div className="model-output-body">
      <div className="result-section delta-section">
        <div className="section-heading">
          <div><span className="eyebrow">{t("ETKİ KARŞILAŞTIRMASI", "TƏSİR MÜQAYİSƏSİ", "IMPACT COMPARISON")}</span><h3>{t("Başlangıca göre denge süresi farkı", "Baza ilə müqayisədə tarazlıq müddəti fərqi", "Equilibrium time difference from baseline")}</h3></div>
          <p>{t("Çizgi P10–P90 aralığını, işaret medyan sonucu gösterir.", "Xətt P10–P90 intervalını, işarə median nəticəni göstərir.", "The line shows the P10–P90 range; the marker is the median result.")}</p>
        </div>
        <div className="delta-chart" role="img" aria-label={t("Senaryo etki grafiği", "Ssenari təsir qrafiki", "Scenario impact chart")}>
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
                <span className="delta-label">{scenarioName(language, scenario)}</span>
                <span className="delta-track" style={style}><i className="delta-range" /><i className={`delta-marker ${median > 0 ? "is-negative" : median < 0 ? "is-positive" : ""}`} /></span>
                <strong className={median > 0 ? "metric-worse" : median < 0 ? "metric-better" : ""}>{median > 0 ? "+" : ""}{formatNumber(median)}%</strong>
              </button>
            );
          })}
        </div>
      </div>

      <div className="result-section scenario-ledger">
        <div className="section-heading is-inline">
          <div><span className="eyebrow">{t("SENARYO DEFTERİ", "SSENARİ JURNALI", "SCENARIO LEDGER")}</span><h3>{t("Karşılaştırılabilir model çıktıları", "Müqayisə edilə bilən model nəticələri", "Comparable model outputs")}</h3></div>
          <div className="report-actions">
            <button type="button" onClick={() => downloadBlob("braess-analysis.csv", csvReport(result), "text/csv;charset=utf-8")}><Download size={15} />CSV</button>
            <button type="button" onClick={() => pngReport(result, language)}><Download size={15} />PNG</button>
            <button type="button" onClick={() => downloadBlob("braess-analysis.html", htmlReport(result, language), "text/html;charset=utf-8")}><FileCode2 size={15} />HTML</button>
          </div>
        </div>
        <div className="scenario-table" role="table">
          <div className="scenario-table-head" role="row"><span>{t("Senaryo", "Ssenari", "Scenario")}</span><span>{t("Denge süresi", "Tarazlıq müddəti", "Equilibrium time")}</span><span>{t("Fark", "Fərq", "Delta")}</span><span>P10–P90</span><span>{t("Yakınsama", "Yaxınlaşma", "Convergence")}</span></div>
          {allResults.map((scenario) => (
            <button type="button" role="row" className={`scenario-table-row ${selectedScenarioKey === scenario.key ? "is-selected" : ""}`} key={scenario.key} onClick={() => onScenarioSelect?.(scenario)}>
              <span><b>{scenarioName(language, scenario)}</b><small>{t("Model çıktısı ve müdahale geometrisi karşılaştırıldı.", "Model nəticəsi və müdaxilə geometriyası müqayisə edildi.", "Model output and intervention geometry were compared.")}</small></span>
              <span data-label={t("Denge süresi", "Tarazlıq müddəti", "Equilibrium time")}>{formatNumber(scenario.metrics.averageTravelTimeMinutes)} {t("dk", "dəq", "min")}</span>
              <span data-label={t("Fark", "Fərq", "Delta")} className={scenario.deltaPercent > 0 ? "metric-worse" : scenario.deltaPercent < 0 ? "metric-better" : ""}>{scenario.deltaPercent > 0 ? <ArrowUpRight size={15}/> : scenario.deltaPercent < 0 ? <ArrowDownRight size={15}/> : null}{scenario.deltaPercent > 0 ? "+" : ""}{formatNumber(scenario.deltaPercent)}%</span>
              <span data-label="P10–P90">{scenario.uncertainty ? `${formatNumber(scenario.uncertainty.p10DeltaPercent)}–${formatNumber(scenario.uncertainty.p90DeltaPercent)}%` : "—"}</span>
              <span data-label={t("Yakınsama", "Yaxınlaşma", "Convergence")}><i className={`status-dot ${scenario.metrics.converged ? "is-ok" : "is-error"}`}/>{scenario.metrics.converged ? `${scenario.metrics.iterations} iter.` : t("Yakınsamadı", "Yaxınlaşmadı", "Not converged")}</span>
            </button>
          ))}
        </div>
      </div>
        </div>
      </details>

      <details className="technical-details">
        <summary><Sigma size={17}/>{t("Model denklemleri, varsayımlar ve tanılama", "Model tənlikləri, fərziyyələr və diaqnostika", "Model equations, assumptions and diagnostics")}</summary>
        <div className="technical-grid">
          <div><span className="eyebrow">BPR</span><code>tₐ(xₐ) = tₐ⁰ [1 + 0.15(xₐ/cₐ)⁴] + dₛ</code><p>{t("Kapasite ve sinyal gecikmesini birlikte kullanan yönlü kenar maliyeti.", "Tutum və siqnal gecikməsini birlikdə istifadə edən istiqamətli kənar xərci.", "Directed edge cost using capacity and signal delay.")}</p></div>
          <div><span className="eyebrow">FRANK–WOLFE</span><code>relative gap ≤ 1 × 10⁻⁴</code><p>{result.diagnostics.model}</p></div>
          <div><span className="eyebrow">{t("AĞ", "ŞƏBƏKƏ", "NETWORK")}</span><code>{result.diagnostics.nodeCount} {t("düğüm", "düyün", "nodes")} · {result.diagnostics.edgeCount} {t("kenar", "kənar", "edges")}</code><p>{t("Kapasite ve talep varsayımları sonuçla birlikte raporlanır.", "Tutum və tələb fərziyyələri nəticə ilə birlikdə təqdim olunur.", "Capacity and demand assumptions are reported with the result.")}</p></div>
          <div><span className="eyebrow">{t("KAYNAKLAR", "MƏNBƏLƏR", "SOURCES")}</span><code>{result.provenance.map((item) => item.source).join(" + ")}</code><p>{t("Rota, model ve kullanıcı girdilerinin kökeni izlenir.", "Marşrut, model və istifadəçi girişlərinin mənşəyi izlənir.", "Route, model and user-input provenance is tracked.")}</p></div>
        </div>
        {result.diagnostics.edgeFlows.length > 0 && <div className="edge-flow-panel">
          <div><span className="eyebrow">{t("EN YOĞUN KENARLAR", "ƏN YÜKLÜ KƏNARLAR", "MOST LOADED EDGES")}</span><p>{t("Akım, kapasite ve denge maliyeti kapasite kaynağıyla birlikte gösterilir.", "Axın, tutum və tarazlıq xərci tutum mənbəyi ilə birlikdə göstərilir.", "Flow, capacity and equilibrium cost are shown with the capacity source.")}</p></div>
          <div className="edge-flow-table">
            <div><span>{t("Kenar", "Kənar", "Edge")}</span><span>{t("Akım / kapasite", "Axın / tutum", "Flow / capacity")}</span><span>V/C</span><span>{t("Maliyet", "Xərc", "Cost")}</span><span>{t("Kapasite kaynağı", "Tutum mənbəyi", "Capacity source")}</span></div>
            {result.diagnostics.edgeFlows.slice(0, 8).map((edge) => <div key={edge.edgeId}><span data-label={t("Kenar", "Kənar", "Edge")} title={edge.edgeId}>{edge.edgeId}</span><span data-label={t("Akım / kapasite", "Axın / tutum", "Flow / capacity")}>{formatNumber(edge.flowVehPerHour, 0)} / {formatNumber(edge.capacityVehPerHour, 0)}</span><strong data-label="V/C" className={edge.volumeCapacityRatio > 1 ? "metric-worse" : edge.volumeCapacityRatio > .8 ? "metric-warning" : ""}>{formatNumber(edge.volumeCapacityRatio, 2)}</strong><span data-label={t("Maliyet", "Xərc", "Cost")}>{formatNumber(edge.travelTimeMinutes, 2)} {t("dk", "dəq", "min")}</span><span data-label={t("Kapasite kaynağı", "Tutum mənbəyi", "Capacity source")}>{edge.capacitySource === "user" ? t("Kullanıcı", "İstifadəçi", "User") : edge.capacitySource === "road-class" ? t("Yol sınıfı", "Yol sinfi", "Road class") : t("Hız sınıfı tahmini", "Sürət sinfi təxmini", "Speed-class estimate")}</span></div>)}
          </div>
        </div>}
      </details>
    </section>
  );
}
