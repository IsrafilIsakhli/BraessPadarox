import { Fragment, useEffect } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { localized, scenarioName } from "../localization";
import type {
  AdvancedScenarioResult,
  Coordinates,
  Language,
  LiveTrafficAnalysis,
  RouteData
} from "../types";

export type MapInteractionMode = "start" | "end" | "newRoad" | null;

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
      ...(scenario?.affectedGeometry ?? []),
      ...(newRoadGeometry ?? [])
    ].filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));

    if (points.length < 2) return;
    const bounds = L.latLngBounds(points.map(([lat, lon]) => L.latLng(lat, lon)));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [34, 34], maxZoom: 14 });
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
  if (speedKmh >= 60) return "#07946f";
  if (speedKmh >= 40) return "#70b447";
  if (speedKmh >= 25) return "#e5b533";
  if (speedKmh >= 15) return "#e77a21";
  return "#c93d36";
}

function geometryCenter(geometry: [number, number][]): [number, number] | null {
  return geometry.length ? geometry[Math.floor((geometry.length - 1) / 2)] : null;
}

function scenarioGlyph(scenario: AdvancedScenarioResult): string {
  if (scenario.type === "signal") return "🚦";
  if (scenario.type === "closure") return "×";
  if (scenario.type === "emergencyPriority") return "+";
  if (scenario.type === "newRoad") return scenario.key.includes("two-way") ? "↔" : "→";
  return "●";
}

function scenarioColor(scenario: AdvancedScenarioResult): string {
  if (scenario.type === "signal") return "#c96518";
  if (scenario.type === "closure") return "#b82f2b";
  if (scenario.type === "emergencyPriority") return "#28659a";
  const delta = scenario.uncertainty?.medianDeltaPercent ?? scenario.deltaPercent;
  if (delta < -0.2) return "#087f78";
  if (delta > 0.2) return "#b43b36";
  return "#17385e";
}

function scenarioCenter(geometry?: [number, number][]): [number, number] | null {
  if (!geometry?.length) return null;
  return geometry[Math.floor((geometry.length - 1) / 2)];
}

