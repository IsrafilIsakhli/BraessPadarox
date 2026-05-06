import { getTexts } from "../i18n";
import type { Language, ScenarioResult, SimulationResponse } from "../types";

type Props = {
  simulation: SimulationResponse | null;
  language: Language;
};

function statusClass(status: ScenarioResult["status"]): string {
  if (status === "Dusuk") return "badge low";
  if (status === "Orta") return "badge medium";
  return "badge high";
}

export function ScenarioTable({ simulation, language }: Props) {
  if (!simulation) return null;

  const textBundle = getTexts(language);
  const text = textBundle.table;

  return (
    <section className="table-card">
      <div className="table-header">
        <h3>{text.title}</h3>
        <div className="export-buttons">
          <button type="button">PNG</button>
          <button type="button">CSV</button>
          <button type="button" className="html-btn">
            {text.report}
          </button>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>{text.scenario}</th>
            <th>{text.time}</th>
            <th>{text.delay}</th>
            <th>{text.delta}</th>
            <th>{text.congestion}</th>
            <th>{text.status}</th>
            <th>{text.intervention}</th>
          </tr>
        </thead>
        <tbody>
          {simulation.scenarios.map((scenario) => (
            <tr
              key={scenario.key}
              className={scenario.key === simulation.recommended.key ? "highlight" : ""}
            >
              <td>{scenario.title}</td>
              <td>{scenario.totalMinutes.toFixed(1)} {text.minuteShort}</td>
              <td>{scenario.delayMinutes.toFixed(1)} {text.minuteShort}</td>
              <td className={scenario.deltaMinutes > 0 ? "delta bad" : "delta good"}>
                {scenario.deltaMinutes > 0 ? "+" : ""}
                {scenario.deltaMinutes.toFixed(2)} {text.minuteShort}
              </td>
              <td>%{Math.round(scenario.congestionPercent)}</td>
              <td>
                <span className={statusClass(scenario.status)}>
                  {textBundle.status[scenario.status]}
                </span>
              </td>
              <td>{scenario.intervention ?? text.reference}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
