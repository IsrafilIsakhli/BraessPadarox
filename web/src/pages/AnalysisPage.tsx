import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, CircleDot, Gauge, MapPin, PencilRuler, RotateCcw, Route, Settings2, Waypoints } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { AnalysisMap, type MapInteractionMode } from "../components/AnalysisMap";
import { ResultsDashboard } from "../components/ResultsDashboard";
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
  const tr = language === "tr";
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
    emergency: false
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
        throw new Error(tr ? "Bu iki nokta arasında sürülebilir yol bulunamadı." : "No drivable road was found between these points.");
      }
      setNewRoadGeometry((current) => mergeRoadAlignedGeometry(current, roadGeometry));
      setNewRoadWaypoints((current) => [...current, point].slice(0, 12));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (tr ? "Yeni yol, yol ağına oturtulamadı." : "The new road could not be aligned to the road network."));
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
          type: "newRoad", id: "auto-road-one-way", name: tr ? "Yeni Yol · Tek Yön" : "New Road · One-way",
          geometry, direction: "one-way", laneCount, speedLimitKmh: speedLimit,
          capacityVehPerHour: capacity ? Number(capacity) : undefined
        });
        scenarios.push({
          type: "newRoad", id: "auto-road-two-way", name: tr ? "Yeni Yol · Çift Yön" : "New Road · Two-way",
          geometry, direction: "two-way", laneCount, speedLimitKmh: speedLimit,
          capacityVehPerHour: capacity ? Number(capacity) : undefined
        });
      }
    }
    if (scenarioFlags.newRoad) scenarios.push({
      type: "newRoad", id: "user-new-road", name: tr ? "Çizilen Yeni Yol" : "Drawn New Road",
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
      setError(tr ? "Talep araç/saat olarak girilir. 100'den küçük değerleri silin veya en az 100 girin (ör. 1200)." : "Demand is entered in vehicles/hour. Clear values below 100 or enter at least 100 (for example 1200)." );
      return;
    }
    if (newRoadRouting) {
      setError(tr ? "Yeni yol seçilen noktalar arasında yol ağına oturtuluyor. Birkaç saniye bekleyin." : "The new road is being aligned to the road network. Please wait a moment.");
      return;
    }
    if (scenarioFlags.newRoad && newRoadWaypoints.length < 2) {
      setError(tr ? "Yeni yol senaryosu için haritada en az iki düğüm seçin." : "Select at least two map vertices for the new road scenario.");
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
      setError(caught instanceof Error ? caught.message : (tr ? "Analiz tamamlanamadı." : "Analysis could not be completed."));
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStart(defaultStart); setEnd(defaultEnd); setMode("static"); setNewRoadGeometry([]); setNewRoadWaypoints([]); setRouteData([]);
    setResult(null); setError(""); setInteractionMode(null);
    setScenarioFlags({ autoRoads: true, newRoad: false, closure: true, signal: true, emergency: false });
  }

  function focusScenarioOnMap(scenario: AdvancedScenarioResult) {
    setSelectedScenario(scenario);
    window.setTimeout(() => document.getElementById("analysis-map-workspace")?.scrollIntoView({ behavior: "smooth", block: "center" }), 40);
  }

  return (
    <main className="analysis-page">
      <section className="analysis-intro">
        <div><span className="eyebrow">{tr ? "BRAESS PARADOKSU TRAFİK ANALİZÖRÜ" : "BRAESS PARADOX TRAFFIC ANALYZER"}</span><h1>{tr ? "Yeni yol trafiği iyileştirir mi, kötüleştirir mi?" : "Will a new road improve traffic—or make it worse?"}</h1></div>
        <p>{tr ? "Tek yön, çift yön, trafik lambası ve güvenli yol kapatma seçeneklerini aynı koridorda otomatik karşılaştırın. Sonuç doğrudan VAR, YOK veya OLASI olarak gösterilir." : "Automatically compare one-way, two-way, traffic-signal and safe-closure options on the same corridor. The result is shown directly as DETECTED, NOT DETECTED or POSSIBLE."}</p>
      </section>

      <div className="analysis-workbench">
        <details className="control-panel" open={controlsOpen} onToggle={(event) => setControlsOpen(event.currentTarget.open)}>
          <summary><Settings2 size={18} /><span>{tr ? "Analiz ayarları" : "Analysis controls"}</span><small>{selectedCount} {tr ? "senaryo" : "scenarios"}</small></summary>
          <div className="control-panel-body">
            <section className="control-step">
              <div className="step-heading"><span>01</span><div><h2>{tr ? "Güzergâh" : "Corridor"}</h2><p>{tr ? "Başlangıç ve varış noktaları" : "Start and destination points"}</p></div></div>
              {(["start", "end"] as const).map((kind) => {
                const point = kind === "start" ? start : end;
                const label = kind === "start" ? (tr ? "Başlangıç" : "Start") : (tr ? "Varış" : "Destination");
                return <div className="coordinate-block" key={kind}>
                  <div className="field-label"><span><i className={`point-dot is-${kind}`} />{label}</span><button type="button" onClick={() => setInteractionMode(interactionMode === kind ? null : kind)}><MapPin size={15} />{tr ? "Haritadan" : "From map"}</button></div>
                  <div className="coordinate-grid"><label><span>LAT</span><input aria-label={`${label} latitude`} type="number" step="0.00001" value={point.lat} onChange={(event) => updateCoordinate(kind, "lat", event.target.value)} /></label><label><span>LON</span><input aria-label={`${label} longitude`} type="number" step="0.00001" value={point.lon} onChange={(event) => updateCoordinate(kind, "lon", event.target.value)} /></label></div>
                </div>;
              })}
            </section>

            <section className="control-step">
              <div className="step-heading"><span>02</span><div><h2>{tr ? "Talep ve veri" : "Demand & data"}</h2><p>{tr ? "Kalibrasyon kaynağını seçin" : "Choose the calibration source"}</p></div></div>
              <div className="segmented-control">
                <button type="button" className={mode === "static" ? "active" : ""} onClick={() => setMode("static")}><Waypoints size={16} />{tr ? "Statik model" : "Static model"}</button>
                <button type="button" className={mode === "live-calibrated" ? "active" : ""} onClick={() => setMode("live-calibrated")}><Activity size={16} />{tr ? "Canlı kalibrasyon" : "Live calibrated"}</button>
              </div>
              <p className="field-help">{mode === "live-calibrated" ? (tr ? "TomTom canlı hızları sunucuda alınır; bulunamazsa statik rota kullanılır." : "TomTom live speeds are retrieved server-side; the static route remains as fallback.") : (tr ? "OSRM rota geometrisi ve açıklanmış kapasite tahminleri kullanılır." : "Uses OSRM route geometry and disclosed capacity estimates.")}</p>
              <div className="demand-grid">
                <label><span>{tr ? "Gidiş talebi" : "Forward demand"}</span><div className="input-suffix"><input type="number" min="100" step="100" max="12000" placeholder={tr ? "Otomatik / ör. 1200" : "Automatic / e.g. 1200"} value={forwardDemand} onChange={(event) => setForwardDemand(event.target.value)} /><small>{tr ? "araç/sa" : "veh/h"}</small></div></label>
                <label><span>{tr ? "Dönüş talebi" : "Reverse demand"}</span><div className="input-suffix"><input type="number" min="100" step="100" max="12000" placeholder={tr ? "Otomatik / ör. 800" : "Automatic / e.g. 800"} value={reverseDemand} onChange={(event) => setReverseDemand(event.target.value)} /><small>{tr ? "araç/sa" : "veh/h"}</small></div></label>
              </div>
              <p className="demand-note">{tr ? "Boş bırakırsanız talep model tarafından tahmin edilir. Değerler araç/saat cinsindedir." : "Leave blank for model estimation. Values are vehicles per hour."}</p>
            </section>

            <section className="control-step scenario-control">
              <div className="step-heading"><span>03</span><div><h2>{tr ? "Müdahaleler" : "Interventions"}</h2><p>{tr ? "Birden fazla senaryo seçilebilir" : "Multiple scenarios are allowed"}</p></div></div>
              <div className="scenario-options">
                <label className={scenarioFlags.autoRoads ? "active" : ""}><input type="checkbox" checked={scenarioFlags.autoRoads} onChange={() => toggleScenario("autoRoads")} /><Waypoints size={18} /><span><b>{tr ? "Otomatik yeni yol testi" : "Automatic new-road test"}</b><small>{tr ? "Tek yön + çift yön birlikte karşılaştırılır" : "One-way + two-way are compared together"}</small></span></label>
                <label className={scenarioFlags.newRoad ? "active" : ""}><input type="checkbox" checked={scenarioFlags.newRoad} onChange={() => toggleScenario("newRoad")} /><PencilRuler size={18} /><span><b>{tr ? "Yeni yol" : "New road"}</b><small>{newRoadRouting ? (tr ? "Yol ağına oturtuluyor…" : "Aligning to roads…") : newRoadWaypoints.length >= 2 ? `${newRoadWaypoints.length} ${tr ? "kontrol noktası" : "waypoints"}` : (tr ? "Haritada en az 2 nokta seçin" : "Select at least 2 map points")}</small></span></label>
                <label className={scenarioFlags.closure ? "active" : ""}><input type="checkbox" checked={scenarioFlags.closure} onChange={() => toggleScenario("closure")} /><Route size={18} /><span><b>{tr ? "Güvenli kapatma" : "Safe closure"}</b><small>{tr ? "Bağlantıyı bozmayan aday" : "Connectivity-preserving candidate"}</small></span></label>
                <label className={scenarioFlags.signal ? "active" : ""}><input type="checkbox" checked={scenarioFlags.signal} onChange={() => toggleScenario("signal")} /><CircleDot size={18} /><span><b>{tr ? "Sinyal optimizasyonu" : "Signal optimization"}</b><small>{tr ? "Webster gecikme modeli" : "Webster delay model"}</small></span></label>
                <label className={scenarioFlags.emergency ? "active" : ""}><input type="checkbox" checked={scenarioFlags.emergency} onChange={() => toggleScenario("emergency")} /><Gauge size={18} /><span><b>{tr ? "Acil koridor" : "Emergency corridor"}</b><small>{tr ? "Ayrı ETA değerlendirmesi" : "Separate ETA assessment"}</small></span></label>
              </div>

              {scenarioFlags.newRoad && <div className="new-road-editor">
                <div className="inline-actions"><button type="button" className={interactionMode === "newRoad" ? "active" : ""} disabled={newRoadRouting} onClick={() => setInteractionMode(interactionMode === "newRoad" ? null : "newRoad")}><PencilRuler size={15} />{interactionMode === "newRoad" ? (tr ? "Çizimi bitir" : "Finish drawing") : (tr ? "Çizime devam" : "Continue drawing")}</button><button type="button" disabled={newRoadRouting} onClick={() => { setNewRoadGeometry([]); setNewRoadWaypoints([]); }}><RotateCcw size={15} />{tr ? "Temizle" : "Clear"}</button></div>
                <p className="field-help">{tr ? "Seçtiğiniz kontrol noktaları arasındaki çizgi, sürülebilir OSM yollarına otomatik oturtulur; binaların üzerinden düz bağlantı kurulmaz." : "The line between selected waypoints is automatically aligned to drivable OSM roads; no straight connection is drawn through buildings."}</p>
                <div className="two-column-fields"><label><span>{tr ? "Yön" : "Direction"}</span><select value={roadDirection} onChange={(event) => setRoadDirection(event.target.value as "one-way" | "two-way")}><option value="two-way">{tr ? "Çift yön" : "Two-way"}</option><option value="one-way">{tr ? "Tek yön" : "One-way"}</option></select></label><label><span>{tr ? "Şerit" : "Lanes"}</span><input type="number" min="1" max="8" value={laneCount} onChange={(event) => setLaneCount(Number(event.target.value))} /></label><label><span>{tr ? "Hız sınırı" : "Speed limit"}</span><div className="input-suffix"><input type="number" min="10" max="160" value={speedLimit} onChange={(event) => setSpeedLimit(Number(event.target.value))} /><small>km/h</small></div></label><label><span>{tr ? "Kapasite" : "Capacity"}</span><input type="number" min="100" max="20000" placeholder={tr ? "Tahmin et" : "Estimate"} value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label></div>
              </div>}

              <button type="button" className="advanced-toggle" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((open) => !open)}><Settings2 size={15} />{tr ? "Gelişmiş sinyal ayarları" : "Advanced signal settings"}</button>
              {advancedOpen && <div className="two-column-fields advanced-fields"><label><span>{tr ? "Döngü süresi" : "Cycle length"}</span><div className="input-suffix"><input type="number" min="30" max="240" value={cycleSeconds} onChange={(event) => setCycleSeconds(Number(event.target.value))} /><small>sn</small></div></label><label><span>{tr ? "Yeşil oranı" : "Green ratio"}</span><div className="input-suffix"><input type="number" min="15" max="85" value={greenRatio} onChange={(event) => setGreenRatio(Number(event.target.value))} /><small>%</small></div></label></div>}
            </section>

            {error && <div className="form-error" role="alert">{error}</div>}
            <div className="control-actions"><button type="button" className="primary-action" disabled={loading || newRoadRouting} onClick={runAnalysis}>{newRoadRouting ? (tr ? "Yola oturtuluyor…" : "Aligning to roads…") : loading ? (tr ? "Denge çözülüyor…" : "Solving equilibrium…") : (tr ? "Analizi çalıştır" : "Run analysis")}<ArrowRight size={18} /></button><button type="button" className="secondary-action" onClick={reset}><RotateCcw size={16} />{tr ? "Sıfırla" : "Reset"}</button></div>
          </div>
        </details>

        <section className="map-workspace" id="analysis-map-workspace">
          <div className="map-toolbar">
            <div><span className="live-indicator"><i className={mode === "live-calibrated" ? "pulse" : ""} />{mode === "live-calibrated" ? (tr ? "Canlı kalibrasyon" : "Live calibration") : (tr ? "Statik koridor" : "Static corridor")}</span><small>{coordinateText(start)} → {coordinateText(end)}</small></div>
            <div className="map-toolbar-meta"><span>{routeData.length || "—"} {tr ? "rota" : "routes"}</span><span>{newRoadWaypoints.length} {tr ? "kontrol noktası" : "waypoints"}</span></div>
          </div>
          <AnalysisMap language={language} start={start} end={end} routes={mapRoutes} liveTraffic={result?.liveTraffic} scenario={selectedScenario} newRoadGeometry={newRoadGeometry} interactionMode={interactionMode} onMapPick={handleMapPick} />
          {mappableScenarios.length > 0 && <div className="map-scenario-switcher" aria-label={tr ? "Haritada gösterilecek müdahale" : "Action shown on the map"}>
            <span>{tr ? "Haritada göster" : "Show on map"}</span>
            <div>{orderedMapScenarios.map((scenario) => <button type="button" key={scenario.key} className={selectedScenario?.key === scenario.key ? "active" : ""} onClick={() => setSelectedScenario(scenario)}>
              {scenario.type === "signal" ? <CircleDot size={15} /> : scenario.type === "closure" ? <Route size={15} /> : <Waypoints size={15} />}
              <b>{scenario.title}</b><small>{scenario.deltaMinutes > 0 ? "+" : ""}{scenario.deltaMinutes.toFixed(1)} {tr ? "dk" : "min"}</small>
            </button>)}</div>
          </div>}
          {!result && !loading && <div className="map-empty-state"><Waypoints size={20} /><span>{tr ? "Analizi çalıştırın: mevcut ağ, tek yönlü yeni yol, çift yönlü yeni yol, sinyal ve kapatma seçenekleri karşılaştırılsın." : "Run the analysis to compare the current network, one-way road, two-way road, signal and closure options."}</span></div>}
          {loading && <div className="map-loading" role="status"><i /><strong>{tr ? "100 belirsizlik örneklemesi çalışıyor" : "Running 100 uncertainty samples"}</strong><span>{tr ? "Yönlü ağ dengesi kuruluyor…" : "Solving the directed network equilibrium…"}</span></div>}
        </section>
      </div>

      <div className="mobile-run-bar"><button type="button" disabled={loading || newRoadRouting} onClick={runAnalysis}>{newRoadRouting ? (tr ? "Yola oturtuluyor…" : "Aligning to roads…") : loading ? (tr ? "Analiz ediliyor…" : "Analyzing…") : (tr ? "Analizi çalıştır" : "Run analysis")}<ArrowRight size={18} /></button></div>
      {result && <div id="analysis-results" className="analysis-results-wrap"><ResultsDashboard language={language} result={result} selectedScenarioKey={selectedScenario?.key} onScenarioSelect={setSelectedScenario} onScenarioFocus={focusScenarioOnMap} /></div>}
    </main>
  );
}