function routeDirectionMarkers(geometry: [number, number][]): Array<{ point: [number, number]; bearing: number }> {
  if (geometry.length < 4) return [];
  return [0.24, 0.48, 0.72].map((fraction) => {
    const index = Math.min(geometry.length - 2, Math.max(0, Math.floor((geometry.length - 1) * fraction)));
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
  compact = false
}: Props) {
  const t = (tr: string, az: string, en: string) => localized(language, tr, az, en);
  const routeSet = liveTraffic?.routes ?? routes ?? [];
  const backgroundScenarios = (scenarios ?? []).filter((item) => item.key !== scenario?.key && item.affectedGeometry && item.affectedGeometry.length > 1);
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
    <div className={`analysis-map ${compact ? "is-compact" : ""} ${interactionMode ? "is-picking" : ""}`}>
      <MapContainer center={defaultCenter} zoom={12} scrollWheelZoom preferCanvas>
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
            <Polyline positions={route.geometry} pathOptions={{ color: "#fffdf8", weight: index === 0 ? 11 : 8, opacity: .96 }} />
            <Polyline
              positions={route.geometry}
              pathOptions={{
                color: staticSegments.length ? staticSpeedColor(averageSpeed) : index === 0 ? "#17385e" : "#697887",
                weight: index === 0 ? 7 : 5,
                opacity: index === 0 ? 0.96 : 0.72,
                dashArray: index === 0 ? undefined : "9 7"
              }}
            >
              <Tooltip sticky>
                {t(`Rota ${index + 1}`, `Marşrut ${index + 1}`, `Route ${index + 1}`)} · {route.distanceKm.toFixed(1)} km · {durationMinutes.toFixed(1)} {t("dk", "dəq", "min")} · {averageSpeed.toFixed(1)} km/{t("sa", "saat", "h")}
              </Tooltip>
            </Polyline>
            {!liveTraffic && staticSegments.map((segment, segmentIndex) => {
              const segmentSpeed = segment.durationMin > 0 ? segment.distanceKm / (segment.durationMin / 60) : averageSpeed;
              return <Polyline key={`segment-${index}-${segmentIndex}`} positions={segment.geometry} pathOptions={{ color: staticSpeedColor(segmentSpeed), weight: index === 0 ? 7 : 5, opacity: index === 0 ? .98 : .74 }}><Tooltip sticky>{segment.name || t("Yol kesimi", "Yol hissəsi", "Road segment")} · {segmentSpeed.toFixed(0)} km/h</Tooltip></Polyline>;
            })}
          </Fragment>
          );
        })}

        {routeSet.slice(0, 3).map((route, index) => {
          const point = geometryCenter(route.geometry);
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
              html: `<span style="--bearing:${bearing}deg;--arrow-color:${routeIndex === 0 ? "#17385e" : "#697887"}">➜</span>`,
              iconSize: [26, 26],
              iconAnchor: [13, 13]
            })}
          />
        )))}

        {liveTraffic?.flowSegments.map((segment) => (
          <Polyline
            key={segment.id}
            positions={segment.geometry.length > 1
              ? segment.geometry
              : [[segment.point.lat, segment.point.lon], [segment.point.lat + 0.00005, segment.point.lon + 0.00005]]}
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

        {backgroundScenarios.map((item) => {
          const geometry = item.affectedGeometry!;
          const center = scenarioCenter(geometry);
          const color = item.type === "signal" ? "#c96518" : item.type === "closure" ? "#b82f2b" : item.type === "emergencyPriority" ? "#28659a" : scenarioColor(item);
          return <Fragment key={`context-${item.key}`}>
            <Polyline positions={geometry} pathOptions={{ color: "#fffdf8", weight: item.type === "emergencyPriority" ? 8 : 7, opacity: .72 }} />
            <Polyline positions={geometry} pathOptions={{ color, weight: item.type === "emergencyPriority" ? 5 : 4, dashArray: item.type === "signal" ? "3 7" : item.type === "closure" ? "2 7" : item.type === "emergencyPriority" ? "11 7" : "8 7", opacity: .58 }}><Tooltip sticky>{scenarioName(language, item)} · {item.deltaMinutes > 0 ? "+" : ""}{item.deltaMinutes.toFixed(1)} {t("dk", "dəq", "min")}</Tooltip></Polyline>
            {center && (item.type === "signal" || item.type === "closure" || item.type === "emergencyPriority") && <Marker position={center} icon={L.divIcon({
              className: "scenario-leaflet-icon is-context",
              html: `<span class="scenario-marker-inner is-${item.type}" style="--scenario-color:${color}">${scenarioGlyph(item)}</span>`,
              iconSize: [34,34], iconAnchor: [17,17]
            })}><Tooltip direction="top">{scenarioName(language, item)}</Tooltip></Marker>}
          </Fragment>;
        })}

        {scenario && selectedGeometry && selectedGeometry.length > 1 && (
          <Polyline
            positions={selectedGeometry}
            pathOptions={{ color: selectedColor, weight: 9, dashArray: scenario.type === "newRoad" ? "10 7" : "5 7", opacity: 0.94 }}
          >
            <Tooltip sticky>{scenario.title} · {selectedDelta > 0 ? "+" : ""}{selectedDelta.toFixed(1)}%</Tooltip>
          </Polyline>
        )}
        {scenario && selectedCenter && scenario.type !== "baseline" && (
          <Marker
            position={selectedCenter}
            icon={L.divIcon({
              className: "scenario-leaflet-icon",
              html: `<span class="scenario-marker-inner is-${scenario.type}" style="--scenario-color:${selectedColor}">${scenarioGlyph(scenario)}</span>`,
              iconSize: [44, 44],
              iconAnchor: [22, 22]
            })}
          >
            <Tooltip permanent direction="top" offset={[0, -22]} className="scenario-map-tooltip">{scenarioName(language, scenario)}</Tooltip>
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

        <Marker position={[start.lat, start.lon]} icon={L.divIcon({ className: "terminal-marker", html: "<span>A</span>", iconSize: [30, 30], iconAnchor: [15, 15] })}><Tooltip>{t("Başlangıç", "Başlanğıc", "Origin")}</Tooltip></Marker>
        <Marker position={[end.lat, end.lon]} icon={L.divIcon({ className: "terminal-marker", html: "<span>B</span>", iconSize: [30, 30], iconAnchor: [15, 15] })}><Tooltip>{t("Varış", "Təyinat", "Destination")}</Tooltip></Marker>
      </MapContainer>

      <div className="map-legend" aria-label={t("Harita açıklaması", "Xəritə izahı", "Map legend")}>
        {liveTraffic ? (
          <>
            <span><i className="legend-swatch is-flowing" />{t("Akıcı", "Sərbəst", "Flowing")}</span>
            <span><i className="legend-swatch is-slow" />{t("Yavaş", "Yavaş", "Slow")}</span>
            <span><i className="legend-swatch is-heavy" />{t("Yoğun", "Sıx", "Heavy")}</span>
          </>
        ) : (
          <>
            <span><i className="legend-swatch is-flowing" />≥ 60 km/h</span>
            <span><i className="legend-swatch is-slow" />25–40</span>
            <span><i className="legend-swatch is-heavy" />≤ 15</span>
            <span><i className="legend-line is-alternative" />{t("Alternatif", "Alternativ", "Alternative")}</span>
          </>
        )}
        {scenario && scenario.type !== "baseline" && <span><i className="legend-line is-scenario" style={{ borderColor: selectedColor }} />{t("Seçilen müdahale", "Seçilmiş müdaxilə", "Selected action")}</span>}
      </div>
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
              : t("Yeni yolun düğüm noktalarını haritada seçin", "Yeni yolun düyün nöqtələrini xəritədə seçin", "Select the new-road vertices on the map")}
        </div>
      )}
    </div>
  );
}
