import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowRight, CheckCircle2, ChevronDown, CircleDot as TrafficLight, Download, Layers, MapPin, MousePointer2, Pause, Play, Plus, RotateCcw, Settings2, ShieldCheck, TrafficCone, Waypoints, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { AnalysisMap, type MapInteractionMode } from "../components/AnalysisMap";
import { ResultsDashboard } from "../components/ResultsDashboard";
import { StudioFindings, StudioCharts } from "../components/StudioFindings";
import { localized, scenarioName } from "../localization";
import { runAdvancedAnalysis } from "../services/api";
import { deriveRoadAlignedConnector, fetchDrivingRoutes, mergeRoadAlignedGeometry } from "../services/routing";
import type { AdvancedScenarioInput, AdvancedScenarioResult, AdvancedSimulationResponse, AnalysisMode, Coordinates, Language, RouteData } from "../types";

const initialStart = { lat: 40.4042, lon: 49.8075 };
const initialEnd = { lat: 40.4266, lon: 49.9187 };
type Tool = "select" | "newRoad" | "signal" | "closure" | "emergencyPriority";
function queryPoint(value: string | null, fallback: Coordinates) {
  const values = value?.split(",").map(Number);
  return values?.length === 2 && values.every(Number.isFinite) ? { lat: values[0], lon: values[1] } : fallback;
}

