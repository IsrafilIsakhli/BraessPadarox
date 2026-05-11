import { useEffect, useMemo, useState } from "react";
import { ControlPanel } from "./components/ControlPanel";
import { DecisionSummary } from "./components/DecisionSummary";
import { InterventionPanel } from "./components/InterventionPanel";
import { InfoPanel } from "./components/InfoPanel";
import { LeafletMap } from "./components/LeafletMap";
import { MetricsCards } from "./components/MetricsCards";
import { ScenarioTable } from "./components/ScenarioTable";
import { getTexts } from "./i18n";
import { simulateBraess } from "./services/api";
import { fetchDrivingRoutes } from "./services/routing";
import type {
  Coordinates,
  InfoPageKey,
  Language,
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

function parseDemandInput(value: string): number | undefined | null {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const demand = Number(trimmed);
  if (!Number.isFinite(demand)) return null;
  if (demand < 100 || demand > 12000) return null;
  return Math.round(demand);
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
  const [language, setLanguage] = useState<Language>("en");
  const [startInput, setStartInput] = useState("40.4206, 49.9187");
  const [endInput, setEndInput] = useState("40.4042, 49.8075");
  const [vehicleDemandInput, setVehicleDemandInput] = useState("");
  const [startPoint, setStartPoint] = useState<Coordinates | null>(null);
  const [endPoint, setEndPoint] = useState<Coordinates | null>(null);
  const [pickMode, setPickMode] = useState<"start" | "end" | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioOption>("mevcut_ag");
  const [trafficLight, setTrafficLight] = useState(false);
  const [emergencyPriority, setEmergencyPriority] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeInfoPage, setActiveInfoPage] = useState<InfoPageKey | null>(null);

  const [simulation, setSimulation] = useState<SimulationResponse | null>(null);
  const [baseRoute, setBaseRoute] = useState<RouteData | null>(null);
  const [alternativeRoute, setAlternativeRoute] = useState<RouteData | null>(null);
  const texts = getTexts(language);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = texts.app.documentTitle;
  }, [language, texts.app.documentTitle]);

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

  function applyCoordinateInput() {
    const parsedStart = parseCoordInput(startInput);
    const parsedEnd = parseCoordInput(endInput);

    if (!parsedStart || !parsedEnd) {
      setErrorMessage(texts.errors.invalidCoordinates);
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
    setVehicleDemandInput("");
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

  function handleLanguageChange(nextLanguage: Language) {
    if (nextLanguage === language) return;
    setLanguage(nextLanguage);
    setActiveInfoPage(null);
    setErrorMessage(null);
    setSimulation(null);
  }

  async function handleAnalyze() {
    const start = startPoint ?? parseCoordInput(startInput);
    const end = endPoint ?? parseCoordInput(endInput);
    const demandVehPerHour = parseDemandInput(vehicleDemandInput);

    if (!start || !end) {
      setErrorMessage(texts.errors.missingCoordinates);
      return;
    }

    if (demandVehPerHour === null) {
      setErrorMessage(texts.errors.invalidDemand);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const routes = await fetchDrivingRoutes(start, end, language);
      let reverseRoutes: RouteData[] = [];
      try {
        reverseRoutes = await fetchDrivingRoutes(end, start, language);
      } catch {
        reverseRoutes = [];
      }
      const [primaryRoute, altRoute] = routes;

      setBaseRoute(primaryRoute);
      setAlternativeRoute(altRoute ?? null);

      const basePayload = {
        language,
        demandVehPerHour,
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
      };

      const firstPass = await simulateBraess(basePayload);
      let response = firstPass;

      try {
        const connectorRoutes = await fetchDrivingRoutes(
          firstPass.interventions.newRoad.from,
          firstPass.interventions.newRoad.to,
          language
        );
        const connectorRoute = connectorRoutes[0];

        if (connectorRoute) {
          response = await simulateBraess({
            ...basePayload,
            routeMeta: {
              ...basePayload.routeMeta,
              candidateConnector: {
                from: firstPass.interventions.newRoad.from,
                to: firstPass.interventions.newRoad.to,
                route: connectorRoute
              }
            }
          });
        }
      } catch {
        response = firstPass;
      }

      setSimulation(response);
      setPickMode(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : texts.errors.unexpected;
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="layout">
      <header className="topbar">
        <div className="brand">{texts.app.brand}</div>
        <div className="topbar-actions">
          <nav>
            {(["documentation", "methodology", "about"] as InfoPageKey[]).map((page) => (
              <button
                key={page}
                type="button"
                className={activeInfoPage === page ? "active" : ""}
                onClick={() => setActiveInfoPage(page)}
              >
                {texts.nav[page]}
              </button>
            ))}
          </nav>
          <div className="language-switch" aria-label={texts.language.label}>
            <span>{texts.language.label}</span>
            <button
              type="button"
              className={language === "en" ? "active" : ""}
              onClick={() => handleLanguageChange("en")}
            >
              {texts.language.english}
            </button>
            <button
              type="button"
              className={language === "tr" ? "active" : ""}
              onClick={() => handleLanguageChange("tr")}
            >
              {texts.language.turkish}
            </button>
          </div>
        </div>
      </header>

      <div className="content-area">
        <ControlPanel
          startInput={startInput}
          endInput={endInput}
          vehicleDemandInput={vehicleDemandInput}
          onStartInputChange={setStartInput}
          onEndInputChange={setEndInput}
          onVehicleDemandInputChange={setVehicleDemandInput}
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
          language={language}
        />

        <main className="main-panel">
          {errorMessage && <div className="error-banner">{errorMessage}</div>}

          <InfoPanel
            activePage={activeInfoPage}
            language={language}
            onClose={() => setActiveInfoPage(null)}
          />

          <LeafletMap
            center={center}
            startPoint={startPoint}
            endPoint={endPoint}
            pickMode={pickMode}
            onPick={handlePick}
            baseRoute={baseRoute}
            alternativeRoute={alternativeRoute}
            newRoad={simulation?.interventions.newRoad ?? null}
            trafficSignals={simulation?.interventions.trafficSignals ?? []}
            emergencyPriorityPlan={simulation?.interventions.emergencyPriority ?? null}
            showTrafficSignals={trafficLight}
            showEmergencyPriority={emergencyPriority}
            language={language}
          />

          <DecisionSummary simulation={simulation} language={language} />
          <MetricsCards
            simulation={simulation}
            highlighted={highlightedScenario}
            language={language}
          />
          <InterventionPanel simulation={simulation} language={language} />
          <ScenarioTable simulation={simulation} language={language} />
        </main>
      </div>
    </div>
  );
}
