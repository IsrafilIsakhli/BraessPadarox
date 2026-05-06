import type { ScenarioResult, SimulationResponse } from "../types";

type Props = {
  simulation: SimulationResponse | null;
};

function scenarioTone(scenario: ScenarioResult): string {
  if (scenario.deltaMinutes > 0.15) return "bad";
  if (scenario.deltaMinutes < -0.15) return "good";
  return "neutral";
}

export function DecisionSummary({ simulation }: Props) {
  if (!simulation) return null;

  const baseline = simulation.scenarios.find((scenario) => scenario.key === "mevcut_ag");
  const maxMinutes = Math.max(...simulation.scenarios.map((scenario) => scenario.totalMinutes));
  const selectedSignal = simulation.interventions.trafficSignals.find((signal) => signal.selected);

  return (
    <section className="decision-panel">
      <div className="decision-verdict">
        <span>KARAR ÖZETİ</span>
        <h2>{simulation.braessDetected ? "Yeni yol riskli görünüyor" : "Yeni yol krizi görünmüyor"}</h2>
        <p>{simulation.summary.plainLanguage}</p>
      </div>

      <div className="confidence-meter">
        <span>GÜVEN</span>
        <strong>{simulation.summary.confidencePercent}%</strong>
        <p>
          {simulation.summary.directionality.oneWayEdges} tek yönlü kenar,{" "}
          {simulation.summary.directionality.twoWayPairs} çift yönlü bağlantı dikkate alındı.
        </p>
      </div>

      <div className="human-next-step">
        <span>SAHADA İLK BAKILACAK NOKTA</span>
        <strong>
          {selectedSignal
            ? `${selectedSignal.location.lat.toFixed(5)}, ${selectedSignal.location.lon.toFixed(5)}`
            : simulation.recommended.title}
        </strong>
        <p>
          {selectedSignal
            ? "Bu noktada sinyal düzeni testi en hızlı iyileşmeyi verdi."
            : "Model bu senaryoyu en düşük ortalama süreyle seçti."}
        </p>
      </div>

      <div className="scenario-bars">
        <div className="bars-header">
          <span>SENARYOLARIN GÖRSEL KARŞILAŞTIRMASI</span>
          {baseline && <em>Referans: {baseline.totalMinutes.toFixed(1)} dk</em>}
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
            <strong>{scenario.totalMinutes.toFixed(1)} dk</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