export function AnalysisPage({ language }: { language: Language }) {
  const t = (tr: string, az: string, en: string) => localized(language, tr, az, en);
  const [params] = useSearchParams();
  const [start, setStart] = useState(() => queryPoint(params.get("start"), initialStart));
  const [end, setEnd] = useState(() => queryPoint(params.get("end"), initialEnd));
  const [mode, setMode] = useState<AnalysisMode>(params.get("mode") === "live-calibrated" ? "live-calibrated" : "static");
  const [demand, setDemand] = useState(1600);
  const [reverseDemand, setReverseDemand] = useState(800);
  const [tool, setTool] = useState<Tool>("select");
  const [pick, setPick] = useState<MapInteractionMode>(null);
  const [direction, setDirection] = useState<"one-way" | "two-way">("two-way");
  const [lanes, setLanes] = useState(2);
  const [speed, setSpeed] = useState(50);
  const [cycle, setCycle] = useState(90);
  const [green, setGreen] = useState(48);
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [waypoints, setWaypoints] = useState<Coordinates[]>([]);
  const [geometry, setGeometry] = useState<[number, number][]>([]);
  const [placement, setPlacement] = useState<{ signal?: Coordinates; closure?: Coordinates }>({});
  const [result, setResult] = useState<AdvancedSimulationResponse | null>(null);
  const [selected, setSelected] = useState<AdvancedScenarioResult | null>(null);
  const [before, setBefore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [routing, setRouting] = useState(false);
  const [error, setError] = useState("");
  const [routeError, setRouteError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [setupOpen,setSetupOpen] = useState(() => !window.matchMedia("(max-width: 700px)").matches);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const routeBusy = useRef(false);
  const previousSettings = useRef("");
  const settingsKey = JSON.stringify([start, end, mode, demand, reverseDemand, direction, lanes, speed, cycle, green, geometry, placement]);
  useEffect(() => {
    const media=window.matchMedia("(max-width: 700px)");
    const sync=()=>setSetupOpen(!media.matches);
    media.addEventListener("change",sync);
    return ()=>media.removeEventListener("change",sync);
  },[]);
  useEffect(() => {
    if (previousSettings.current && previousSettings.current !== settingsKey) { setDirty(true); setPlaying(false); }
    previousSettings.current = settingsKey;
  }, [settingsKey]);
  useEffect(() => {
    let ignore = false;
    setRoutes([]); setRouteError("");
    fetchDrivingRoutes(start, end, language).then((data) => { if (!ignore) setRoutes(data); }).catch((caught) => { if (!ignore) setRouteError(String(caught.message)); });
    return () => { ignore = true; };
  }, [start, end, language]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setProgress((current) => (current + playbackSpeed * .12) % 100), 80);
    return () => window.clearInterval(timer);
  }, [playing, playbackSpeed]);

  const shownResult = dirty ? null : result;
  const shownScenarios = useMemo(() => before ? [] : shownResult?.scenarios.filter((item) => item.affectedGeometry?.length) ?? [], [before, shownResult]);
  const tools = [
    { key: "newRoad" as const, icon: Waypoints, label: t("Yeni yol", "Yeni yol", "New road") },
    { key: "signal" as const, icon: TrafficLight, label: t("Sinyal", "Siqnal", "Signal") },
    { key: "closure" as const, icon: TrafficCone, label: t("Yol kapat", "Yolu bağla", "Close road") },
    { key: "emergencyPriority" as const, icon: Plus, label: t("Acil koridor", "Təcili koridor", "Emergency") }
  ];
  function changeTool(next: Tool) { setTool(next); setPick(next === "newRoad" ? "newRoad" : null); }
  async function onPick(point: Coordinates) {
    if (pick === "start" || pick === "end") {
      (pick === "start" ? setStart : setEnd)(point); setPick(null); return;
    }
    if (tool === "signal" || tool === "closure") { setPlacement((current) => ({ ...current, [tool]: point })); changeTool("select"); return; }
    if (tool !== "newRoad" || routeBusy.current) return;
    if (!waypoints.length) { setWaypoints([point]); return; }
    routeBusy.current = true; setRouting(true); setError("");
    try {
      const segment = (await fetchDrivingRoutes(waypoints[waypoints.length - 1], point, language))[0];
      const merged = mergeRoadAlignedGeometry(geometry, segment.geometry);
      const last = segment.geometry[segment.geometry.length - 1];
      setGeometry(merged); setWaypoints((current) => [...current, { lat: last[0], lon: last[1] }]);
    } catch (caught) { setError((caught as Error).message); }
    finally { routeBusy.current = false; setRouting(false); }
  }
  async function run() {
    if (loading || routing) return;
    if (![demand, reverseDemand, lanes, speed].every(Number.isFinite) || demand < 100 || demand > 12000 || reverseDemand < 0 || reverseDemand > 12000 || lanes < 1 || lanes > 8 || speed < 10 || speed > 160) { setError(t("Talep ve yol özelliklerini geçerli aralıkta girin.", "Tələb və yol parametrlərini etibarlı aralıqda daxil edin.", "Enter demand and road attributes within their valid ranges.")); return; }
    if (waypoints.length === 1) { setError(t("Yeni yol için haritadan ikinci noktayı seçin.", "Yeni yol üçün xəritədə ikinci nöqtəni seçin.", "Select a second road point.")); return; }
    setLoading(true); setError(""); setPlaying(false);
    try {
      const [forward, reverse] = await Promise.all([fetchDrivingRoutes(start, end, language), fetchDrivingRoutes(end, start, language)]);
      const candidate = geometry.length > 1 ? geometry : deriveRoadAlignedConnector(forward);
      const scenarios: AdvancedScenarioInput[] = [
        { type: "newRoad", id: `road-${direction}`, geometry: candidate, waypoints: waypoints.length > 1 ? waypoints.map((point) => [point.lat,point.lon]) : undefined, direction, laneCount: lanes, speedLimitKmh: speed },
        { type: "signal", id: "signal", location: placement.signal, cycleSeconds: cycle, greenRatio: green / 100 },
        { type: "closure", id: "closure", location: placement.closure },
        { type: "emergencyPriority", id: "emergency" }
      ];
      const response = await runAdvancedAnalysis({ mode, language, start, end, demand: { forwardVehPerHour: demand, reverseVehPerHour: reverseDemand }, routeMeta: { routes: forward, reverseRoutes: reverse }, scenarios });
      setRoutes(forward); setResult(response); setDirty(false); setBefore(false);
      setSelected(response.scenarios.find((item) => item.type === "newRoad") ?? response.baseline);
      setProgress(0); setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches); changeTool("select");
    } catch (caught) { setError((caught as Error).message); }
    finally { setLoading(false); }
  }
  function exportReport() {
    if (!shownResult) return;
    const content = { exportedAt: new Date().toISOString(), input: { start, end, mode, demand, reverseDemand, direction, lanes, speed }, ...shownResult };
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "braess-lab-report.json"; link.click(); URL.revokeObjectURL(url);
  }
  return <main className="simulation-studio">
    <header className="studio-heading"><div><p>{t("DENEY / KORİDOR SİMÜLASYONU", "TƏCRÜBƏ / KORİDOR SİMULYASİYASI", "EXPERIMENT / CORRIDOR SIMULATION")}</p><h1>{t("Bir yol eklemek, herkesi yavaşlatabilir.", "Yeni yol hər kəsi ləngidə bilər.", "An extra road can slow everyone down.")}</h1></div><div className="study-stamp"><b>{mode === "static" ? t("Statik koridor modeli", "Statik koridor modeli", "Static corridor model") : t("Canlı trafik kalibrasyonu", "Canlı trafik kalibrasiyası", "Live traffic calibration")}</b><span>{dirty ? t("Parametreler değişti · Yeniden çalıştırın", "Parametrlər dəyişdi · Yenidən başladın", "Settings changed · Run again") : shownResult?.baseline.metrics.converged ? t("Frank–Wolfe yakınsadı", "Frank–Wolfe yaxınlaşdı", "Frank–Wolfe converged") : t("Deneyinizi kurun ve karşılaştırın", "Təcrübəni qurun və müqayisə edin", "Set up your experiment and compare")}</span><button type="button" onClick={exportReport} disabled={!shownResult}><Download size={15}/>{t("Raporu indir", "Hesabatı endir", "Export report")}</button></div></header>

    <div className="studio-grid">
      <details className="experiment-setup" open={setupOpen} onToggle={event=>setSetupOpen(event.currentTarget.open)}>
        <summary><Settings2 size={17}/>{t("Deney ayarları", "Təcrübə parametrləri", "Experiment settings")}<span>{demand.toLocaleString()} {t("araç/sa", "avt/saat", "veh/h")}</span><ChevronDown size={16}/></summary>
        <section><h2><span>01</span>{t("Koridor", "Koridor", "Corridor")}</h2>
          {(["start", "end"] as const).map((kind) => { const value = kind === "start" ? start : end; return <div className="origin-field" key={kind}><label>{kind === "start" ? t("Başlangıç (A)", "Başlanğıc (A)", "Origin (A)") : t("Varış (B)", "Təyinat (B)", "Destination (B)")}</label><button type="button" className={pick === kind ? "active" : ""} title={t("Değiştirmek için haritayı seçin", "Dəyişmək üçün xəritəni seçin", "Select on the map to change")} onClick={() => {setPick(kind); setTool("select");}}><MapPin size={13}/>{value.lat.toFixed(3)}, {value.lon.toFixed(3)}</button>{advanced && <div><input aria-label={`${kind} latitude`} type="number" step=".0001" value={value.lat} onChange={(e) => (kind === "start" ? setStart : setEnd)({ ...value, lat: Number(e.target.value) })}/><input aria-label={`${kind} longitude`} type="number" step=".0001" value={value.lon} onChange={(e) => (kind === "start" ? setStart : setEnd)({ ...value, lon: Number(e.target.value) })}/></div>}</div>; })}
        </section>
        <section><h2><span>02</span>{t("Trafik talebi", "Trafik tələbi", "Traffic demand")}</h2><div className="demand-number"><input aria-label={t("Gidiş talebi", "Gediş tələbi", "Forward demand")} type="number" min="100" max="12000" step="100" value={demand} onChange={(e) => setDemand(Number(e.target.value))}/><span>{t("araç/saat", "avt/saat", "veh/hour")}</span></div><input className="demand-slider" aria-label={t("Talebi ayarla", "Tələbi dəyiş", "Adjust demand")} type="range" min="100" max="12000" step="100" value={demand} onChange={(e) => setDemand(Number(e.target.value))}/><div className="range-labels"><span>100</span><span>{demand.toLocaleString()}</span><span>12.000</span></div>
          <label className="reverse-demand">{t("Dönüş talebi", "Qayıdış tələbi", "Reverse demand")}<input type="number" min="0" max="12000" step="100" value={reverseDemand} onChange={(e) => setReverseDemand(Number(e.target.value))}/></label>
        </section>
        <section><h2><span>03</span>{t("Müdahale", "Müdaxilə", "Intervention")}</h2><div className="intervention-tiles">{tools.map(({ key, icon: Icon, label }) => <button type="button" key={key} className={tool === key || key === "newRoad" && tool === "select" ? "active" : ""} onClick={() => { if (key === "emergencyPriority") { setSelected(shownResult?.scenarios.find((item) => item.type === key) ?? null); setBefore(false); } changeTool(key); }}><Icon size={23}/><span>{label}</span></button>)}</div>
          <div className="direction-control"><span>{t("Yol yönü", "Yol istiqaməti", "Direction")}</span><div>{(["one-way", "two-way"] as const).map((item) => <button type="button" key={item} className={direction === item ? "active" : ""} onClick={() => setDirection(item)}>{item === "one-way" ? t("Tek yön", "Bir istiqamət", "One-way") : t("Çift yön", "İki istiqamət", "Two-way")}</button>)}</div></div>
          <div className="road-attributes"><label>{t("Şerit sayısı", "Zolaq sayı", "Lanes")}<input type="number" min="1" max="8" value={lanes} onChange={(e) => setLanes(Number(e.target.value))}/></label><label>{t("Hız limiti", "Sürət həddi", "Speed limit")}<div><input type="number" min="10" max="160" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}/><small>km/sa</small></div></label></div>
          {waypoints.length > 0 && <div className="drawn-status"><span>{routing ? t("Yola oturtuluyor…", "Yola uyğunlaşdırılır…", "Following roads…") : `${waypoints.length} ${t("kontrol noktası", "nəzarət nöqtəsi", "waypoints")}`}</span><button aria-label="Clear drawing" type="button" disabled={routing} onClick={() => {setWaypoints([]);setGeometry([]);}}><X size={14}/></button></div>}
          <p className="routing-note"><ShieldCheck size={14}/>{t("Her yön ayrı hesaplanır. OSM erişim ve dönüş kuralları uygulanır.", "Hər istiqamət ayrıca hesablanır. OSM giriş və dönmə qaydaları tətbiq edilir.", "Directions are routed separately using OSM access and turn restrictions.")}</p>
        </section>
        <div className="experiment-actions"><button type="button" className="run-simulation" disabled={loading || routing} onClick={run}>{loading ? <Activity size={17} className="spin"/> : <Play size={17} fill="currentColor"/>}{loading ? t("Denge hesaplanıyor…", "Tarazlıq hesablanır…", "Solving equilibrium…") : t("Simülasyonu çalıştır", "Simulyasiyanı başlat", "Run simulation")}</button><button type="button" className="advanced-button" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced}><Settings2 size={15}/>{t("Gelişmiş model ayarları", "Ətraflı model parametrləri", "Advanced model settings")}<ChevronDown size={13}/></button></div>
        {advanced && <section className="advanced-setup"><label>{t("Veri kaynağı", "Məlumat mənbəyi", "Data source")}<select value={mode} onChange={(e) => setMode(e.target.value as AnalysisMode)}><option value="static">OSRM · {t("Statik", "Statik", "Static")}</option><option value="live-calibrated">TomTom · {t("Canlı", "Canlı", "Live")}</option></select></label><label>{t("Sinyal döngüsü (sn)", "Siqnal dövrü (san)", "Signal cycle (s)")}<input type="number" min="30" max="240" value={cycle} onChange={(e) => setCycle(Number(e.target.value))}/></label><label>{t("Yeşil oranı (%)", "Yaşıl nisbəti (%)", "Green ratio (%)")}<input type="number" min="15" max="85" value={green} onChange={(e) => setGreen(Number(e.target.value))}/></label><code>t(x) = t₀[1 + 0.15(x/c)⁴]</code><small>Frank–Wolfe · ε ≤ 10⁻⁴ · 100 {t("örnek", "nümunə", "samples")}</small></section>}
      </details>

      <section className="simulation-map-column" id="analysis-map-workspace">
        <div className="simulation-map-frame">
          <AnalysisMap language={language} start={start} end={end} routes={routes} liveTraffic={shownResult?.liveTraffic} scenarios={shownScenarios} scenario={before ? null : shownResult ? selected : null} newRoadGeometry={geometry} placements={shownResult ? undefined : placement} interactionMode={pick ?? (tool === "signal" || tool === "closure" ? tool : null)} onMapPick={(point) => void onPick(point)} animationProgress={progress} flowVisualization={Boolean(shownResult)} modelEdges={shownResult ? before ? shownResult.diagnostics.mapEdges : selected?.mapEdges ?? shownResult.diagnostics.mapEdges : undefined} cartographic/>
          <div className="map-editor-toolbar"><button type="button" className={tool === "select" && !pick ? "active" : ""} onClick={() => changeTool("select")}><MousePointer2 size={16}/>{t("Seç", "Seç", "Select")}</button>{tools.slice(0,3).map(({ key, icon: Icon }) => <button key={key} type="button" className={tool === key ? "active" : ""} onClick={() => changeTool(key)}><Icon size={16}/>{key === "newRoad" ? t("Yol çiz", "Yol çək", "Draw road") : key === "signal" ? t("Sinyal ekle", "Siqnal əlavə et", "Add signal") : t("Kapat", "Bağla", "Close")}</button>)}</div>
          <div className="before-after">{[true,false].map((value) => <button key={String(value)} type="button" className={before === value ? "active" : ""} onClick={() => setBefore(value)}>{value ? t("Önce", "Əvvəl", "Before") : t("Sonra", "Sonra", "After")}</button>)}</div>
          {(error || routeError) && <div className="studio-map-error" role="alert"><b>{t("İşlem tamamlanamadı", "Əməliyyat tamamlanmadı", "Unable to complete")}</b><p>{error || routeError}</p><button type="button" onClick={() => {setError("");setRouteError("");}} aria-label="Dismiss"><X size={16}/></button></div>}
          {loading && <div className="studio-map-loading" role="status"><Activity className="spin" size={27}/><b>{t("Yollar doğrulanıyor, ağ dengesi çözülüyor", "Yollar yoxlanılır, şəbəkə tarazlığı hesablanır", "Validating roads and solving equilibrium")}</b><span>{t("Yön kuralları · 100 belirsizlik örneği", "İstiqamət qaydaları · 100 qeyri-müəyyənlik nümunəsi", "Direction rules · 100 uncertainty samples")}</span></div>}
        </div>
        <div className="simulation-playback"><button type="button" aria-label={playing ? "Pause flow animation" : "Play flow animation"} disabled={!shownResult} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button><button type="button" aria-label="Restart flow animation" disabled={!shownResult} onClick={() => setProgress(0)}><RotateCcw size={16}/></button><div className="playback-timeline"><label>{t("Akış gösterimi", "Axın görünüşü", "Flow visualization")}<small>{t("Denge üzerinde animasyon", "Tarazlıq üzərində animasiya", "Animation of equilibrium")}</small></label><input aria-label="Flow animation position" type="range" min="0" max="100" step=".1" value={progress} onChange={(e) => setProgress(Number(e.target.value))}/></div><div className="playback-speeds">{[1,2,5].map((value) => <button type="button" key={value} className={playbackSpeed === value ? "active" : ""} onClick={() => setPlaybackSpeed(value)}>{value}×</button>)}</div></div>
        {shownResult && <div className="scenario-tabs">{shownResult.scenarios.map((scenario) => <button type="button" key={scenario.key} className={selected?.key === scenario.key ? "active" : ""} onClick={() => {setSelected(scenario);setBefore(false);}}>{scenarioName(language,scenario)}</button>)}</div>}
      </section>
      <StudioFindings language={language} result={shownResult} onFocus={(scenario) => {setSelected(scenario);setBefore(false);}}/>
    </div>
    <StudioCharts language={language} result={shownResult} onFocus={(scenario) => {setSelected(scenario);setBefore(false);}}/>
    <footer className="studio-footnote"><span><CheckCircle2 size={13}/>{t("OSRM yol geometrisi · Yönlü ağ · BPR + Frank–Wolfe", "OSRM yol geometriyası · İstiqamətli şəbəkə · BPR + Frank–Wolfe", "OSRM road geometry · Directed network · BPR + Frank–Wolfe")}</span><span>{t("OSM kapsamına bağlı koridor modeli. Yol kapasitesi tahminidir.", "OSM əhatəsinə bağlı koridor modeli. Yol tutumu təxminidir.", "Corridor model depends on OSM coverage. Road capacity is estimated.")}</span></footer>
    {shownResult && <details className="studio-technical"><summary><Layers size={16}/>{t("Bilimsel ayrıntılar, belirsizlik ve tüm raporlar", "Elmi təfərrüatlar, qeyri-müəyyənlik və bütün hesabatlar", "Scientific details, uncertainty and all reports")}</summary><ResultsDashboard language={language} result={shownResult} selectedScenarioKey={selected?.key} onScenarioSelect={setSelected} onScenarioFocus={setSelected}/></details>}
    <div className="studio-mobile-run"><button type="button" disabled={loading || routing} onClick={run}><Play size={17}/>{loading ? t("Hesaplanıyor…", "Hesablanır…", "Computing…") : t("Simülasyonu çalıştır", "Simulyasiyanı başlat", "Run simulation")}</button></div>
  </main>;
}
