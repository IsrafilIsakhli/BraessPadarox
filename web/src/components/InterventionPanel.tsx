import type { SimulationResponse } from "../types";

type Props = {
  simulation: SimulationResponse | null;
};

function directionLabel(value: string): string {
  return value === "cift_yonlu" ? "Çift yönlü" : "Tek yönlü";
}

export function InterventionPanel({ simulation }: Props) {
  if (!simulation) return null;

  const { newRoad, trafficSignals } = simulation.interventions;
  const selectedSignal = trafficSignals.find((signal) => signal.selected);

  return (
    <section className="intervention-grid">
      <div className="analysis-card">
        <span>YENİ YOL TESTİ</span>
        <h3>{directionLabel(newRoad.selectedMode)} bağlantı seçildi</h3>
        <p>{newRoad.note}</p>
        <dl>
          <div>
            <dt>Başlangıç</dt>
            <dd>
              {newRoad.from.lat.toFixed(5)}, {newRoad.from.lon.toFixed(5)}
            </dd>
          </div>
          <div>
            <dt>Bitiş</dt>
            <dd>
              {newRoad.to.lat.toFixed(5)}, {newRoad.to.lon.toFixed(5)}
            </dd>
          </div>
          <div>
            <dt>Uzunluk</dt>
            <dd>{newRoad.lengthKm.toFixed(2)} km</dd>
          </div>
        </dl>
      </div>

      <div className="analysis-card">
        <span>TRAFİK IŞIĞI TESTİ</span>
        <h3>
          {selectedSignal
            ? `${selectedSignal.improvementMinutes.toFixed(2)} dk iyileşme`
            : "Uygun aday yok"}
        </h3>
        {selectedSignal ? (
          <p>
            En iyi aday {selectedSignal.location.lat.toFixed(5)},{" "}
            {selectedSignal.location.lon.toFixed(5)} noktasında test edildi.
          </p>
        ) : (
          <p>Darboğaz yoğunluğu ışık yerleşimi için yeterli sinyal vermedi.</p>
        )}
        <div className="signal-list">
          {trafficSignals.map((signal, index) => (
            <div key={signal.id} className={signal.selected ? "selected" : ""}>
              <strong>{index + 1}</strong>
              <span>
                {signal.location.lat.toFixed(5)}, {signal.location.lon.toFixed(5)}
              </span>
              <em>{signal.improvementMinutes.toFixed(2)} dk</em>
            </div>
          ))}
        </div>
      </div>

      <div className="analysis-card">
        <span>YÖN ANALİZİ</span>
        <h3>{simulation.summary.directionality.directedEdges} yönlü kenar</h3>
        <p>{simulation.summary.model}</p>
        <dl>
          <div>
            <dt>Tek yönlü</dt>
            <dd>{simulation.summary.directionality.oneWayEdges}</dd>
          </div>
          <div>
            <dt>Çift yönlü</dt>
            <dd>{simulation.summary.directionality.twoWayPairs} çift</dd>
          </div>
          <div>
            <dt>Talep</dt>
            <dd>{Math.round(simulation.summary.demandVehPerHour)} araç/saat</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

