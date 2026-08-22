import { useEffect } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
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
  scenario,
  newRoadGeometry
}: Pick<Props, "start" | "end" | "routes" | "liveTraffic" | "scenario" | "newRoadGeometry">) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = [
      [start.lat, start.lon] as [number, number],
      [end.lat, end.lon] as [number, number],
      ...(routes?.flatMap((route) => route.geometry) ?? []),
      ...(liveTraffic?.routes.flatMap((route) => route.geometry) ?? []),
      ...(scenario?.affectedGeometry ?? []),
      ...(newRoadGeometry ?? [])
    ].filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));

    if (points.length < 2) return;
    const bounds = L.latLngBounds(points.map(([lat, lon]) => L.latLng(lat, lon)));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [34, 34], maxZoom: 14 });
  }, [end, liveTraffic, map, newRoadGeometry, routes, scenario, start]);

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

function scenarioGlyph(scenario: AdvancedScenarioResult): string {
  if (scenario.type === "signal") return "🚦";
  if (scenario.type === "closure") return "×";
  if (scenario.type === "emergencyPriority") return "+";
  if (scenario.type === "newRoad") return scenario.key.includes("two-way") ? "↔" : "→";
  return "●";
}

function scenarioColor(scenario: AdvancedScenarioResult): string {
  const delta = scenario.uncertainty?.medianDeltaPercent ?? scenario.deltaPercent;
  if (delta < -0.2) return "#087f78";
  if (delta > 0.2) return "#b43b36";
  return scenario.type === "signal" ? "#c96f18" : "#17385e";
}

function scenarioCenter(geometry?: [number, number][]): [number, number] | null {
  if (!geometry?.length) return null;
  return geometry[Math.floor((geometry.length - 1) / 2)];
}

export function AnalysisMap({
  language,
  start,
  end,
  routes,
  liveTraffic,
  scenario,
  newRoadGeometry,
  interactionMode = null,
  onMapPick,
  compact = false
}: Props) {
  const tr = language === "tr";
  const routeSet = liveTraffic?.routes ?? routes ?? [];
  const selectedGeometry = scenario?.affectedGeometry;
  const selectedCenter = scenarioCenter(selectedGeometry);
  const selectedDelta = scenario ? (scenario.uncertainty?.medianDeltaPercent ?? scenario.deltaPercent) : 0;
  const selectedDeltaMinutes = scenario?.deltaMinutes ?? 0;
  const selectedColor = scenario ? scenarioColor(scenario) : "#17385e";
  const selectedEffect = selectedDeltaMinutes < -0.05
    ? (tr ? `${Math.abs(selectedDeltaMinutes).toFixed(1)} dk azalıyor` : `${Math.abs(selectedDeltaMinutes).toFixed(1)} min lower`)
    : selectedDeltaMinutes > 0.05
      ? (tr ? `${selectedDeltaMinutes.toFixed(1)} dk yükseliyor` : `${selectedDeltaMinutes.toFixed(1)} min higher`)
      : (tr ? "Belirgin süre farkı yok" : "No material time difference");

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
          scenario={scenario}
          newRoadGeometry={newRoadGeometry}
        />
        <ClickController active={Boolean(interactionMode)} onMapPick={onMapPick} />

        {routeSet.map((route, index) => {
          const durationMinutes = "travelTimeMinutes" in route ? route.travelTimeMinutes : route.durationMin;
          const averageSpeed = durationMinutes > 0 ? route.distanceKm / (durationMinutes / 60) : 0;
          return (
          <Polyline
            key={"id" in route ? route.id : `route-${index}`}
            positions={route.geometry}
            pathOptions={{
              color: index === 0 ? "#17385e" : "#697887",
              weight: index === 0 ? 6 : 4,
              opacity: index === 0 ? 0.9 : 0.58,
              dashArray: index === 0 ? undefined : "8 8"
            }}
          >
            <Tooltip sticky>
              {tr ? `Rota ${index + 1}` : `Route ${index + 1}`} · {route.distanceKm.toFixed(1)} km · {durationMinutes.toFixed(1)} {tr ? "dk" : "min"} · {averageSpeed.toFixed(1)} km/sa
            </Tooltip>
          </Polyline>
          );
        })}

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
                ? (tr ? "Yol kapalı" : "Road closed")
                : `${segment.currentSpeedKmh} / ${segment.freeFlowSpeedKmh} km/h`}
            </Tooltip>
          </Polyline>
        ))}

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
            <Tooltip permanent direction="top" offset={[0, -22]} className="scenario-map-tooltip">{scenario.title}</Tooltip>
          </Marker>
        )}
        {newRoadGeometry && newRoadGeometry.length > 1 && (
          <Polyline
            positions={newRoadGeometry}
            pathOptions={{ color: "#087f78", weight: 7, dashArray: "3 8", opacity: 0.95 }}
          >
            <Tooltip sticky>{tr ? "Çizilen yeni yol" : "Drawn new road"}</Tooltip>
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

        <CircleMarker center={[start.lat, start.lon]} radius={8} pathOptions={{ color: "#fffdf8", fillColor: "#087f78", fillOpacity: 1, weight: 3 }}>
          <Tooltip>{tr ? "Başlangıç" : "Start"}</Tooltip>
        </CircleMarker>
        <CircleMarker center={[end.lat, end.lon]} radius={8} pathOptions={{ color: "#fffdf8", fillColor: "#b43b36", fillOpacity: 1, weight: 3 }}>
          <Tooltip>{tr ? "Varış" : "Destination"}</Tooltip>
        </CircleMarker>
      </MapContainer>

      <div className="map-legend" aria-label={tr ? "Harita açıklaması" : "Map legend"}>
        {liveTraffic ? (
          <>
            <span><i className="legend-swatch is-flowing" />{tr ? "Akıcı" : "Flowing"}</span>
            <span><i className="legend-swatch is-slow" />{tr ? "Yavaş" : "Slow"}</span>
            <span><i className="legend-swatch is-heavy" />{tr ? "Yoğun" : "Heavy"}</span>
          </>
        ) : (
          <>
            <span><i className="legend-line is-primary" />{tr ? "Ana rota" : "Primary route"}</span>
            <span><i className="legend-line is-alternative" />{tr ? "Alternatif" : "Alternative"}</span>
          </>
        )}
        {scenario && scenario.type !== "baseline" && <span><i className="legend-line is-scenario" style={{ borderColor: selectedColor }} />{tr ? "Seçilen müdahale" : "Selected action"}</span>}
      </div>
      {scenario && <div className={`map-scenario-card ${selectedDeltaMinutes < -0.05 ? "is-better" : selectedDeltaMinutes > 0.05 ? "is-worse" : "is-neutral"}`} role="status">
        <span className="map-scenario-glyph" aria-hidden="true">{scenarioGlyph(scenario)}</span>
        <span><small>{tr ? "HARİTADA GÖSTERİLEN" : "SHOWN ON MAP"}</small><strong>{scenario.title}</strong><em>{selectedEffect}</em></span>
      </div>}
      {interactionMode && (
        <div className="map-instruction" role="status">
          {interactionMode === "start"
            ? (tr ? "Haritada başlangıç noktasına dokunun" : "Select the start point on the map")
            : interactionMode === "end"
              ? (tr ? "Haritada varış noktasına dokunun" : "Select the destination on the map")
              : (tr ? "Yeni yolun düğüm noktalarını haritada seçin" : "Select the new road vertices on the map")}
        </div>
      )}
    </div>
  );
}
