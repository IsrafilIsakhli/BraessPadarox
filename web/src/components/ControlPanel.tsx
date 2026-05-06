import type { Coordinates, ScenarioOption } from "../types";

type Props = {
  startInput: string;
  endInput: string;
  onStartInputChange: (value: string) => void;
  onEndInputChange: (value: string) => void;
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
};

export function ControlPanel(props: Props) {
  const {
    startInput,
    endInput,
    onStartInputChange,
    onEndInputChange,
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
    endPoint
  } = props;

  return (
    <aside className="side-panel">
      <div className="panel-title">
        <h2>Kontrol Paneli</h2>
        <p>V1.0 Karar Destek Sistemi</p>
      </div>

      <div className="form-block">
        <label>BAŞLANGIÇ NOKTASI</label>
        <input
          value={startInput}
          onChange={(e) => onStartInputChange(e.target.value)}
          placeholder="Enlem, Boylam"
        />
        <button
          type="button"
          className={pickMode === "start" ? "secondary-btn active" : "secondary-btn"}
          onClick={() => setPickMode(pickMode === "start" ? null : "start")}
        >
          Haritadan Seç
        </button>
        <p className="coord-label">
          {startPoint
            ? `Seçili: ${startPoint.lat.toFixed(5)}, ${startPoint.lon.toFixed(5)}`
            : "Seçili başlangıç yok"}
        </p>
      </div>

      <div className="form-block">
        <label>VARIŞ NOKTASI</label>
        <input
          value={endInput}
          onChange={(e) => onEndInputChange(e.target.value)}
          placeholder="Enlem, Boylam"
        />
        <button
          type="button"
          className={pickMode === "end" ? "secondary-btn active" : "secondary-btn"}
          onClick={() => setPickMode(pickMode === "end" ? null : "end")}
        >
          Haritadan Seç
        </button>
        <p className="coord-label">
          {endPoint
            ? `Seçili: ${endPoint.lat.toFixed(5)}, ${endPoint.lon.toFixed(5)}`
            : "Seçili varış yok"}
        </p>
      </div>

      <button type="button" className="apply-coord-btn" onClick={onApplyCoordinateInput}>
        Lat/Lon Girişini Uygula
      </button>

      <div className="form-block">
        <label>SENARYO AYARLARI</label>
        <div className="radio-group">
          <label>
            <input
              type="radio"
              name="scenario"
              checked={selectedScenario === "mevcut_ag"}
              onChange={() => setSelectedScenario("mevcut_ag")}
            />
            Mevcut Ağ
          </label>
          <label>
            <input
              type="radio"
              name="scenario"
              checked={selectedScenario === "yeni_yol_ekle"}
              onChange={() => setSelectedScenario("yeni_yol_ekle")}
            />
            Yeni Yol Ekle
          </label>
          <label>
            <input
              type="radio"
              name="scenario"
              checked={selectedScenario === "yol_kapat"}
              onChange={() => setSelectedScenario("yol_kapat")}
            />
            Yol Kapat
          </label>
        </div>
      </div>

      <div className="toggle-block">
        <label>
          Trafik Lambası
          <input
            type="checkbox"
            checked={trafficLight}
            onChange={(e) => setTrafficLight(e.target.checked)}
          />
        </label>
        <label>
          Acil Araç Önceliği
          <input
            type="checkbox"
            checked={emergencyPriority}
            onChange={(e) => setEmergencyPriority(e.target.checked)}
          />
        </label>
      </div>

      <div className="panel-actions">
        <button type="button" className="primary-btn" onClick={onAnalyze} disabled={loading}>
          {loading ? "Simülasyon Hesaplanıyor..." : "Analizi Başlat"}
        </button>
        <button type="button" className="reset-btn" onClick={onReset} disabled={loading}>
          Sıfırla
        </button>
      </div>
    </aside>
  );
}

