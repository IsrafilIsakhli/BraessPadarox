import { useMemo, useState } from "react";
import { ControlPanel } from "./components/ControlPanel";
import { DecisionSummary } from "./components/DecisionSummary";
import { InterventionPanel } from "./components/InterventionPanel";
import { LeafletMap } from "./components/LeafletMap";
import { MetricsCards } from "./components/MetricsCards";
import { ScenarioTable } from "./components/ScenarioTable";
import { simulateBraess } from "./services/api";
import { fetchDrivingRoutes } from "./services/routing";
import type {
  Coordinates,
  RouteData,
  ScenarioKey,
  ScenarioOption,
  ScenarioResult,
  SimulationResponse
} from "./types";

const DEFAULT_CENTER: Coordinates = { lat: 40.4093, lon: 49.8671 };

function parseCoordInput(value: string): Coordinates | null {
  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);

  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function mapOptionToScenario(
  option: ScenarioOption,
  simulation: SimulationResponse | null
): ScenarioKey {
  if (option === "mevcut_ag") return "mevcut_ag";
  if (option === "yeni_yol_ekle") {
    return (
      simulation?.braessCausingScenarioKey ??
      simulation?.interventions.newRoad.selectedScenarioKey ??
      "yeni_yol_cift_yonlu"
    );
  }
  return "baglanti_yolu_kapat";
}

export default function App() {
  const [startInput, setStartInput] = useState("40.4206, 49.9187");
  const [endInput, setEndInput] = useState("40.4042, 49.8075");
  const [startPoint, setStartPoint] = useState<Coordinates | null>(null);
  const [endPoint, setEndPoint] = useState<Coordinates | null>(null);
  const [pickMode, setPickMode] = useState<"start" | "end" | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioOption>("mevcut_ag");
  const [trafficLight, setTrafficLight] = useState(false);
  const [emergencyPriority, setEmergencyPriority] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [simulation, setSimulation] = useState<SimulationResponse | null>(null);
  const [baseRoute, setBaseRoute] = useState<RouteData | null>(null);
  const [alternativeRoute, setAlternativeRoute] = useState<RouteData | null>(null);

  const center = useMemo(() => {
    if (startPoint) return startPoint;
    if (endPoint) return endPoint;
    return DEFAULT_CENTER;
  }, [startPoint, endPoint]);

  const highlightedScenario: ScenarioResult | null = useMemo(() => {
    if (!simulation) return null;
    const scenarioKey = mapOptionToScenario(selectedScenario, simulation);
    return (
      simulation.scenarios.find((s) => s.key === scenarioKey) ?? simulation.scenarios[0] ?? null
    );
  }, [simulation, selectedScenario]);

  const activeScenarioKey: ScenarioKey | null = highlightedScenario?.key ?? null;

  function applyCoordinateInput() {
    const parsedStart = parseCoordInput(startInput);
    const parsedEnd = parseCoordInput(endInput);

    if (!parsedStart || !parsedEnd) {
      setErrorMessage("Koordinat formatı geçersiz. Örnek: 40.4093, 49.8671");
      return;
    }

    setStartPoint(parsedStart);
    setEndPoint(parsedEnd);
    setErrorMessage(null);
  }

  function handlePick(mode: "start" | "end", coords: Coordinates) {
    if (mode === "start") {
      setStartPoint(coords);
      setStartInput(`${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`);
    } else {
      setEndPoint(coords);
      setEndInput(`${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`);
    }
  }

  function resetAll() {
    setStartInput("40.4206, 49.9187");
    setEndInput("40.4042, 49.8075");
    setStartPoint(null);
    setEndPoint(null);
    setPickMode(null);
    setSelectedScenario("mevcut_ag");
    setTrafficLight(false);
    setEmergencyPriority(false);
    setLoading(false);
    setErrorMessage(null);
    setSimulation(null);
    setBaseRoute(null);
    setAlternativeRoute(null);
  }

  async function handleAnalyze() {
    const start = startPoint ?? parseCoordInput(startInput);
    const end = endPoint ?? parseCoordInput(endInput);

    if (!start || !end) {
      setErrorMessage("Analiz için başlangıç ve varış koordinatları zorunludur.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const routes = await fetchDrivingRoutes(start, end);
      let reverseRoutes: RouteData[] = [];
      try {
        reverseRoutes = await fetchDrivingRoutes(end, start);
      } catch {
        reverseRoutes = [];
      }
      const [primaryRoute, altRoute] = routes;

      setBaseRoute(primaryRoute);
      setAlternativeRoute(altRoute ?? null);

      const response = await simulateBraess({
        start,
        end,
        routeMeta: {
          distanceKm: primaryRoute.distanceKm,
          durationMin: primaryRoute.durationMin,
          alternativeDurationMin: altRoute?.durationMin,
          routes,
          reverseRoutes
        },
        toggles: {
          trafficLight,
          emergencyPriority
        }
      });

      setSimulation(response);
      setPickMode(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Beklenmeyen hata oluştu.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="layout">
      <header className="topbar">
        <div className="brand">Braess Paradoksu Analiz</div>
        <nav>
          <a href="#">Dokümantasyon</a>
          <a href="#">Metodoloji</a>
          <a href="#">Hakkında</a>
        </nav>
      </header>

      <div className="content-area">
        <ControlPanel
          startInput={startInput}
          endInput={endInput}
          onStartInputChange={setStartInput}
          onEndInputChange={setEndInput}
          onApplyCoordinateInput={applyCoordinateInput}
          pickMode={pickMode}
          setPickMode={setPickMode}
          selectedScenario={selectedScenario}
          setSelectedScenario={setSelectedScenario}
          trafficLight={trafficLight}
          emergencyPriority={emergencyPriority}
          setTrafficLight={setTrafficLight}
          setEmergencyPriority={setEmergencyPriority}
          onAnalyze={handleAnalyze}
          onReset={resetAll}
          loading={loading}
          startPoint={startPoint}
          endPoint={endPoint}
        />

        <main className="main-panel">
          {errorMessage && <div className="error-banner">{errorMessage}</div>}

          <LeafletMap
            center={center}
            startPoint={startPoint}
            endPoint={endPoint}
            pickMode={pickMode}
            onPick={handlePick}
            baseRoute={baseRoute}
            alternativeRoute={alternativeRoute}
            activeScenarioKey={activeScenarioKey}
            newRoad={simulation?.interventions.newRoad ?? null}
            trafficSignals={simulation?.interventions.trafficSignals ?? []}
          />

          <DecisionSummary simulation={simulation} />
          <MetricsCards simulation={simulation} highlighted={highlightedScenario} />
          <InterventionPanel simulation={simulation} />
          <ScenarioTable simulation={simulation} />
        </main>
      </div>
    </div>
  );
}
