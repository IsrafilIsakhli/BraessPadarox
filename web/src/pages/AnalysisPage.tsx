import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, CircleDot, Gauge, MapPin, PencilRuler, RotateCcw, Route, Settings2, Sigma, Waypoints } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { AnalysisMap, type MapInteractionMode } from "../components/AnalysisMap";
import { ResearchRail } from "../components/ResearchRail";
import { ResultsDashboard } from "../components/ResultsDashboard";
import { localized, scenarioName } from "../localization";
import { runAdvancedAnalysis } from "../services/api";
import {
  deriveRoadAlignedConnector,
  fetchDrivingRoutes,
  mergeRoadAlignedGeometry
} from "../services/routing";
import type {
  AdvancedScenarioInput,
  AdvancedScenarioResult,
  AdvancedSimulationResponse,
  AnalysisMode,
  Coordinates,
  Language,
  RouteData
} from "../types";

const defaultStart: Coordinates = { lat: 40.4266, lon: 49.9187 };
const defaultEnd: Coordinates = { lat: 40.4042, lon: 49.8075 };

function queryCoordinate(value: string | null, fallback: Coordinates): Coordinates {
  if (!value) return fallback;
  const [lat, lon] = value.split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : fallback;
}

function coordinateText(point: Coordinates): string {
  return `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
}

type ScenarioFlags = {
  autoRoads: boolean;
  newRoad: boolean;
  closure: boolean;
  signal: boolean;
  emergency: boolean;
};

export function AnalysisPage({ language }: { language: Language }) {
  const t = (trText: string, azText: string, enText: string) => localized(language, trText, azText, enText);
  const [searchParams] = useSearchParams();
  const [start, setStart] = useState(() => queryCoordinate(searchParams.get("start"), defaultStart));
  const [end, setEnd] = useState(() => queryCoordinate(searchParams.get("end"), defaultEnd));
  const [mode, setMode] = useState<AnalysisMode>(searchParams.get("mode") === "live-calibrated" ? "live-calibrated" : "static");
  const [interactionMode, setInteractionMode] = useState<MapInteractionMode>(null);
  const [newRoadGeometry, setNewRoadGeometry] = useState<[number, number][]>([]);
  const [newRoadWaypoints, setNewRoadWaypoints] = useState<Coordinates[]>([]);
  const [newRoadRouting, setNewRoadRouting] = useState(false);
  const [routeData, setRouteData] = useState<RouteData[]>([]);
  const [result, setResult] = useState<AdvancedSimulationResponse | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<AdvancedScenarioResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(() => !window.matchMedia("(max-width: 767px)").matches);
  const [forwardDemand, setForwardDemand] = useState("");
  const [reverseDemand, setReverseDemand] = useState("");
  const [roadDirection, setRoadDirection] = useState<"one-way" | "two-way">("two-way");
  const [laneCount, setLaneCount] = useState(2);
  const [speedLimit, setSpeedLimit] = useState(50);
  const [capacity, setCapacity] = useState("");
  const [cycleSeconds, setCycleSeconds] = useState(90);
  const [greenRatio, setGreenRatio] = useState(48);
  const [scenarioFlags, setScenarioFlags] = useState<ScenarioFlags>({
    autoRoads: true,
    newRoad: false,
    closure: true,
    signal: true,
    emergency: true
  });

  useEffect(() => setError(""), [language]);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)");
    const syncPanel = () => setControlsOpen(!mobile.matches);
    mobile.addEventListener("change", syncPanel);
    return () => mobile.removeEventListener("change", syncPanel);
  }, []);

  useEffect(() => {
    if (!result) return;
    if (window.matchMedia("(max-width: 767px)").matches) setControlsOpen(false);
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        document.getElementById("analysis-results")?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [result]);

  const selectedCount = Object.values(scenarioFlags).filter(Boolean).length;
  const mapDecisionStatus = result?.decision.status ?? "pending";
  const mapDecisionLabel = mapDecisionStatus === "detected"
    ? t("BRAESS PARADOKSU: VAR", "BRAESS PARADOKSU: VAR", "BRAESS PARADOX: DETECTED")
    : mapDecisionStatus === "possible"
      ? t("BRAESS PARADOKSU: OLASI", "BRAESS PARADOKSU: MÜMKÜNDÜR", "BRAESS PARADOX: POSSIBLE")
      : mapDecisionStatus === "inconclusive"
        ? t("KARAR: YETERSİZ", "QƏRAR: QEYRİ-KAFİ", "DECISION: INCONCLUSIVE")
        : mapDecisionStatus === "not-detected"
          ? t("BRAESS PARADOKSU: YOK", "BRAESS PARADOKSU: YOXDUR", "BRAESS PARADOX: NOT DETECTED")
          : t("BRAESS KARARI BEKLENİYOR", "BRAESS QƏRARI GÖZLƏNİLİR", "BRAESS DECISION PENDING");
  const snapshotLabel = result?.liveTraffic?.snapshotAt
    ? new Intl.DateTimeFormat(language === "en" ? "en-GB" : language === "az" ? "az-AZ" : "tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.liveTraffic.snapshotAt))
    : t("Statik ağ verisi", "Statik şəbəkə məlumatı", "Static network data");
  const mapRoutes = useMemo(() => result?.liveTraffic?.routes.length ? undefined : routeData, [result, routeData]);
  const mappableScenarios = useMemo(() => result?.scenarios.filter((scenario) => scenario.affectedGeometry?.length) ?? [], [result]);
  const orderedMapScenarios = useMemo(() => [...mappableScenarios].sort((a, b) => Number(b.key === selectedScenario?.key) - Number(a.key === selectedScenario?.key)), [mappableScenarios, selectedScenario?.key]);

  function updateCoordinate(kind: "start" | "end", axis: "lat" | "lon", value: string) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    (kind === "start" ? setStart : setEnd)((current) => ({ ...current, [axis]: numeric }));
  }

  function toggleScenario(key: keyof ScenarioFlags) {
    setScenarioFlags((current) => ({ ...current, [key]: !current[key] }));
    if (key === "newRoad" && !scenarioFlags.newRoad && newRoadWaypoints.length < 2) setInteractionMode("newRoad");
  }

  async function appendNewRoadWaypoint(point: Coordinates) {
    if (newRoadRouting || newRoadWaypoints.length >= 12) return;
    const previous = newRoadWaypoints[newRoadWaypoints.length - 1];
    setScenarioFlags((current) => ({ ...current, newRoad: true }));

    if (!previous) {
      setNewRoadWaypoints([point]);
      setNewRoadGeometry([[point.lat, point.lon]]);
      return;
    }

    setNewRoadRouting(true);
    setError("");
    try {
      const routes = await fetchDrivingRoutes(previous, point, language);
      const roadGeometry = routes[0]?.geometry ?? [];
      if (roadGeometry.length < 2) {
        throw new Error(t("Bu iki nokta arasında sürülebilir yol bulunamadı.", "Bu iki nöqtə arasında avtomobil üçün yol tapılmadı.", "No drivable road was found between these points."));
      }
      setNewRoadGeometry((current) => mergeRoadAlignedGeometry(current, roadGeometry));
      setNewRoadWaypoints((current) => [...current, point].slice(0, 12));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Yeni yol, yol ağına oturtulamadı.", "Yeni yol yol şəbəkəsinə uyğunlaşdırılmadı.", "The new road could not be aligned to the road network."));
    } finally {
      setNewRoadRouting(false);
    }
  }

  function handleMapPick(point: Coordinates) {
    if (interactionMode === "start") {
      setStart(point);
      setInteractionMode(null);
    } else if (interactionMode === "end") {
      setEnd(point);
      setInteractionMode(null);
    } else if (interactionMode === "newRoad") {
      void appendNewRoadWaypoint(point);
    }
  }

  function buildScenarios(routes: RouteData[]): AdvancedScenarioInput[] {
    const scenarios: AdvancedScenarioInput[] = [];
    if (scenarioFlags.autoRoads) {
      const geometry = deriveRoadAlignedConnector(routes);
      if (geometry.length >= 2) {
        scenarios.push({
          type: "newRoad", id: "auto-road-one-way", name: t("Yeni Yol · Tek Yön", "Yeni yol · Bir istiqamət", "New Road · One-way"),
          geometry, direction: "one-way", laneCount, speedLimitKmh: speedLimit,
          capacityVehPerHour: capacity ? Number(capacity) : undefined
        });
        scenarios.push({
          type: "newRoad", id: "auto-road-two-way", name: t("Yeni Yol · Çift Yön", "Yeni yol · İki istiqamət", "New Road · Two-way"),
          geometry, direction: "two-way", laneCount, speedLimitKmh: speedLimit,
          capacityVehPerHour: capacity ? Number(capacity) : undefined
        });
      }
    }
    if (scenarioFlags.newRoad) scenarios.push({
      type: "newRoad", id: "user-new-road", name: t("Çizilen Yeni Yol", "Çəkilmiş yeni yol", "Drawn New Road"),
      geometry: newRoadGeometry, direction: roadDirection, laneCount, speedLimitKmh: speedLimit,
      capacityVehPerHour: capacity ? Number(capacity) : undefined
    });
    if (scenarioFlags.closure) scenarios.push({ type: "closure", id: "safe-closure" });
    if (scenarioFlags.signal) scenarios.push({ type: "signal", id: "webster-signal", cycleSeconds, greenRatio: greenRatio / 100 });
    if (scenarioFlags.emergency) scenarios.push({ type: "emergencyPriority", id: "emergency-corridor" });
    return scenarios;
  }

  async function runAnalysis() {
    const forward = forwardDemand ? Number(forwardDemand) : undefined;
    const reverse = reverseDemand ? Number(reverseDemand) : undefined;
    if ((forward !== undefined && forward > 0 && forward < 100) || (reverse !== undefined && reverse > 0 && reverse < 100)) {
      setError(t("Talep araç/saat olarak girilir. 100'den küçük değerleri silin veya en az 100 girin (ör. 1200).", "Tələb avtomobil/saat ilə daxil edilir. 100-dən kiçik dəyəri silin və ya ən azı 100 yazın (məs. 1200).", "Demand is entered in vehicles/hour. Clear values below 100 or enter at least 100 (for example 1200)."));
      return;
    }
    if (newRoadRouting) {
      setError(t("Yeni yol seçilen noktalar arasında yol ağına oturtuluyor. Birkaç saniye bekleyin.", "Yeni yol seçilmiş nöqtələr arasında yol şəbəkəsinə uyğunlaşdırılır. Bir neçə saniyə gözləyin.", "The new road is being aligned to the road network. Please wait a moment."));
      return;
    }
    if (scenarioFlags.newRoad && newRoadWaypoints.length < 2) {
      setError(t("Yeni yol senaryosu için haritada en az iki düğüm seçin.", "Yeni yol ssenarisi üçün xəritədə ən azı iki düyün seçin.", "Select at least two map vertices for the new road scenario."));
      setInteractionMode("newRoad");
      return;
    }
    setLoading(true);
    setError("");
    setSelectedScenario(null);
    try {
      const [routes, reverseRoutes] = await Promise.all([
        fetchDrivingRoutes(start, end, language),
        fetchDrivingRoutes(end, start, language)
      ]);
      setRouteData(routes);
      const response = await runAdvancedAnalysis({
        mode, language, start, end,
        demand: {
          forwardVehPerHour: forward,
          reverseVehPerHour: reverse
        },
        routeMeta: { routes, reverseRoutes },
        scenarios: buildScenarios(routes)
      });
      setResult(response);
      const roadFocus = [...response.scenarios]
        .filter((item) => item.type === "newRoad")
        .sort((a, b) => (b.uncertainty?.medianDeltaPercent ?? b.deltaPercent) - (a.uncertainty?.medianDeltaPercent ?? a.deltaPercent))[0];
      const recommendation = response.scenarios.find((item) => item.key === response.decision.recommendedScenarioKey) ?? response.baseline;
      setSelectedScenario(response.decision.status === "detected" || response.decision.status === "possible" ? roadFocus ?? recommendation : recommendation);
      window.setTimeout(() => document.getElementById("analysis-results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Analiz tamamlanamadı.", "Analiz tamamlanmadı.", "Analysis could not be completed."));
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStart(defaultStart); setEnd(defaultEnd); setMode("static"); setNewRoadGeometry([]); setNewRoadWaypoints([]); setRouteData([]);
    setResult(null); setError(""); setInteractionMode(null);
    setScenarioFlags({ autoRoads: true, newRoad: false, closure: true, signal: true, emergency: true });
  }

  function focusScenarioOnMap(scenario: AdvancedScenarioResult) {
    setSelectedScenario(scenario);
    window.setTimeout(() => document.getElementById("analysis-map-workspace")?.scrollIntoView({ behavior: "smooth", block: "center" }), 40);
  }

  return (
    <main className="analysis-page research-analysis-page">
      <section className="analysis-study-header">
        <div className="study-title">
          <span className="study-index">01</span>
          <div><span className="eyebrow">{t("KORİDOR DENEYİ", "KORİDOR TƏCRÜBƏSİ", "CORRIDOR EXPERIMENT")}</span><h1>{t("Braess Paradoksu Koridor Analizi", "Braess Paradoksu Koridor Analizi", "Braess Paradox Corridor Analysis")}</h1></div>
        </div>
        <div className="study-metadata" aria-label={t("Deney özeti", "Təcrübə xülasəsi", "Experiment summary")}>
          <div><span>{t("Konum", "Məkan", "Location")}</span><strong>⌖ Bakı, Azərbaycan</strong></div>
          <div><span>{t("Model", "Model", "Model")}</span><strong>▱ BPR · Wardrop UE</strong></div>
          <div><span>{t("Deney kimliği", "Təcrübə ID", "Experiment ID")}</span><strong>EXP–BAK–0147</strong></div>
          <div><span>{t("Veri", "Məlumat", "Data")}</span><strong>{snapshotLabel}</strong></div>
        </div>
      </section>

      <div className="analysis-workbench research-workbench">
        <details className="control-panel" open={controlsOpen} onToggle={(event) => setControlsOpen(event.currentTarget.open)}>
          <summary><Settings2 size={18} /><span>{t("Deney kurulumu", "Təcrübə quruluşu", "Experiment setup")}</span><small>{selectedCount} {t("senaryo", "ssenari", "scenarios")}</small></summary>
          <div className="control-panel-body">
            <section className="control-step">
              <div className="step-heading"><span>01</span><div><h2>{t("Koridor", "Koridor", "Corridor")}</h2><p>{t("Başlangıç ve varış noktaları", "Başlanğıc və təyinat nöqtələri", "Origin and destination")}</p></div></div>
              {(["start", "end"] as const).map((kind) => {
                const point = kind === "start" ? start : end;
                const label = kind === "start" ? t("Başlangıç", "Başlanğıc", "Origin") : t("Varış", "Təyinat", "Destination");
                return <div className="coordinate-block" key={kind}>
                  <div className="field-label"><span><i className={`point-dot is-${kind}`} />{label}</span><button type="button" onClick={() => setInteractionMode(interactionMode === kind ? null : kind)}><MapPin size={15} />{t("Haritadan seç", "Xəritədən seç", "Pick on map")}</button></div>
                  <div className="coordinate-grid"><label><span>LAT</span><input aria-label={`${label} latitude`} type="number" step="0.00001" value={point.lat} onChange={(event) => updateCoordinate(kind, "lat", event.target.value)} /></label><label><span>LON</span><input aria-label={`${label} longitude`} type="number" step="0.00001" value={point.lon} onChange={(event) => updateCoordinate(kind, "lon", event.target.value)} /></label></div>
                </div>;
              })}
            </section>

            <section className="control-step">
              <div className="step-heading"><span>02</span><div><h2>{t("Talep ve veri", "Tələb və məlumat", "Demand & data")}</h2><p>{t("Kalibrasyon kaynağını seçin", "Kalibrasiya mənbəyini seçin", "Choose the calibration source")}</p></div></div>
              <div className="segmented-control">
                <button type="button" className={mode === "static" ? "active" : ""} onClick={() => setMode("static")}><Waypoints size={16} />{t("Statik model", "Statik model", "Static model")}</button>
                <button type="button" className={mode === "live-calibrated" ? "active" : ""} onClick={() => setMode("live-calibrated")}><Activity size={16} />{t("Canlı kalibrasyon", "Canlı kalibrasiya", "Live calibrated")}</button>
              </div>
              <p className="field-help">{mode === "live-calibrated" ? t("TomTom canlı hızları sunucuda alınır; bulunamazsa statik rota kullanılır.", "TomTom canlı sürətləri serverdə alınır; tapılmazsa statik marşrut istifadə edilir.", "TomTom live speeds are retrieved server-side; static routing remains the fallback.") : t("OSRM geometrisi ve açıklanmış kapasite tahminleri kullanılır.", "OSRM geometriyası və açıqlanan tutum təxminləri istifadə olunur.", "OSRM geometry and disclosed capacity estimates are used.")}</p>
              <div className="demand-grid">
                <label><span>{t("Gidiş talebi", "Gediş tələbi", "Forward demand")}</span><div className="input-suffix"><input type="number" min="100" step="100" max="12000" placeholder={t("Otomatik / ör. 1200", "Avtomatik / məs. 1200", "Automatic / e.g. 1200")} value={forwardDemand} onChange={(event) => setForwardDemand(event.target.value)} /><small>{t("araç/sa", "avt/saat", "veh/h")}</small></div></label>
                <label><span>{t("Dönüş talebi", "Qayıdış tələbi", "Reverse demand")}</span><div className="input-suffix"><input type="number" min="100" step="100" max="12000" placeholder={t("Otomatik / ör. 800", "Avtomatik / məs. 800", "Automatic / e.g. 800")} value={reverseDemand} onChange={(event) => setReverseDemand(event.target.value)} /><small>{t("araç/sa", "avt/saat", "veh/h")}</small></div></label>
              </div>
              <p className="demand-note">{t("Boş bırakırsanız talep model tarafından tahmin edilir.", "Boş saxlanıldıqda tələb model tərəfindən təxmin edilir.", "Leave blank for model estimation.")}</p>
              <div className="model-protocol-card">
                <div><span>{t("Ağ modeli", "Şəbəkə modeli", "Network model")}</span><strong>BPR {t("(standart)", "(standart)", "(standard)")}</strong></div>
                <code>tₑ(x) = tₑ⁰ · [1 + α · (xₑ/cₑ)ᵝ]</code>
                <small>α = 0.15&nbsp;&nbsp;&nbsp; β = 4.00</small>
              </div>
            </section>

            <section className="control-step scenario-control">
              <div className="step-heading"><span>03</span><div><h2>{t("Müdahaleler", "Müdaxilələr", "Interventions")}</h2><p>{t("Birden fazla senaryo seçilebilir", "Bir neçə ssenari seçilə bilər", "Select multiple scenarios")}</p></div></div>
              <div className="scenario-options">
                <label className={scenarioFlags.autoRoads ? "active" : ""}><input type="checkbox" checked={scenarioFlags.autoRoads} onChange={() => toggleScenario("autoRoads")} /><Waypoints size={18} /><span><b>{t("Otomatik yeni yol testi", "Avtomatik yeni yol testi", "Automatic new-road test")}</b><small>{t("Tek ve çift yön birlikte karşılaştırılır", "Bir və iki istiqamət birlikdə müqayisə edilir", "One-way and two-way are compared")}</small></span></label>
                <label className={scenarioFlags.newRoad ? "active" : ""}><input type="checkbox" checked={scenarioFlags.newRoad} onChange={() => toggleScenario("newRoad")} /><PencilRuler size={18} /><span><b>{t("Yeni yol çiz", "Yeni yol çək", "Draw a new road")}</b><small>{newRoadRouting ? t("Yol ağına oturtuluyor…", "Yol şəbəkəsinə uyğunlaşdırılır…", "Aligning to roads…") : newRoadWaypoints.length >= 2 ? `${newRoadWaypoints.length} ${t("kontrol noktası", "nəzarət nöqtəsi", "waypoints")}` : t("Haritada en az 2 nokta seçin", "Xəritədə ən azı 2 nöqtə seçin", "Select at least 2 map points")}</small></span></label>
                <label className={scenarioFlags.closure ? "active" : ""}><input type="checkbox" checked={scenarioFlags.closure} onChange={() => toggleScenario("closure")} /><Route size={18} /><span><b>{t("Güvenli kapatma", "Təhlükəsiz bağlanma", "Safe closure")}</b><small>{t("Bağlantıyı bozmayan aday", "Əlaqəni pozmayan namizəd", "Connectivity-preserving candidate")}</small></span></label>
                <label className={scenarioFlags.signal ? "active" : ""}><input type="checkbox" checked={scenarioFlags.signal} onChange={() => toggleScenario("signal")} /><CircleDot size={18} /><span><b>{t("Sinyal optimizasyonu", "Siqnal optimallaşdırılması", "Signal optimization")}</b><small>{t("Webster gecikme modeli", "Webster gecikmə modeli", "Webster delay model")}</small></span></label>
                <label className={scenarioFlags.emergency ? "active" : ""}><input type="checkbox" checked={scenarioFlags.emergency} onChange={() => toggleScenario("emergency")} /><Gauge size={18} /><span><b>{t("Acil koridor", "Təcili koridor", "Emergency corridor")}</b><small>{t("Ayrı ETA değerlendirmesi", "Ayrı ETA qiymətləndirilməsi", "Separate ETA assessment")}</small></span></label>
              </div>

              {scenarioFlags.newRoad && <div className="new-road-editor">
                <div className="inline-actions"><button type="button" className={interactionMode === "newRoad" ? "active" : ""} disabled={newRoadRouting} onClick={() => setInteractionMode(interactionMode === "newRoad" ? null : "newRoad")}><PencilRuler size={15} />{interactionMode === "newRoad" ? t("Çizimi bitir", "Çəkməni bitir", "Finish drawing") : t("Çizime devam", "Çəkməyə davam et", "Continue drawing")}</button><button type="button" disabled={newRoadRouting} onClick={() => { setNewRoadGeometry([]); setNewRoadWaypoints([]); }}><RotateCcw size={15} />{t("Temizle", "Təmizlə", "Clear")}</button></div>
                <p className="field-help">{t("Kontrol noktaları arasındaki çizgi sürülebilir OSM yollarına oturtulur; binaların üzerinden geçmez.", "Nəzarət nöqtələri arasındakı xətt avtomobil üçün açıq OSM yollarına uyğunlaşdırılır; binaların üzərindən keçmir.", "The line is aligned to drivable OSM roads and never cuts through buildings.")}</p>
                <div className="two-column-fields"><label><span>{t("Yön", "İstiqamət", "Direction")}</span><select value={roadDirection} onChange={(event) => setRoadDirection(event.target.value as "one-way" | "two-way")}><option value="two-way">{t("Çift yön", "İki istiqamət", "Two-way")}</option><option value="one-way">{t("Tek yön", "Bir istiqamət", "One-way")}</option></select></label><label><span>{t("Şerit", "Zolaq", "Lanes")}</span><input type="number" min="1" max="8" value={laneCount} onChange={(event) => setLaneCount(Number(event.target.value))} /></label><label><span>{t("Hız sınırı", "Sürət həddi", "Speed limit")}</span><div className="input-suffix"><input type="number" min="10" max="160" value={speedLimit} onChange={(event) => setSpeedLimit(Number(event.target.value))} /><small>km/h</small></div></label><label><span>{t("Kapasite", "Tutum", "Capacity")}</span><input type="number" min="100" max="20000" placeholder={t("Tahmin et", "Təxmin et", "Estimate")} value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label></div>
              </div>}

              <button type="button" className="advanced-toggle" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((open) => !open)}><Settings2 size={15} />{t("Gelişmiş sinyal ayarları", "Qabaqcıl siqnal parametrləri", "Advanced signal settings")}</button>
              {advancedOpen && <div className="two-column-fields advanced-fields"><label><span>{t("Döngü süresi", "Dövr müddəti", "Cycle length")}</span><div className="input-suffix"><input type="number" min="30" max="240" value={cycleSeconds} onChange={(event) => setCycleSeconds(Number(event.target.value))} /><small>{t("sn", "san", "sec")}</small></div></label><label><span>{t("Yeşil oranı", "Yaşıl nisbəti", "Green ratio")}</span><div className="input-suffix"><input type="number" min="15" max="85" value={greenRatio} onChange={(event) => setGreenRatio(Number(event.target.value))} /><small>%</small></div></label></div>}
              <div className={`solver-protocol ${result?.baseline.metrics.converged ? "is-converged" : ""}`}>
                <span><Sigma size={15}/>{t("Denge çözümü", "Tarazlıq həlli", "Equilibrium solution")}</span>
                <strong>Frank–Wolfe</strong>
                <small>{result?.baseline.metrics.converged
                  ? `✓ ${t("Yakınsadı", "Yaxınlaşdı", "Converged")} · ${result.baseline.metrics.iterations} iter. · ε = ${result.baseline.metrics.relativeGap.toExponential(1)}`
                  : t("Yakınsama kuralı: relative gap ≤ 1 × 10⁻⁴", "Yaxınlaşma qaydası: relative gap ≤ 1 × 10⁻⁴", "Convergence rule: relative gap ≤ 1 × 10⁻⁴")}</small>
              </div>
            </section>

            {error && <div className="form-error" role="alert">{error}</div>}
            <div className="control-actions"><button type="button" className="primary-action" disabled={loading || newRoadRouting} onClick={runAnalysis}>{newRoadRouting ? t("Yola oturtuluyor…", "Yola uyğunlaşdırılır…", "Aligning to roads…") : loading ? t("Denge çözülüyor…", "Tarazlıq hesablanır…", "Solving equilibrium…") : t("Analizi çalıştır", "Analizi işə sal", "Run analysis")}<ArrowRight size={18} /></button><button type="button" className="secondary-action" onClick={reset}><RotateCcw size={16} />{t("Sıfırla", "Sıfırla", "Reset")}</button></div>
          </div>
        </details>

        <section className="map-workspace" id="analysis-map-workspace">
          <div className="map-toolbar">
            <div><span className="live-indicator"><i className={mode === "live-calibrated" ? "pulse" : ""} />{mode === "live-calibrated" ? t("Canlı kalibrasyon", "Canlı kalibrasiya", "Live calibration") : t("Statik koridor", "Statik koridor", "Static corridor")}</span><small>{coordinateText(start)} → {coordinateText(end)}</small></div>
            <div className="map-toolbar-meta"><span>FIG. 01</span><span>{routeData.length || "—"} {t("rota", "marşrut", "routes")}</span><span>{newRoadWaypoints.length} {t("kontrol noktası", "nəzarət nöqtəsi", "waypoints")}</span></div>
          </div>
          <AnalysisMap language={language} start={start} end={end} routes={mapRoutes} liveTraffic={result?.liveTraffic} scenarios={mappableScenarios} scenario={selectedScenario} newRoadGeometry={newRoadGeometry} interactionMode={interactionMode} onMapPick={handleMapPick} />
          <div className={`map-decision-badge status-${mapDecisionStatus}`}>
            <small>{t("ANLIK MODEL KARARI", "ANLIQ MODEL QƏRARI", "CURRENT MODEL DECISION")}</small>
            <strong>{mapDecisionLabel}</strong>
            <span>{result
              ? t("Karar 100 belirsizlik örneği ve kullanıcı dengesi üzerinden üretildi.", "Qərar 100 qeyri-müəyyənlik nümunəsi və istifadəçi tarazlığı əsasında hesablandı.", "Decision based on user equilibrium and 100 uncertainty samples.")
              : t("Kararı, çözüm katmanlarını ve değerleri görmek için analizi çalıştırın.", "Qərarı, həll laylarını və dəyərləri görmək üçün analizi başladın.", "Run the analysis to reveal the decision, solution layers and values.")}</span>
            {!result && !loading && <button type="button" onClick={runAnalysis}>{t("Şimdi analiz et", "İndi analiz et", "Run now")}<ArrowRight size={14}/></button>}
          </div>
          <div className="map-layer-dock" aria-label={t("Analiz katmanları", "Analiz layları", "Analysis layers")}>
            <span>{t("ANALİZ KATMANLARI", "ANALİZ LAYLARI", "ANALYSIS LAYERS")}</span>
            <div>
              <button type="button" className={!selectedScenario || selectedScenario.type === "baseline" ? "active" : ""} onClick={() => setSelectedScenario(result?.baseline ?? null)}><Waypoints size={14}/><b>{t("Mevcut ağ", "Mövcud şəbəkə", "Baseline")}</b></button>
              {result ? orderedMapScenarios.map((scenario) => <button type="button" key={scenario.key} className={selectedScenario?.key === scenario.key ? "active" : ""} onClick={() => setSelectedScenario(scenario)}>
                {scenario.type === "signal" ? <CircleDot size={14}/> : scenario.type === "closure" ? <Route size={14}/> : scenario.type === "emergencyPriority" ? <Gauge size={14}/> : <Waypoints size={14}/>}
                <b>{scenarioName(language, scenario)}</b><small>{scenario.deltaMinutes > 0 ? "+" : ""}{scenario.deltaMinutes.toFixed(1)} {t("dk", "dəq", "min")}</small>
              </button>) : <>
                <button type="button" disabled><Waypoints size={14}/><b>{t("Yeni yol · Tek/Çift", "Yeni yol · Bir/İki istiqamət", "New road · 1/2-way")}</b></button>
                <button type="button" disabled><CircleDot size={14}/><b>{t("Akıllı sinyal", "Ağıllı siqnal", "Smart signal")}</b></button>
                <button type="button" disabled><Route size={14}/><b>{t("Güvenli kapatma", "Təhlükəsiz bağlanma", "Safe closure")}</b></button>
                <button type="button" disabled><Gauge size={14}/><b>{t("Acil koridor", "Təcili koridor", "Emergency corridor")}</b></button>
              </>}
            </div>
          </div>
          {loading && <div className="map-loading" role="status"><i /><strong>{t("100 belirsizlik örneği çalışıyor", "100 qeyri-müəyyənlik nümunəsi işlənir", "Running 100 uncertainty samples")}</strong><span>{t("Yönlü ağ dengesi kuruluyor…", "İstiqamətli şəbəkə tarazlığı hesablanır…", "Solving directed network equilibrium…")}</span></div>}
          <div className="map-caption map-reading-guide">
            <div><span>{t("HARİTA NASIL OKUNUR?", "XƏRİTƏ NECƏ OXUNUR?", "HOW TO READ THE MAP")}</span><p>{t("Renk yol hızını, çizgi biçimi müdahale türünü gösterir.", "Rəng yol sürətini, xətt forması müdaxilə növünü göstərir.", "Colour shows speed; line style identifies the intervention.")}</p></div>
            <ul>
              <li><i className="guide-speed"/>{t("Yeşil akıcı · Turuncu yavaş · Kırmızı yoğun", "Yaşıl sərbəst · Narıncı yavaş · Qırmızı sıx", "Green free · Orange slow · Red congested")}</li>
              <li><i className="guide-road"/>{t("Kesik çizgi: önerilen yeni yol", "Kəsik xətt: təklif olunan yeni yol", "Dashed line: proposed new road")}</li>
              <li><b>🚦</b>{t("Sinyal müdahalesi", "Siqnal müdaxiləsi", "Signal intervention")}</li>
              <li><b>× / +</b>{t("Kapatma / acil koridor", "Bağlanma / təcili koridor", "Closure / emergency corridor")}</li>
            </ul>
          </div>
        </section>
        <ResearchRail language={language} mode={mode} routeCount={routeData.length || result?.liveTraffic?.routes.length || 0} result={result} selectedScenario={selectedScenario} />
      </div>

      <div className="mobile-run-bar"><button type="button" disabled={loading || newRoadRouting} onClick={runAnalysis}>{newRoadRouting ? t("Yola oturtuluyor…", "Yola uyğunlaşdırılır…", "Aligning to roads…") : loading ? t("Analiz ediliyor…", "Analiz aparılır…", "Analyzing…") : t("Analizi çalıştır", "Analizi işə sal", "Run analysis")}<ArrowRight size={18} /></button></div>
      {result && <div id="analysis-results" className="analysis-results-wrap"><ResultsDashboard language={language} result={result} selectedScenarioKey={selectedScenario?.key} onScenarioSelect={setSelectedScenario} onScenarioFocus={focusScenarioOnMap} /></div>}
    </main>
  );
}
