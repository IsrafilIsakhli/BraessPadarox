import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMapEvents
} from "react-leaflet";
import L from "leaflet";
import { getTexts } from "../i18n";
import type {
  Coordinates,
  Language,
  NewRoadTest,
  RouteData,
  ScenarioKey,
  TrafficSignalPlacement
} from "../types";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
});

const startIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

const endIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

const colorByScenario: Record<ScenarioKey, string> = {
  mevcut_ag: "#d61e35",
  yeni_yol_tek_yonlu: "#f59e0b",
  yeni_yol_cift_yonlu: "#f97316",
  baglanti_yolu_kapat: "#1d4ed8",
  akilli_isiklandirma: "#059669",
  acil_arac_onceligi: "#111827"
};

type Props = {
  center: Coordinates;
  startPoint: Coordinates | null;
  endPoint: Coordinates | null;
  pickMode: "start" | "end" | null;
  onPick: (mode: "start" | "end", coords: Coordinates) => void;
  baseRoute: RouteData | null;
  alternativeRoute: RouteData | null;
  activeScenarioKey: ScenarioKey | null;
  newRoad: NewRoadTest | null;
  trafficSignals: TrafficSignalPlacement[];
  language: Language;
};

function Picker({ pickMode, onPick }: Pick<Props, "pickMode" | "onPick">) {
  useMapEvents({
    click(e) {
      if (!pickMode) return;
      onPick(pickMode, { lat: e.latlng.lat, lon: e.latlng.lng });
    }
  });

  return null;
}

export function LeafletMap({
  center,
  startPoint,
  endPoint,
  pickMode,
  onPick,
  baseRoute,
  alternativeRoute,
  activeScenarioKey,
  newRoad,
  trafficSignals,
  language
}: Props) {
  const defaultColor = activeScenarioKey ? colorByScenario[activeScenarioKey] : "#d61e35";
  const secondaryColor = "#2f2f2f";
  const text = getTexts(language).map;

  useEffect(() => {
    document.querySelectorAll(".leaflet-control-attribution").forEach((node) => {
      (node as HTMLElement).style.fontSize = "11px";
    });
  }, []);

  return (
    <section className="map-card">
      <MapContainer center={[center.lat, center.lon]} zoom={13} className="map-container">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Picker pickMode={pickMode} onPick={onPick} />

        {startPoint && (
          <Marker position={[startPoint.lat, startPoint.lon]} icon={startIcon}>
            <Tooltip permanent direction="top">
              {text.start}
            </Tooltip>
          </Marker>
        )}
        {endPoint && (
          <Marker position={[endPoint.lat, endPoint.lon]} icon={endIcon}>
            <Tooltip permanent direction="top">
              {text.end}
            </Tooltip>
          </Marker>
        )}

        {baseRoute && (
          <Polyline positions={baseRoute.geometry} color={defaultColor} weight={6} opacity={0.9} />
        )}

        {alternativeRoute && (
          <Polyline
            positions={alternativeRoute.geometry}
            color={secondaryColor}
            weight={5}
            opacity={0.75}
            dashArray="10 8"
          />
        )}

        {newRoad && (
          <Polyline
            positions={[
              [newRoad.from.lat, newRoad.from.lon],
              [newRoad.to.lat, newRoad.to.lon]
            ]}
            color="#f97316"
            weight={6}
            opacity={0.95}
            dashArray={newRoad.selectedMode === "cift_yonlu" ? undefined : "12 8"}
          >
            <Tooltip sticky>
              {text.newRoad}: {newRoad.selectedMode === "cift_yonlu" ? text.twoWay : text.oneWay}
            </Tooltip>
          </Polyline>
        )}

        {trafficSignals.map((signal, index) => (
          <CircleMarker
            key={signal.id}
            center={[signal.location.lat, signal.location.lon]}
            radius={signal.selected ? 10 : 7}
            color={signal.selected ? "#059669" : "#0f766e"}
            fillColor={signal.selected ? "#10b981" : "#99f6e4"}
            fillOpacity={0.9}
            weight={3}
          >
            <Tooltip permanent={signal.selected} direction="top">
              {text.signal} {index + 1}: {signal.improvementMinutes.toFixed(2)} {text.minuteShort}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      <div className="legend">
        <span>
          <i className="dot green" /> {text.legendFree}
        </span>
        <span>
          <i className="dot amber" /> {text.legendModerate}
        </span>
        <span>
          <i className="dot red" /> {text.legendHeavy}
        </span>
      </div>
    </section>
  );
}
