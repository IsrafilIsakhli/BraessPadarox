import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Clock3, Gauge, MapPin, Pause, Play, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AnalysisMap } from "../components/AnalysisMap";
import { fetchLiveTrafficAnalysis } from "../services/api";
import type { Coordinates, Language, LiveTrafficAnalysis } from "../types";

const defaultStart: Coordinates = { lat: 40.4266, lon: 49.9187 };
const defaultEnd: Coordinates = { lat: 40.4042, lon: 49.8075 };

function formatTime(value: string, language: Language): string {
  return new Intl.DateTimeFormat(language === "tr" ? "tr-TR" : "en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).format(new Date(value));
}

export function routeAverageSpeedKmh(distanceKm: number, travelTimeMinutes: number): number | null {
  if (!Number.isFinite(distanceKm) || !Number.isFinite(travelTimeMinutes) || distanceKm <= 0 || travelTimeMinutes <= 0) return null;
  return distanceKm / (travelTimeMinutes / 60);
}

export function LiveTrafficPage({ language }: { language: Language }) {
  const tr = language === "tr";
  const navigate = useNavigate();
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [data, setData] = useState<LiveTrafficAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [secondsToRefresh, setSecondsToRefresh] = useState(60);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      setData(await fetchLiveTrafficAnalysis(start, end, language));
      setSecondsToRefresh(60);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (tr ? "Canlı trafik verisi alınamadı." : "Live traffic data could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [end, language, start, tr]);

  useEffect(() => {
    void load();
  }, [language]); // Coordinate edits wait for explicit refresh; language changes refresh provider messages.

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setSecondsToRefresh((current) => {
        if (current <= 1) {
          void load(true);
          return 60;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, load]);

  const primary = data?.routes[0];
  const speedRatio = useMemo(() => {
    if (!data?.flowSegments.length) return null;
    return data.flowSegments.reduce((sum, segment) => sum + segment.currentSpeedKmh / Math.max(segment.freeFlowSpeedKmh, 1), 0) / data.flowSegments.length;
  }, [data]);
  const hasFlowCoverage = Boolean(data?.flowSegments.length);
  const routeAverageSpeed = primary ? routeAverageSpeedKmh(primary.distanceKm, primary.travelTimeMinutes) : null;
  const freeFlowAverageSpeed = primary ? routeAverageSpeedKmh(primary.distanceKm, primary.noTrafficTravelTimeMinutes) : null;

  function updatePoint(kind: "start" | "end", axis: "lat" | "lon", value: string) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    (kind === "start" ? setStart : setEnd)((point) => ({ ...point, [axis]: numeric }));
  }

  function useInSimulation() {
    const query = new URLSearchParams({
      mode: "live-calibrated",
      start: `${start.lat},${start.lon}`,
      end: `${end.lat},${end.lon}`
    });
    navigate(`/analysis?${query.toString()}`);
  }

  return (
    <main className="live-page">
      <section className="live-page-header">
        <div><span className="eyebrow">{tr ? "TOMTOM ANLIK GÖRÜNTÜ" : "TOMTOM LIVE SNAPSHOT"}</span><h1>{tr ? "Koridor şu anda nasıl çalışıyor?" : "How is the corridor performing now?"}</h1><p>{tr ? "Canlı rotaları, hız oranlarını ve yol olaylarını tek bir zaman damgalı görünümde inceleyin." : "Inspect live routes, speed ratios and road incidents in one timestamped view."}</p></div>
        <div className="refresh-control"><span><i className={!data ? "is-waiting" : data.stale ? "is-stale" : ""} />{data ? `${tr ? "Son güncelleme" : "Updated"} ${formatTime(data.snapshotAt, language)}` : (tr ? "Veri bekleniyor" : "Waiting for data")}</span><button type="button" onClick={() => setAutoRefresh((value) => !value)}>{autoRefresh ? <Pause size={15} /> : <Play size={15} />}{autoRefresh ? `${secondsToRefresh} sn` : (tr ? "Durduruldu" : "Paused")}</button><button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""} />{tr ? "Yenile" : "Refresh"}</button></div>
      </section>

      <section className="live-route-form" aria-label={tr ? "Canlı rota ayarları" : "Live route controls"}>
        {(["start", "end"] as const).map((kind) => {
          const point = kind === "start" ? start : end;
          return <div className="live-coordinate" key={kind}><span><MapPin size={16} />{kind === "start" ? (tr ? "Başlangıç" : "Start") : (tr ? "Varış" : "Destination")}</span><label><small>LAT</small><input type="number" step="0.00001" value={point.lat} onChange={(event) => updatePoint(kind, "lat", event.target.value)} /></label><label><small>LON</small><input type="number" step="0.00001" value={point.lon} onChange={(event) => updatePoint(kind, "lon", event.target.value)} /></label></div>;
        })}
        <button className="primary-action" type="button" onClick={() => void load()} disabled={loading}>{loading ? (tr ? "Canlı veri alınıyor…" : "Loading live data…") : (tr ? "Koridoru güncelle" : "Update corridor")}<ArrowRight size={17} /></button>
      </section>

      {error && <div className="live-error" role="alert"><TriangleAlert size={22} /><div><strong>{tr ? "Canlı katman kullanılamıyor" : "Live layer is unavailable"}</strong><p>{error}</p><button type="button" onClick={useInSimulation}>{tr ? "Statik modelle devam et" : "Continue with the static model"}<ArrowRight size={16} /></button></div></div>}
      {data && !hasFlowCoverage && <div className="live-coverage-note"><Gauge size={22} /><div><strong>{tr ? "Canlı rota ve ETA hazır" : "Live routes and ETA are ready"}</strong><p>{tr ? "TomTom bu koridor için hız segmenti döndürmedi. Rota süreleri canlıdır; yalnızca yol bazlı hız renkleri gösterilmez." : "TomTom returned no speed segments for this corridor. Route times are live; only road-level speed colouring is unavailable."}</p></div></div>}

      <section className="live-map-section">
        <AnalysisMap language={language} start={start} end={end} liveTraffic={data ?? undefined} compact />
        <div className="live-metric-rail">
          <article><Clock3 size={19} /><span>{tr ? "Canlı ETA" : "Live ETA"}</span><strong>{primary ? `${primary.travelTimeMinutes.toFixed(1)} ${tr ? "dk" : "min"}` : "—"}</strong><small>{primary ? `${tr ? "Serbest akış" : "Free flow"} ${primary.noTrafficTravelTimeMinutes.toFixed(1)} ${tr ? "dk" : "min"}` : (tr ? "Rota bekleniyor" : "Waiting for route")}</small></article>
          <article><Gauge size={19} /><span>{tr ? "Rota ort. hızı" : "Average route speed"}</span><strong>{routeAverageSpeed === null ? "—" : `${routeAverageSpeed.toFixed(1)} km/sa`}</strong><small>{freeFlowAverageSpeed === null ? (tr ? "Rota bekleniyor" : "Waiting for route") : `${tr ? "ETA'dan hesaplandı · serbest" : "Calculated from ETA · free flow"} ${freeFlowAverageSpeed.toFixed(1)} km/sa${speedRatio === null ? "" : ` · %${Math.round(speedRatio * 100)}`}`}</small></article>
          <article><AlertTriangle size={19} /><span>{tr ? "Aktif olay" : "Active incidents"}</span><strong>{data?.incidents.length ?? "—"}</strong><small>{data?.incidents.some((item) => item.magnitude === "major" || item.magnitude === "critical") ? (tr ? "Kritik olay var" : "Critical incident present") : (tr ? "Koridorla eşleşen" : "Matched to corridor")}</small></article>
          <article><ShieldCheck size={19} /><span>{tr ? "Veri kalitesi" : "Data quality"}</span><strong>{data ? `${data.dataQuality.score}/100` : "—"}</strong><small>{data ? `%${data.dataQuality.coveragePercent} ${tr ? "akış kapsamı" : "flow coverage"}` : (tr ? "Ölçülmedi" : "Not measured")}</small></article>
        </div>
      </section>

      {data && <section className="live-details-grid">
        <article className="live-route-list"><div className="section-heading"><div><span className="eyebrow">{tr ? "ALTERNATİF ROTALAR" : "LIVE ALTERNATIVES"}</span><h2>{tr ? "Şu anki seyahat süreleri" : "Current travel times"}</h2></div></div>{data.routes.map((route, index) => { const averageSpeed = routeAverageSpeedKmh(route.distanceKm, route.travelTimeMinutes); return <div className="live-route-row" key={route.id}><span><i>{index + 1}</i><b>{tr ? `Rota ${index + 1}` : `Route ${index + 1}`}</b><small>{route.distanceKm.toFixed(1)} km · {averageSpeed?.toFixed(1) ?? "—"} km/sa {tr ? "ort." : "avg."}</small></span><span><b>{route.travelTimeMinutes.toFixed(1)} {tr ? "dk" : "min"}</b><small className={route.trafficDelayMinutes > 0 ? "metric-worse" : ""}>+{route.trafficDelayMinutes.toFixed(1)} {tr ? "dk gecikme" : "min delay"}</small></span></div>; })}</article>
        <article className="incident-list"><div className="section-heading"><div><span className="eyebrow">{tr ? "KORİDOR OLAYLARI" : "CORRIDOR INCIDENTS"}</span><h2>{tr ? "Sahada dikkat gerektirenler" : "What needs attention"}</h2></div></div>{data.incidents.length ? data.incidents.slice(0, 6).map((incident) => <div className="incident-row" key={incident.id}><i className={`magnitude-${incident.magnitude}`} /><span><b>{incident.description}</b><small>{[incident.from, incident.to].filter(Boolean).join(" → ") || incident.category}</small></span><strong>{incident.delaySeconds ? `${Math.round(incident.delaySeconds / 60)} ${tr ? "dk" : "min"}` : incident.magnitude}</strong></div>) : <div className="no-incidents"><ShieldCheck size={24} /><span>{tr ? "Rota koridoruyla eşleşen aktif olay bulunmadı." : "No active incident matched the route corridor."}</span></div>}</article>
      </section>}

      <section className="simulation-bridge"><div><span className="eyebrow">{tr ? "CANLIDAN MODELE" : "LIVE TO MODEL"}</span><h2>{tr ? "Bu anlık görüntüyü bir müdahale testine dönüştürün." : "Turn this snapshot into an intervention test."}</h2><p>{tr ? "Rota, hız oranı ve veri kalitesi sunucu tarafından mühendislik modeline aktarılır; istemci canlı ölçümleri değiştiremez." : "Route, speed ratio and data quality are passed server-side into the engineering model; the client cannot alter live observations."}</p></div><button type="button" onClick={useInSimulation} disabled={!data}>{tr ? "Bu veriyi simülasyonda kullan" : "Use this data in simulation"}<ArrowRight size={19} /></button></section>
    </main>
  );
}
