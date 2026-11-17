import { Fragment, useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, ScaleControl, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { localized, scenarioName } from "../localization";
import type {
  AdvancedScenarioResult,
  Coordinates,
  Language,
  LiveTrafficAnalysis,
  RouteData
  ,ModelMapEdge
} from "../types";

export type MapInteractionMode = "start" | "end" | "newRoad" | "signal" | "closure" | null;

type Props = {
  language: Language;
  start: Coordinates;
  end: Coordinates;
  routes?: RouteData[];
  liveTraffic?: LiveTrafficAnalysis;
  scenarios?: AdvancedScenarioResult[];
  scenario?: AdvancedScenarioResult | null;
  newRoadGeometry?: [number, number][];
  interactionMode?: MapInteractionMode;
  onMapPick?: (point: Coordinates) => void;
  compact?: boolean;
  animationProgress?: number;
  flowVisualization?: boolean;
  modelEdges?: ModelMapEdge[];
  cartographic?: boolean;
  placements?: { signal?: Coordinates; closure?: Coordinates };
};

const defaultCenter: [number, number] = [40.4093, 49.8671];

function BoundsController({
  start,
  end,
  routes,
  liveTraffic,
  scenarios,
  scenario,
  newRoadGeometry
}: Pick<Props, "start" | "end" | "routes" | "liveTraffic" | "scenarios" | "scenario" | "newRoadGeometry">) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = [
      [start.lat, start.lon] as [number, number],
      [end.lat, end.lon] as [number, number],
      ...(routes?.flatMap((route) => route.geometry) ?? []),
      ...(liveTraffic?.routes.flatMap((route) => route.geometry) ?? []),
      ...(scenarios?.flatMap((item) => item.affectedGeometry ?? []) ?? []),
      ...(scenarios?.flatMap((item) => item.reverseAffectedGeometry ?? []) ?? []),
      ...(scenario?.affectedGeometry ?? []),
      ...(newRoadGeometry ?? [])
    ].filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));

    if (points.length < 2) return;
    const bounds = L.latLngBounds(points.map(([lat, lon]) => L.latLng(lat, lon)));
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        map.invalidateSize({pan:false});
        const small = map.getContainer().clientWidth < 500;
        if (bounds.isValid()) map.fitBounds(bounds, { paddingTopLeft: [small ? 34 : 58, 100], paddingBottomRight: [small ? 34 : 58, 90], maxZoom: 15, animate:false });
      });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(map.getContainer());
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [end, liveTraffic, map, newRoadGeometry, routes, scenario, scenarios, start]);

  return null;
}

function ClickController({
  active,
  onMapPick
}: {
  active: boolean;
  onMapPick?: (point: Coordinates) => void;
}) {
  useMapEvents({
    click(event) {
      if (!active || !onMapPick) return;
      onMapPick({ lat: event.latlng.lat, lon: event.latlng.lng });
    }
  });
  return null;
}

function flowColor(current: number, freeFlow: number, closed: boolean): string {
  if (closed) return "#242f3d";
  const ratio = freeFlow > 0 ? current / freeFlow : 1;
  if (ratio >= 0.8) return "#087f78";
  if (ratio >= 0.55) return "#c96f18";
  return "#b43b36";
}

function staticSpeedColor(speedKmh: number): string {
  if (speedKmh >= 40) return "#07946f";
  if (speedKmh >= 20) return "#e77a21";
  return "#c93d36";
}

function geometryIndex(geometry: [number,number][], fraction = .5) {
  const lengths = geometry.map((point,index) => index ? L.latLng(geometry[index-1]).distanceTo(L.latLng(point)) : 0);
  const target = lengths.reduce((sum,length)=>sum+length,0) * fraction;
  let accumulated = 0;
  for (let i=1;i<lengths.length;i++) { accumulated += lengths[i]; if(accumulated >= target) return i; }
  return Math.max(0,geometry.length-1);
}

function geometryCenter(geometry: [number, number][]): [number, number] | null {
  return geometry.length ? geometry[geometryIndex(geometry)] : null;
}

