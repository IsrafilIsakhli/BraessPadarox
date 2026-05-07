import { getTexts } from "../i18n";
import type { Coordinates, Language, ScenarioOption } from "../types";

type Props = {
  startInput: string;
  endInput: string;
  vehicleDemandInput: string;
  onStartInputChange: (value: string) => void;
  onEndInputChange: (value: string) => void;
  onVehicleDemandInputChange: (value: string) => void;
  onApplyCoordinateInput: () => void;
  pickMode: "start" | "end" | null;
  setPickMode: (value: "start" | "end" | null) => void;
  selectedScenario: ScenarioOption;
  setSelectedScenario: (value: ScenarioOption) => void;
  trafficLight: boolean;
  emergencyPriority: boolean;
  setTrafficLight: (value: boolean) => void;
  setEmergencyPriority: (value: boolean) => void;
  onAnalyze: () => void;
  onReset: () => void;
  loading: boolean;
  startPoint: Coordinates | null;
  endPoint: Coordinates | null;
  language: Language;
};

const scenarioOptions: ScenarioOption[] = ["mevcut_ag", "yeni_yol_ekle", "yol_kapat"];

export function ControlPanel(props: Props) {
  const {
    startInput,
    endInput,
    vehicleDemandInput,
    onStartInputChange,
    onEndInputChange,
    onVehicleDemandInputChange,
    onApplyCoordinateInput,
    pickMode,
    setPickMode,
    selectedScenario,
    setSelectedScenario,
    trafficLight,
    emergencyPriority,
    setTrafficLight,
    setEmergencyPriority,
    onAnalyze,
    onReset,
    loading,
    startPoint,
    endPoint,
    language
  } = props;
  const text = getTexts(language).controls;

  return (
    <aside className="side-panel">
      <div className="panel-title">
        <h2>{text.title}</h2>
        <p>{text.subtitle}</p>
      </div>

      <div className="form-block">
        <label>{text.startLabel}</label>
        <input
          value={startInput}
          onChange={(e) => onStartInputChange(e.target.value)}
          placeholder={text.placeholder}
        />
        <button
          type="button"
          className={pickMode === "start" ? "secondary-btn active" : "secondary-btn"}
          onClick={() => setPickMode(pickMode === "start" ? null : "start")}
        >
          {text.chooseFromMap}
        </button>
        <p className="coord-label">
          {startPoint
            ? `${text.selectedPrefix}: ${startPoint.lat.toFixed(5)}, ${startPoint.lon.toFixed(5)}`
            : text.noStart}
        </p>
      </div>

      <div className="form-block">
        <label>{text.endLabel}</label>
        <input
          value={endInput}
          onChange={(e) => onEndInputChange(e.target.value)}
          placeholder={text.placeholder}
        />
        <button
          type="button"
          className={pickMode === "end" ? "secondary-btn active" : "secondary-btn"}
          onClick={() => setPickMode(pickMode === "end" ? null : "end")}
        >
          {text.chooseFromMap}
        </button>
        <p className="coord-label">
          {endPoint
            ? `${text.selectedPrefix}: ${endPoint.lat.toFixed(5)}, ${endPoint.lon.toFixed(5)}`
            : text.noEnd}
        </p>
      </div>

      <button type="button" className="apply-coord-btn" onClick={onApplyCoordinateInput}>
        {text.applyCoordinates}
      </button>

      <div className="form-block">
        <label>{text.vehicleDemandLabel}</label>
        <input
          type="number"
          min={100}
          max={12000}
          step={50}
          value={vehicleDemandInput}
          onChange={(e) => onVehicleDemandInputChange(e.target.value)}
          placeholder={text.vehicleDemandPlaceholder}
        />
        <p className="coord-label">{text.vehicleDemandHint}</p>
      </div>

      <div className="form-block">
        <label>{text.scenarioSettings}</label>
        <div className="radio-group">
          {scenarioOptions.map((scenario) => (
            <label key={scenario}>
              <input
                type="radio"
                name="scenario"
                checked={selectedScenario === scenario}
                onChange={() => setSelectedScenario(scenario)}
              />
              {text.scenarios[scenario]}
            </label>
          ))}
        </div>
      </div>

      <div className="toggle-block">
        <label>
          {text.trafficLight}
          <input
            type="checkbox"
            checked={trafficLight}
            onChange={(e) => setTrafficLight(e.target.checked)}
          />
        </label>
        <label>
          {text.emergencyPriority}
          <input
            type="checkbox"
            checked={emergencyPriority}
            onChange={(e) => setEmergencyPriority(e.target.checked)}
          />
        </label>
      </div>

      <div className="panel-actions">
        <button type="button" className="primary-btn" onClick={onAnalyze} disabled={loading}>
          {loading ? text.loading : text.analyze}
        </button>
        <button type="button" className="reset-btn" onClick={onReset} disabled={loading}>
          {text.reset}
        </button>
      </div>
    </aside>
  );
}
