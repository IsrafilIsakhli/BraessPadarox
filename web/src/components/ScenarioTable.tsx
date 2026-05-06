import type { ScenarioResult, SimulationResponse } from "../types";

type Props = {
  simulation: SimulationResponse | null;
};

function statusLabel(status: ScenarioResult["status"]): string {
  if (status === "Dusuk") return "DÜŞÜK";
  if (status === "Orta") return "ORTA";
  return "YÜKSEK";
}

function statusClass(status: ScenarioResult["status"]): string {
  if (status === "Dusuk") return "badge low";
  if (status === "Orta") return "badge medium";
  return "badge high";
}

export function ScenarioTable({ simulation }: Props) {
  if (!simulation) return null;

  return (
    <section className="table-card">
      <div className="table-header">
        <h3>Senaryo Karşılaştırması</h3>
        <div className="export-buttons">
          <button type="button">PNG</button>
          <button type="button">CSV</button>
          <button type="button" className="html-btn">
            HTML Rapor
          </button>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Senaryo</th>
            <th>Süre</th>
            <th>Gecikme</th>
            <th>Fark</th>
            <th>Yoğunluk</th>
            <th>Durum</th>
            <th>Müdahale</th>
          </tr>
        </thead>
        <tbody>
          {simulation.scenarios.map((scenario) => (
            <tr
              key={scenario.key}
              className={scenario.key === simulation.recommended.key ? "highlight" : ""}
            >
              <td>{scenario.title}</td>
              <td>{scenario.totalMinutes.toFixed(1)} dk</td>
              <td>{scenario.delayMinutes.toFixed(1)} dk</td>
              <td className={scenario.deltaMinutes > 0 ? "delta bad" : "delta good"}>
                {scenario.deltaMinutes > 0 ? "+" : ""}
                {scenario.deltaMinutes.toFixed(2)} dk
              </td>
              <td>%{Math.round(scenario.congestionPercent)}</td>
              <td>
                <span className={statusClass(scenario.status)}>
                  {statusLabel(scenario.status)}
                </span>
              </td>
              <td>{scenario.intervention ?? "Referans"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