function geometryKm(geometry: [number,number][]) {
  return geometry.reduce((sum,point,index) => index ? sum + L.latLng(geometry[index-1]).distanceTo(L.latLng(point))/1000 : 0,0);
}

function escapeLabel(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]!));
}

function FlowParticles({ geometry, progress, color }: { geometry: [number, number][]; progress: number; color: string }) {
  const lengths = useMemo(() => {
    const values = [0];
    for (let i = 1; i < geometry.length; i++) values.push(values[i - 1] + L.latLng(geometry[i - 1]).distanceTo(L.latLng(geometry[i])));
    return values;
  },[geometry]);
  if (geometry.length < 2) return null;
  const total = lengths[lengths.length - 1];
  if (!total) return null;
  return <>{Array.from({ length: 16 }, (_, i) => {
    const distance = ((i / 16 + progress / 100) % 1) * total;
    const end = Math.max(1,lengths.findIndex((value) => value >= distance));
    const ratio = (distance - lengths[end - 1]) / Math.max(.01,lengths[end] - lengths[end - 1]);
    const a = geometry[end - 1], b = geometry[end];
    return <CircleMarker key={i} center={[a[0]+(b[0]-a[0])*ratio,a[1]+(b[1]-a[1])*ratio]} radius={2.5} interactive={false} pathOptions={{ color: "#fff", weight: 1.4, fillColor: color, fillOpacity: 1 }}/>;
  })}</>;
}

function scenarioGlyph(scenario: AdvancedScenarioResult): string {
  if (scenario.type === "signal") return "🚦";
  if (scenario.type === "closure") return "×";
  if (scenario.type === "emergencyPriority") return "+";
  if (scenario.type === "newRoad") return scenario.key.includes("two-way") ? "↔" : "→";
  return "●";
}

function markerContent(scenario: AdvancedScenarioResult) {
  return scenario.type === "signal" ? '<i class="signal-housing"><i></i><i></i><i></i></i>' : scenarioGlyph(scenario);
}

function scenarioColor(scenario: AdvancedScenarioResult): string {
  if (scenario.type === "signal") return "#c96518";
  if (scenario.type === "closure") return "#b82f2b";
  if (scenario.type === "emergencyPriority") return "#28659a";
  if (scenario.type === "newRoad") return "#007f72";
  const delta = scenario.uncertainty?.medianDeltaPercent ?? scenario.deltaPercent;
  if (delta < -0.2) return "#087f78";
  if (delta > 0.2) return "#b43b36";
  return "#17385e";
}

function scenarioCenter(geometry?: [number, number][]): [number, number] | null {
  if (!geometry?.length) return null;
  return geometryCenter(geometry);
}

function routeDirectionMarkers(geometry: [number, number][]): Array<{ point: [number, number]; bearing: number }> {
  if (geometry.length < 4) return [];
  return [0.12, 0.27, 0.42, 0.57, 0.72, 0.87].map((fraction) => {
    const index = Math.min(geometry.length - 2, geometryIndex(geometry,fraction));
    const [lat1, lon1] = geometry[index];
    const [lat2, lon2] = geometry[index + 1];
    const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
    return { point: geometry[index], bearing: (Math.atan2(y, x) * 180 / Math.PI + 360) % 360 };
  });
}

