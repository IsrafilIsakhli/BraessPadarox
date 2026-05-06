import { getTexts } from "../i18n";
import type { Language, ScenarioResult, SimulationResponse } from "../types";

type Props = {
  simulation: SimulationResponse | null;
  language: Language;
};

function scenarioTone(scenario: ScenarioResult): string {
  if (scenario.deltaMinutes > 0.15) return "bad";
  if (scenario.deltaMinutes < -0.15) return "good";
  return "neutral";
}

export function DecisionSummary({ simulation, language }: Props) {
  if (!simulation) return null;

  const text = getTexts(language).decision;
  const baseline = simulation.scenarios.find((scenario) => scenario.key === "mevcut_ag");
  const maxMinutes = Math.max(...simulation.scenarios.map((scenario) => scenario.totalMinutes));
  const selectedSignal = simulation.interventions.trafficSignals.find((signal) => signal.selected);

  return (
    <section className="decision-panel">
      <div className="decision-verdict">
        <span>{text.eyebrow}</span>
        <h2>{simulation.braessDetected ? text.braessRisk : text.braessSafe}</h2>
        <p>{simulation.summary.plainLanguage}</p>
      </div>

      <div className="confidence-meter">
        <span>{text.confidence}</span>
        <strong>{simulation.summary.confidencePercent}%</strong>
        <p>
          {text.directionality(
            simulation.summary.directionality.oneWayEdges,
            simulation.summary.directionality.twoWayPairs
          )}
        </p>
      </div>

      <div className="human-next-step">
        <span>{text.nextStep}</span>
        <strong>
          {selectedSignal
            ? `${selectedSignal.location.lat.toFixed(5)}, ${selectedSignal.location.lon.toFixed(5)}`
            : simulation.recommended.title}
        </strong>
        <p>{selectedSignal ? text.signalStep : text.recommendedStep}</p>
      </div>

      <div className="scenario-bars">
        <div className="bars-header">
          <span>{text.scenarioVisual}</span>
          {baseline && <em>{text.reference}: {baseline.totalMinutes.toFixed(1)} {text.minuteShort}</em>}
        </div>
        {simulation.scenarios.map((scenario) => (
          <div key={scenario.key} className="bar-row">
            <label>{scenario.title}</label>
            <div className="bar-track">
              <div
                className={`bar-fill ${scenarioTone(scenario)}`}
                style={{ width: `${Math.max(8, (scenario.totalMinutes / maxMinutes) * 100)}%` }}
              />
            </div>
            <strong>{scenario.totalMinutes.toFixed(1)} {text.minuteShort}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
