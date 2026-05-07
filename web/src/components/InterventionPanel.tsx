import { getTexts } from "../i18n";
import type { Language, SimulationResponse } from "../types";

type Props = {
  simulation: SimulationResponse | null;
  language: Language;
};

export function InterventionPanel({ simulation, language }: Props) {
  if (!simulation) return null;

  const textBundle = getTexts(language);
  const text = textBundle.interventions;
  const { newRoad, trafficSignals, emergencyPriority } = simulation.interventions;
  const selectedSignal = trafficSignals.find((signal) => signal.selected);
  const direction = textBundle.direction[newRoad.selectedMode];

  return (
    <section className="intervention-grid">
      <div className="analysis-card">
        <span>{text.newRoadTest}</span>
        <h3>{text.roadSelected(direction)}</h3>
        <p>{newRoad.note}</p>
        <dl>
          <div>
            <dt>{text.start}</dt>
            <dd>
              {newRoad.from.lat.toFixed(5)}, {newRoad.from.lon.toFixed(5)}
            </dd>
          </div>
          <div>
            <dt>{text.end}</dt>
            <dd>
              {newRoad.to.lat.toFixed(5)}, {newRoad.to.lon.toFixed(5)}
            </dd>
          </div>
          <div>
            <dt>{text.length}</dt>
            <dd>{newRoad.lengthKm.toFixed(2)} km</dd>
          </div>
        </dl>
      </div>

      <div className="analysis-card">
        <span>{text.trafficSignalTest}</span>
        <h3>
          {selectedSignal
            ? text.improvement(selectedSignal.improvementMinutes.toFixed(2))
            : text.noCandidate}
        </h3>
        {selectedSignal ? (
          <p>
            {text.bestCandidate(
              selectedSignal.location.lat.toFixed(5),
              selectedSignal.location.lon.toFixed(5)
            )}
          </p>
        ) : (
          <p>{text.noSignalBody}</p>
        )}
        {selectedSignal && (
          <dl className="compact-dl">
            <div>
              <dt>{text.controlledApproaches}</dt>
              <dd>{selectedSignal.controlledApproaches}</dd>
            </div>
            <div>
              <dt>{text.queueReduction}</dt>
              <dd>%{Math.round(selectedSignal.queueReductionPercent)}</dd>
            </div>
          </dl>
        )}
        <div className="signal-list">
          {trafficSignals.map((signal, index) => (
            <div key={signal.id} className={signal.selected ? "selected" : ""}>
              <strong>{index + 1}</strong>
              <span title={signal.reason}>
                {signal.location.lat.toFixed(5)}, {signal.location.lon.toFixed(5)}
              </span>
              <em>{signal.improvementMinutes.toFixed(2)} {textBundle.map.minuteShort}</em>
            </div>
          ))}
        </div>
      </div>

      <div className="analysis-card emergency-card">
        <span>{text.emergencyPriorityTest}</span>
        <h3>{text.emergencyImprovement(emergencyPriority.improvementMinutes.toFixed(2))}</h3>
        <p>{emergencyPriority.note}</p>
        <dl>
          <div>
            <dt>{text.baseEta}</dt>
            <dd>{emergencyPriority.travelTimeWithoutPriority.toFixed(2)} {textBundle.map.minuteShort}</dd>
          </div>
          <div>
            <dt>{text.priorityEta}</dt>
            <dd>{emergencyPriority.travelTimeWithPriority.toFixed(2)} {textBundle.map.minuteShort}</dd>
          </div>
          <div>
            <dt>{text.affectedEdges}</dt>
            <dd>{emergencyPriority.affectedEdges}</dd>
          </div>
        </dl>
      </div>

      <div className="analysis-card">
        <span>{text.directionAnalysis}</span>
        <h3>{text.directedEdges(simulation.summary.directionality.directedEdges)}</h3>
        <p>{simulation.summary.model}</p>
        <dl>
          <div>
            <dt>{text.oneWay}</dt>
            <dd>{simulation.summary.directionality.oneWayEdges}</dd>
          </div>
          <div>
            <dt>{text.twoWay}</dt>
            <dd>
              {simulation.summary.directionality.twoWayPairs} {text.pairSuffix}
            </dd>
          </div>
          <div>
            <dt>{text.demand}</dt>
            <dd>{Math.round(simulation.summary.demandVehPerHour)} {text.vehiclePerHour}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