export function AnalysisMap({
  language,
  start,
  end,
  routes,
  liveTraffic,
  scenarios,
  scenario,
  newRoadGeometry,
  interactionMode = null,
  onMapPick,
  compact = false,
  animationProgress = 0,
  flowVisualization = false,
  modelEdges,
  placements,
  cartographic = false
}: Props) {
  const t = (tr: string, az: string, en: string) => localized(language, tr, az, en);
  const routeSet = liveTraffic?.routes ?? routes ?? [];
  const [showLabels,setShowLabels] = useState(true);
  const [showEmergency,setShowEmergency] = useState(true);
  const backgroundScenarios = (scenarios ?? []).filter((item) => item.key !== scenario?.key && item.affectedGeometry?.length && (showEmergency || item.type !== "emergencyPriority"));
  const bottleneck = modelEdges ? [...modelEdges].filter(edge=>edge.volumeCapacityRatio>.85).sort((a,b)=>b.volumeCapacityRatio-a.volumeCapacityRatio)[0] : undefined;
  const bottleneckPoint = bottleneck ? geometryCenter(bottleneck.geometry) : null;
  const roadScenario = scenario?.type === "newRoad" ? scenario : scenarios?.find(item=>item.type === "newRoad");
  const roadLabelPoint = geometryCenter(roadScenario?.affectedGeometry ?? []);
  const terminalStart = routeSet[0]?.geometry[0] ?? [start.lat,start.lon];
  const terminalEnd = routeSet[0]?.geometry.at(-1) ?? [end.lat,end.lon];
  const selectedGeometry = scenario?.affectedGeometry;
  const selectedCenter = scenarioCenter(selectedGeometry);
  const selectedDelta = scenario ? (scenario.uncertainty?.medianDeltaPercent ?? scenario.deltaPercent) : 0;
  const selectedDeltaMinutes = scenario?.deltaMinutes ?? 0;
  const selectedColor = scenario ? scenarioColor(scenario) : "#17385e";
  const selectedEffect = selectedDeltaMinutes < -0.05
    ? t(`${Math.abs(selectedDeltaMinutes).toFixed(1)} dk azalıyor`, `${Math.abs(selectedDeltaMinutes).toFixed(1)} dəq azalır`, `${Math.abs(selectedDeltaMinutes).toFixed(1)} min lower`)
    : selectedDeltaMinutes > 0.05
      ? t(`${selectedDeltaMinutes.toFixed(1)} dk yükseliyor`, `${selectedDeltaMinutes.toFixed(1)} dəq artır`, `${selectedDeltaMinutes.toFixed(1)} min higher`)
      : t("Belirgin süre farkı yok", "Əhəmiyyətli müddət fərqi yoxdur", "No material time difference");

  return (
    <div className={`analysis-map ${cartographic ? "is-cartographic" : ""} ${compact ? "is-compact" : ""} ${interactionMode ? "is-picking" : ""}`}>
      <MapContainer center={defaultCenter} zoom={12} scrollWheelZoom preferCanvas>
        <ScaleControl position="bottomleft" imperial={false}/>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <BoundsController
          start={start}
          end={end}
          routes={routes}
          liveTraffic={liveTraffic}
          scenarios={scenarios}
          scenario={scenario}
          newRoadGeometry={newRoadGeometry}
        />
        <ClickController active={Boolean(interactionMode)} onMapPick={onMapPick} />

        {routeSet.map((route, index) => {
          const durationMinutes = "travelTimeMinutes" in route ? route.travelTimeMinutes : route.durationMin;
          const averageSpeed = durationMinutes > 0 ? route.distanceKm / (durationMinutes / 60) : 0;
          const staticSegments = "segments" in route ? route.segments ?? [] : [];
          return (
          <Fragment key={"id" in route ? route.id : `route-${index}`}>
            <Polyline positions={route.geometry} pathOptions={{ color: "#fffdf8", weight: index === 0 ? 13 : 11, opacity: .98 }} />
            <Polyline
              positions={route.geometry}
              pathOptions={{
                color: modelEdges?.length ? "#aebbb0" : staticSpeedColor(averageSpeed),
                weight: index === 0 ? 9 : 7,
                opacity: .96
              }}
            >
              <Tooltip sticky>
                {t(`Rota ${index + 1}`, `Marşrut ${index + 1}`, `Route ${index + 1}`)} · {route.distanceKm.toFixed(1)} km · {durationMinutes.toFixed(1)} {t("dk", "dəq", "min")} · {averageSpeed.toFixed(1)} km/{t("sa", "saat", "h")}
              </Tooltip>
            </Polyline>
            {!liveTraffic && !modelEdges?.length && staticSegments.map((segment, segmentIndex) => {
              const segmentSpeed = segment.durationMin > 0 ? segment.distanceKm / (segment.durationMin / 60) : averageSpeed;
              return <Polyline key={`segment-${index}-${segmentIndex}`} positions={segment.geometry} pathOptions={{ color: staticSpeedColor(segmentSpeed), weight: index === 0 ? 9 : 7, opacity: .98 }}><Tooltip sticky>{segment.name || t("Yol kesimi", "Yol hissəsi", "Road segment")} · {segmentSpeed.toFixed(0)} km/h · {t("OSRM tahmini", "OSRM təxmini", "OSRM estimate")}</Tooltip></Polyline>;
            })}
          </Fragment>
          );
        })}

        {(!cartographic || showLabels) && routeSet.slice(0, 2).map((route, index) => {
          const point = cartographic ? route.geometry[geometryIndex(route.geometry,index ? .72 : .24)] : geometryCenter(route.geometry);
          const durationMinutes = "travelTimeMinutes" in route ? route.travelTimeMinutes : route.durationMin;
          if (!point) return null;
          return <Marker key={`route-label-${index}`} position={point} interactive={false} icon={L.divIcon({
            className: "route-label-icon",
            html: `<span><b>${t("Rota", "Marşrut", "Route")} ${index + 1}</b><small>${route.distanceKm.toFixed(1)} km · ${durationMinutes.toFixed(1)} ${t("dk", "dəq", "min")}</small></span>`,
            iconSize: [118, 44], iconAnchor: [59, 22]
          })}/>;
        })}

        {routeSet.slice(0, 2).flatMap((route, routeIndex) => routeDirectionMarkers(route.geometry).map(({ point, bearing }, markerIndex) => (
          <Marker
            key={`direction-${routeIndex}-${markerIndex}`}
            position={point}
            interactive={false}
            icon={L.divIcon({
              className: "route-direction-icon",
              html: `<span style="--bearing:${bearing}deg;--arrow-color:white">➜</span>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8]
            })}
          />
        )))}

        {(!modelEdges?.length ? liveTraffic?.flowSegments.filter(segment=>segment.geometry.length>1) : [])?.map((segment) => (
          <Polyline
            key={segment.id}
            positions={segment.geometry}
            pathOptions={{
              color: flowColor(segment.currentSpeedKmh, segment.freeFlowSpeedKmh, segment.roadClosure),
              weight: 8,
              opacity: 0.94
            }}
          >
            <Tooltip sticky>
              {segment.roadClosure
                ? t("Yol kapalı", "Yol bağlıdır", "Road closed")
                : `${segment.currentSpeedKmh} / ${segment.freeFlowSpeedKmh} km/h`}
            </Tooltip>
          </Polyline>
        ))}

        {modelEdges?.map((edge) => <Polyline key={`model-${edge.edgeId}`} positions={edge.geometry} pathOptions={{ color: staticSpeedColor(edge.speedKmh), weight: 9, opacity: .98 }}><Tooltip sticky><b>{t("Simülasyon yol kesimi", "Simulyasiya yol hissəsi", "Simulated road segment")}</b><br/>{edge.speedKmh.toFixed(1)} km/h · {Math.round(edge.flowVehPerHour)} {t("araç/saat", "avt/saat", "veh/h")}<br/>{t("Akım / kapasite", "Axın / tutum", "Flow / capacity")}: {edge.volumeCapacityRatio.toFixed(2)}</Tooltip></Polyline>)}

        {backgroundScenarios.map((item) => {
          const geometry = item.affectedGeometry!;
          const center = scenarioCenter(geometry);
          const color = item.type === "signal" ? "#c96518" : item.type === "closure" ? "#b82f2b" : item.type === "emergencyPriority" ? "#28659a" : scenarioColor(item);
          return <Fragment key={`context-${item.key}`}>
            {geometry.length > 1 && <><Polyline positions={geometry} pathOptions={{ color: "#fffdf8", weight: item.type === "emergencyPriority" ? 8 : 7, opacity: .72 }} />
            <Polyline positions={geometry} pathOptions={{ color, weight: item.type === "emergencyPriority" ? 3 : 5, dashArray: item.type === "signal" ? "3 7" : item.type === "closure" ? "2 7" : item.type === "emergencyPriority" ? "7 7" : "8 7", opacity: .9 }}><Tooltip sticky>{scenarioName(language, item)} · {item.deltaMinutes > 0 ? "+" : ""}{item.deltaMinutes.toFixed(1)} {t("dk", "dəq", "min")}</Tooltip></Polyline></>}
            {center && (item.type === "signal" || item.type === "closure" || item.type === "emergencyPriority") && <Marker position={center} icon={L.divIcon({
              className: "scenario-leaflet-icon is-context",
              html: `<span class="scenario-marker-inner is-${item.type}" style="--scenario-color:${color}">${markerContent(item)}</span>`,
              iconSize: [34,34], iconAnchor: [17,17]
            })}><Tooltip permanent={cartographic && showLabels} direction={item.type === "signal" ? "right" : "bottom"} offset={item.type === "signal" ? [12,0] : [0,12]} className="map-object-label">{item.type === "signal" ? t("Sinyal noktası", "Siqnal nöqtəsi", "Signal location") : item.type === "emergencyPriority" ? t("Acil koridor", "Təcili koridor", "Emergency corridor") : t("Yol kapatma", "Yol bağlanması", "Road closure")}</Tooltip></Marker>}
          </Fragment>;
        })}

        {scenario && selectedGeometry && selectedGeometry.length > 1 && <Polyline positions={selectedGeometry} pathOptions={{color:"#fffefa",weight:10,opacity:.98}}/>}
        {scenario && selectedGeometry && selectedGeometry.length > 1 && (
          <Polyline
            positions={selectedGeometry}
            pathOptions={{ color: selectedColor, weight: scenario.type === "newRoad" ? 6 : 5, dashArray: scenario.type === "newRoad" ? "9 6" : "5 7", opacity: 0.98 }}
          >
            <Tooltip sticky>{scenario.title} · {selectedDelta > 0 ? "+" : ""}{selectedDelta.toFixed(1)}%</Tooltip>
          </Polyline>
        )}
        {scenario?.reverseAffectedGeometry && <Polyline positions={scenario.reverseAffectedGeometry} pathOptions={{color:"#0a8f80",weight:5,dashArray:"3 8",opacity:.8}}><Tooltip sticky>{t("Kurallara uygun dönüş güzergâhı", "Qaydalara uyğun qayıdış marşrutu", "Legally routed reverse direction")}</Tooltip></Polyline>}
        {scenario && selectedCenter && scenario.type !== "baseline" && scenario.type !== "newRoad" && (
          <Marker
            position={selectedCenter}
            icon={L.divIcon({
              className: "scenario-leaflet-icon",
              html: `<span class="scenario-marker-inner is-${scenario.type}" style="--scenario-color:${selectedColor}">${markerContent(scenario)}</span>`,
              iconSize: [44, 44],
              iconAnchor: [22, 22]
            })}
          >
            <Tooltip permanent={showLabels} direction="right" offset={[14, 0]} className="map-object-label">{scenario.type === "signal" ? t("Sinyal noktası", "Siqnal nöqtəsi", "Signal location") : scenarioName(language, scenario)}</Tooltip>
          </Marker>
        )}
        {newRoadGeometry && newRoadGeometry.length > 1 && (
          <Polyline
            positions={newRoadGeometry}
            pathOptions={{ color: "#087f78", weight: 7, dashArray: "3 8", opacity: 0.95 }}
          >
            <Tooltip sticky>{t("Çizilen yeni yol", "Çəkilmiş yeni yol", "Drawn new road")}</Tooltip>
          </Polyline>
        )}

        {flowVisualization && routeSet.slice(0,2).map((route,index) => <FlowParticles key={`particles-${index}`} geometry={route.geometry} progress={animationProgress} color={index ? "#17385e" : "#007c67"}/>)}

        {cartographic && showLabels && roadScenario && roadLabelPoint && <Marker position={roadLabelPoint} interactive={false} icon={L.divIcon({className:"connection-label",html:`<span>${escapeLabel(t("Yeni bağlantı", "Yeni bağlantı", "New connection"))} · ${geometryKm(roadScenario.affectedGeometry ?? []).toFixed(1)} km</span>`,iconSize:[180,26],iconAnchor:[90,44]})}/>}
        {cartographic && showLabels && bottleneck && bottleneckPoint && <CircleMarker center={bottleneckPoint} radius={6} pathOptions={{color:"#fffefa",weight:2,fillColor:"#bd302d",fillOpacity:1}}><Tooltip permanent direction="top" offset={[22,-10]} className="bottleneck-callout"><b>{bottleneck.volumeCapacityRatio >= 1 ? t("Darboğaz", "Darboğaz", "Bottleneck") : t("Kritik yol kesimi", "Kritik yol hissəsi", "Critical road segment")}</b><span>{t("Akış bu kesimde yoğunlaşıyor.", "Axın bu hissədə cəmlənir.", "Traffic concentrates on this segment.")}</span><small>{t("Kapasite kullanımı", "Tutum istifadəsi", "Capacity utilization")}: {Math.round(bottleneck.volumeCapacityRatio*100)}%</small></Tooltip></CircleMarker>}
        {placements && Object.entries(placements).map(([key, point]) => <Marker key={`draft-${key}`} position={[point.lat,point.lon]} icon={L.divIcon({className:"scenario-leaflet-icon",html:`<span class="scenario-marker-inner" style="--scenario-color:${key === "signal" ? "#c58a27" : "#b83c32"}">${key === "signal" ? "🚦" : "×"}</span>`,iconSize:[34,34],iconAnchor:[17,17]})}><Tooltip permanent>{t("Seçilen konum · Analizde doğrulanacak", "Seçilmiş mövqe · Analizdə yoxlanılacaq", "Selected location · validated on run")}</Tooltip></Marker>)}

        {liveTraffic?.incidents.map((incident) => {
          const first = incident.geometry[0];
          if (!first) return null;
          return (
            <CircleMarker
              key={incident.id}
              center={first}
              radius={7}
              pathOptions={{ color: "#fffdf8", fillColor: "#b43b36", fillOpacity: 1, weight: 2 }}
            >
              <Tooltip>{incident.description}</Tooltip>
            </CircleMarker>
          );
        })}

        <Marker position={terminalStart as [number,number]} icon={L.divIcon({ className: "terminal-marker", html: "<span>A</span>", iconSize: [30, 30], iconAnchor: [15, 15] })}><Tooltip permanent={cartographic && showLabels} direction="bottom" offset={[0,15]} className="terminal-label">A · {t("Başlangıç", "Başlanğıc", "Origin")}</Tooltip></Marker>
        <Marker position={terminalEnd as [number,number]} icon={L.divIcon({ className: "terminal-marker", html: "<span>B</span>", iconSize: [30, 30], iconAnchor: [15, 15] })}><Tooltip permanent={cartographic && showLabels} direction="bottom" offset={[0,15]} className="terminal-label">B · {t("Varış", "Təyinat", "Destination")}</Tooltip></Marker>
      </MapContainer>

      <div className="map-legend" aria-label={t("Harita açıklaması", "Xəritə izahı", "Map legend")}>
        {liveTraffic && !modelEdges?.length ? (
          <>
            <span><i className="legend-swatch is-flowing" />{t("Akıcı", "Sərbəst", "Flowing")}</span>
            <span><i className="legend-swatch is-slow" />{t("Yavaş", "Yavaş", "Slow")}</span>
            <span><i className="legend-swatch is-heavy" />{t("Yoğun", "Sıx", "Heavy")}</span>
          </>
        ) : (
          <>
            <span><i className="legend-swatch is-flowing" />{t("Akıcı", "Sərbəst", "Free")} (≥40)</span>
            <span><i className="legend-swatch is-slow" />{t("Yavaş", "Yavaş", "Slow")} (20–40)</span>
            <span><i className="legend-swatch is-heavy" />{t("Yoğun", "Sıx", "Congested")} (&lt;20)</span>
          </>
        )}
        {scenario && scenario.type !== "baseline" && <span><i className="legend-line is-scenario" style={{ borderColor: selectedColor }} />{t("Yeni yol / müdahale", "Yeni yol / müdaxilə", "New link / intervention")}</span>}
        {cartographic && <span><i className="legend-emergency"/>{t("Acil koridor", "Təcili koridor", "Emergency")}</span>}
      </div>
      {cartographic && <><div className="cartography-controls"><label><input type="checkbox" checked={showLabels} onChange={event=>setShowLabels(event.target.checked)}/>{t("Etiketler", "Etiketlər", "Labels")}</label><label><input type="checkbox" checked={showEmergency} onChange={event=>setShowEmergency(event.target.checked)}/>{t("Acil koridor", "Təcili koridor", "Emergency")}</label></div><div className="map-source-label">{modelEdges?.length ? t("Model hızları · km/sa", "Model sürətləri · km/saat", "Model speeds · km/h") : liveTraffic ? "TomTom · live" : t("OSRM hız tahmini · km/sa", "OSRM sürət təxmini · km/saat", "OSRM speed estimate · km/h")}</div></>}
      {cartographic && scenario && scenario.type !== "newRoad" && scenario.type !== "baseline" && <div className="map-selection-explanation"><b>{scenarioName(language,scenario)}</b><span>{scenario.type === "closure" && !scenario.affectedGeometry?.length ? t("Bağlantıyı bozmadan iyileştiren bir kapatma bulunamadı.", "Şəbəkəni pozmadan yaxşılaşdıran bağlanma tapılmadı.", "No closure improved time while preserving connectivity.") : `${t("Model etkisi", "Model təsiri", "Model effect")}: ${scenario.deltaMinutes > 0 ? "+" : ""}${scenario.deltaMinutes.toFixed(1)} ${t("dk", "dəq", "min")}`}</span></div>}
      {cartographic && roadScenario?.reverseAffectedGeometry && <div className="direction-verification"><b>↔ {t("İki yön ayrı doğrulandı", "İki istiqamət ayrıca yoxlandı", "Both directions routed separately")}</b><span>{t("Gidiş", "Gediş", "Forward")} {geometryKm(roadScenario.affectedGeometry ?? []).toFixed(1)} km · {t("Dönüş", "Qayıdış", "Reverse")} {geometryKm(roadScenario.reverseAffectedGeometry).toFixed(1)} km</span></div>}
      {scenario && <div className={`map-scenario-card ${selectedDeltaMinutes < -0.05 ? "is-better" : selectedDeltaMinutes > 0.05 ? "is-worse" : "is-neutral"}`} role="status">
        <span className="map-scenario-glyph" aria-hidden="true">{scenarioGlyph(scenario)}</span>
        <span><small>{t("HARİTADA GÖSTERİLEN", "XƏRİTƏDƏ GÖSTƏRİLƏN", "SHOWN ON MAP")}</small><strong>{scenarioName(language, scenario)}</strong><em>{selectedEffect}</em></span>
      </div>}
      {interactionMode && (
        <div className="map-instruction" role="status">
          {interactionMode === "start"
            ? t("Haritada başlangıç noktasına dokunun", "Xəritədə başlanğıc nöqtəsini seçin", "Select the origin on the map")
            : interactionMode === "end"
              ? t("Haritada varış noktasına dokunun", "Xəritədə təyinat nöqtəsini seçin", "Select the destination on the map")
              : interactionMode === "signal" ? t("Sinyal yerleştirmek için yol üzerindeki kavşağı seçin", "Siqnal üçün yol üzərində kəsişməni seçin", "Pick a road junction for the signal")
              : interactionMode === "closure" ? t("Kapatılacak yol kesimini seçin", "Bağlanacaq yol hissəsini seçin", "Select the road section to close")
              : t("Yeni yolun düğüm noktalarını haritada seçin", "Yeni yolun düyün nöqtələrini xəritədə seçin", "Select the new-road vertices on the map")}
        </div>
      )}
    </div>
  );
}
