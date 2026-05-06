import type { ScenarioResult, SimulationResponse } from "../types";

type Props = {
  simulation: SimulationResponse | null;
  highlighted: ScenarioResult | null;
};

function statusClass(status: ScenarioResult["status"]): string {
  if (status === "Dusuk") return "badge low";
  if (status === "Orta") return "badge medium";
  return "badge high";
}

function statusLabel(status: ScenarioResult["status"]): string {
  if (status === "Dusuk") return "Düşük";
  if (status === "Orta") return "Orta";
  return "Yüksek";
}

export function MetricsCards({ simulation, highlighted }: Props) {
  if (!simulation || !highlighted) {
    return (
      <section className="card-grid">
        <div className="metric-card large">
          <span>ANALİZ SONUCU</span>
          <h3>Analiz Bekleniyor</h3>
          <p>Başlangıç ve varış seçip “Analizi Başlat” butonuna tıklayın.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="card-grid">
      <div className="metric-card large">
        <span>ANALİZ SONUCU</span>
        <h3 className={simulation.braessDetected ? "danger" : "ok"}>
          Braess Paradoksu: {simulation.braessDetected ? "VAR" : "YOK"}
        </h3>
        <p>{highlighted.note}</p>
      </div>

      <div className="metric-card">
        <span>TOPLAM SÜRE</span>
        <strong>{highlighted.totalMinutes.toFixed(1)} dk</strong>
      </div>

      <div className="metric-card">
        <span>ORT. GECİKME</span>
        <strong>{highlighted.delayMinutes.toFixed(1)} dk</strong>
      </div>

      <div className="metric-card">
        <span>YOĞUNLUK</span>
        <div className="metric-row">
          <strong>%{Math.round(highlighted.congestionPercent)}</strong>
          <span className={statusClass(highlighted.status)}>
            {statusLabel(highlighted.status)}
          </span>
        </div>
      </div>

      <div className="metric-card recommendation">
        <span>ÖNERİLEN EN İYİ ÇÖZÜM</span>
        <strong>{simulation.recommended.title}</strong>
        <p>{simulation.recommended.note}</p>
      </div>
    </section>
  );
}

