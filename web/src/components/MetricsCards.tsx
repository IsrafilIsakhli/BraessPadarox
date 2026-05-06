import { getTexts } from "../i18n";
import type { Language, ScenarioResult, SimulationResponse } from "../types";

type Props = {
  simulation: SimulationResponse | null;
  highlighted: ScenarioResult | null;
  language: Language;
};

function statusClass(status: ScenarioResult["status"]): string {
  if (status === "Dusuk") return "badge low";
  if (status === "Orta") return "badge medium";
  return "badge high";
}

export function MetricsCards({ simulation, highlighted, language }: Props) {
  const textBundle = getTexts(language);
  const text = textBundle.metrics;

  if (!simulation || !highlighted) {
    return (
      <section className="card-grid">
        <div className="metric-card large">
          <span>{text.resultEyebrow}</span>
          <h3>{text.waitingTitle}</h3>
          <p>{text.waitingBody}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="card-grid">
      <div className="metric-card large">
        <span>{text.resultEyebrow}</span>
        <h3 className={simulation.braessDetected ? "danger" : "ok"}>
          {text.braessLabel}: {simulation.braessDetected ? text.present : text.absent}
        </h3>
        <p>{highlighted.note}</p>
      </div>

      <div className="metric-card">
        <span>{text.totalTime}</span>
        <strong>{highlighted.totalMinutes.toFixed(1)} {textBundle.map.minuteShort}</strong>
      </div>

      <div className="metric-card">
        <span>{text.averageDelay}</span>
        <strong>{highlighted.delayMinutes.toFixed(1)} {textBundle.map.minuteShort}</strong>
      </div>

      <div className="metric-card">
        <span>{text.congestion}</span>
        <div className="metric-row">
          <strong>%{Math.round(highlighted.congestionPercent)}</strong>
          <span className={statusClass(highlighted.status)}>
            {textBundle.status[highlighted.status]}
          </span>
        </div>
      </div>

      <div className="metric-card recommendation">
        <span>{text.recommended}</span>
        <strong>{simulation.recommended.title}</strong>
        <p>{simulation.recommended.note}</p>
      </div>
    </section>
  );
}
