import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Clock3, Gauge, MapPin, Pause, Play, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AnalysisMap } from "../components/AnalysisMap";
import { localeTag, localized } from "../localization";
import { fetchLiveTrafficAnalysis } from "../services/api";
import type { Coordinates, Language, LiveTrafficAnalysis } from "../types";

const defaultStart: Coordinates = { lat: 40.4266, lon: 49.9187 };
const defaultEnd: Coordinates = { lat: 40.4042, lon: 49.8075 };

function formatTime(value: string, language: Language): string {
  return new Intl.DateTimeFormat(localeTag(language), { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

export function routeAverageSpeedKmh(distanceKm: number, travelTimeMinutes: number): number | null {
  if (!Number.isFinite(distanceKm) || !Number.isFinite(travelTimeMinutes) || distanceKm <= 0 || travelTimeMinutes <= 0) return null;
  return distanceKm / (travelTimeMinutes / 60);
}

export function LiveTrafficPage({ language }: { language: Language }) {
  const t = (tr: string, az: string, en: string) => localized(language, tr, az, en);
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
      setError(caught instanceof Error ? caught.message : t("Canlı trafik verisi alınamadı.", "Canlı trafik məlumatı alınmadı.", "Live traffic data could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [end, language, start]);

  useEffect(() => { void load(); }, [language]);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setSecondsToRefresh((current) => {
        if (current <= 1) { void load(true); return 60; }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, load]);

  const primary = data?.routes[0];
  const speedRatio = useMemo(() => data?.flowSegments.length
    ? data.flowSegments.reduce((sum, segment) => sum + segment.currentSpeedKmh / Math.max(segment.freeFlowSpeedKmh, 1), 0) / data.flowSegments.length
    : null, [data]);
  const routeAverageSpeed = primary ? routeAverageSpeedKmh(primary.distanceKm, primary.travelTimeMinutes) : null;
  const freeFlowAverageSpeed = primary ? routeAverageSpeedKmh(primary.distanceKm, primary.noTrafficTravelTimeMinutes) : null;

  function updatePoint(kind: "start" | "end", axis: "lat" | "lon", value: string) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    (kind === "start" ? setStart : setEnd)((point) => ({ ...point, [axis]: numeric }));
  }

  function useInSimulation() {
    const query = new URLSearchParams({ mode: "live-calibrated", start: `${start.lat},${start.lon}`, end: `${end.lat},${end.lon}` });
    navigate(`/analysis?${query.toString()}`);
  }

  return <main className="live-page research-live-page">
    <section className="live-page-header research-live-header">
      <div><span className="eyebrow">{t("TOMTOM KORİDOR GÖZLEMİ", "TOMTOM KORİDOR MÜŞAHİDƏSİ", "TOMTOM CORRIDOR OBSERVATION")}</span><h1>{t("Koridorun anlık durumu", "Koridorun cari vəziyyəti", "Current corridor conditions")}</h1><p>{t("Canlı rota, hız, gecikme ve olayları tek bir zaman damgalı araştırma görünümünde inceleyin.", "Canlı marşrut, sürət, gecikmə və hadisələri vahid zaman möhürlü tədqiqat görünüşündə araşdırın.", "Inspect live routes, speeds, delays and incidents in one timestamped research view.")}</p></div>
      <div className="refresh-control"><span><i className={!data ? "is-waiting" : data.stale ? "is-stale" : ""}/>{data ? `${t("Güncellendi", "Yeniləndi", "Updated")} ${formatTime(data.snapshotAt, language)}` : t("Veri bekleniyor", "Məlumat gözlənilir", "Waiting for data")}</span><button type="button" onClick={() => setAutoRefresh((value) => !value)}>{autoRefresh ? <Pause size={15}/> : <Play size={15}/>} {autoRefresh ? `${secondsToRefresh} ${t("sn", "san", "sec")}` : t("Durduruldu", "Dayandırılıb", "Paused")}</button><button type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""}/>{t("Yenile", "Yenilə", "Refresh")}</button></div>
    </section>

    <section className="live-route-form" aria-label={t("Canlı rota ayarları", "Canlı marşrut parametrləri", "Live route controls")}>
      {(["start", "end"] as const).map((kind) => { const point = kind === "start" ? start : end; return <div className="live-coordinate" key={kind}><span><MapPin size={16}/>{kind === "start" ? t("Başlangıç", "Başlanğıc", "Origin") : t("Varış", "Təyinat", "Destination")}</span><label><small>LAT</small><input type="number" step="0.00001" value={point.lat} onChange={(event) => updatePoint(kind, "lat", event.target.value)}/></label><label><small>LON</small><input type="number" step="0.00001" value={point.lon} onChange={(event) => updatePoint(kind, "lon", event.target.value)}/></label></div>; })}
      <button className="primary-action" type="button" onClick={() => void load()} disabled={loading}>{loading ? t("Canlı veri alınıyor…", "Canlı məlumat alınır…", "Loading live data…") : t("Koridoru güncelle", "Koridoru yenilə", "Update corridor")}<ArrowRight size={17}/></button>
    </section>

    {error && <div className="live-error" role="alert"><TriangleAlert size={22}/><div><strong>{t("Canlı katman kullanılamıyor", "Canlı lay əlçatan deyil", "Live layer is unavailable")}</strong><p>{error}</p><button type="button" onClick={useInSimulation}>{t("Statik modelle devam et", "Statik modellə davam et", "Continue with the static model")}<ArrowRight size={16}/></button></div></div>}
    {data && !data.flowSegments.length && <div className="live-coverage-note"><Gauge size={22}/><div><strong>{t("Canlı rota ve ETA hazır", "Canlı marşrut və ETA hazırdır", "Live routes and ETA are ready")}</strong><p>{t("Bu koridor için hız segmenti bulunamadı. Rota süreleri canlıdır; yol bazlı hız renkleri gösterilmez.", "Bu koridor üçün sürət seqmenti tapılmadı. Marşrut müddətləri canlıdır; yol səviyyəsində sürət rəngləri göstərilmir.", "No speed segments were returned for this corridor. Route times are live; road-level speed colouring is unavailable.")}</p></div></div>}

    <section className="live-map-section research-live-map">
      <AnalysisMap language={language} start={start} end={end} liveTraffic={data ?? undefined} compact/>
      <div className="live-metric-rail">
        <article><Clock3 size={19}/><span>{t("Canlı ETA", "Canlı ETA", "Live ETA")}</span><strong>{primary ? `${primary.travelTimeMinutes.toFixed(1)} ${t("dk", "dəq", "min")}` : "—"}</strong><small>{primary ? `${t("Serbest akış", "Sərbəst axın", "Free flow")} ${primary.noTrafficTravelTimeMinutes.toFixed(1)} ${t("dk", "dəq", "min")}` : t("Rota bekleniyor", "Marşrut gözlənilir", "Waiting for route")}</small></article>
        <article><Gauge size={19}/><span>{t("Ortalama rota hızı", "Orta marşrut sürəti", "Average route speed")}</span><strong>{routeAverageSpeed === null ? "—" : `${routeAverageSpeed.toFixed(1)} km/h`}</strong><small>{freeFlowAverageSpeed === null ? t("Rota bekleniyor", "Marşrut gözlənilir", "Waiting for route") : `${t("Serbest", "Sərbəst", "Free flow")} ${freeFlowAverageSpeed.toFixed(1)} km/h${speedRatio === null ? "" : ` · ${Math.round(speedRatio * 100)}%`}`}</small></article>
        <article><AlertTriangle size={19}/><span>{t("Aktif olay", "Aktiv hadisə", "Active incidents")}</span><strong>{data?.incidents.length ?? "—"}</strong><small>{data?.incidents.some((item) => item.magnitude === "major" || item.magnitude === "critical") ? t("Kritik olay var", "Kritik hadisə var", "Critical incident present") : t("Koridorla eşleşen", "Koridorla uyğun gələn", "Matched to corridor")}</small></article>
        <article><ShieldCheck size={19}/><span>{t("Veri kalitesi", "Məlumat keyfiyyəti", "Data quality")}</span><strong>{data ? `${data.dataQuality.score}/100` : "—"}</strong><small>{data ? `${data.dataQuality.coveragePercent}% ${t("akış kapsamı", "axın əhatəsi", "flow coverage")}` : t("Ölçülmedi", "Ölçülməyib", "Not measured")}</small></article>
      </div>
    </section>

    {data && <section className="live-details-grid">
      <article className="live-route-list"><div className="section-heading"><div><span className="eyebrow">{t("ALTERNATİF ROTALAR", "ALTERNATİV MARŞRUTLAR", "LIVE ALTERNATIVES")}</span><h2>{t("Şu anki seyahat süreleri", "Cari səfər müddətləri", "Current travel times")}</h2></div></div>{data.routes.map((route, index) => { const averageSpeed = routeAverageSpeedKmh(route.distanceKm, route.travelTimeMinutes); return <div className="live-route-row" key={route.id}><span><i>{index + 1}</i><b>{t(`Rota ${index + 1}`, `Marşrut ${index + 1}`, `Route ${index + 1}`)}</b><small>{route.distanceKm.toFixed(1)} km · {averageSpeed?.toFixed(1) ?? "—"} km/h</small></span><span><b>{route.travelTimeMinutes.toFixed(1)} {t("dk", "dəq", "min")}</b><small className={route.trafficDelayMinutes > 0 ? "metric-worse" : ""}>+{route.trafficDelayMinutes.toFixed(1)} {t("dk gecikme", "dəq gecikmə", "min delay")}</small></span></div>; })}</article>
      <article className="incident-list"><div className="section-heading"><div><span className="eyebrow">{t("KORİDOR OLAYLARI", "KORİDOR HADİSƏLƏRİ", "CORRIDOR INCIDENTS")}</span><h2>{t("Sahada dikkat gerektirenler", "Sahədə diqqət tələb edənlər", "What needs attention")}</h2></div></div>{data.incidents.length ? data.incidents.slice(0, 6).map((incident) => <div className="incident-row" key={incident.id}><i className={`magnitude-${incident.magnitude}`}/><span><b>{incident.description}</b><small>{[incident.from, incident.to].filter(Boolean).join(" → ") || incident.category}</small></span><strong>{incident.delaySeconds ? `${Math.round(incident.delaySeconds / 60)} ${t("dk", "dəq", "min")}` : incident.magnitude}</strong></div>) : <div className="no-incidents"><ShieldCheck size={24}/><span>{t("Rota koridoruyla eşleşen aktif olay bulunmadı.", "Marşrut koridoruna uyğun aktiv hadisə tapılmadı.", "No active incident matched the route corridor.")}</span></div>}</article>
    </section>}

    <section className="simulation-bridge"><div><span className="eyebrow">{t("CANLIDAN MODELE", "CANLIDAN MODELƏ", "LIVE TO MODEL")}</span><h2>{t("Bu anlık görüntüyü müdahale testine dönüştürün.", "Bu anlıq görünüşü müdaxilə testinə çevirin.", "Turn this snapshot into an intervention test.")}</h2><p>{t("Rota, hız oranı ve veri kalitesi sunucu tarafında mühendislik modeline aktarılır.", "Marşrut, sürət nisbəti və məlumat keyfiyyəti server tərəfdə mühəndislik modelinə ötürülür.", "Route, speed ratio and data quality are passed server-side into the engineering model.")}</p></div><button type="button" onClick={useInSimulation} disabled={!data}>{t("Bu veriyi simülasyonda kullan", "Bu məlumatı simulyasiyada istifadə et", "Use this data in simulation")}<ArrowRight size={19}/></button></section>
  </main>;
}
