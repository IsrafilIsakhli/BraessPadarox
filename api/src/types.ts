export type Coordinates = {
  lat: number;
  lon: number;
};

export type StatusLevel = "Dusuk" | "Orta" | "Yuksek";

export type ScenarioKey =
  | "mevcut_ag"
  | "yeni_yol_tek_yonlu"
  | "yeni_yol_cift_yonlu"
  | "baglanti_yolu_kapat"
  | "akilli_isiklandirma"
  | "acil_arac_onceligi";

export type ScenarioResult = {
  key: ScenarioKey;
  title: string;
  totalMinutes: number;
  delayMinutes: number;
  congestionPercent: number;
  deltaMinutes: number;
  status: StatusLevel;
  note: string;
  intervention?: string;
  directionMode?: "tek_yonlu" | "cift_yonlu" | "mevcut";
};

export type RoutePayload = {
  distanceKm: number;
  durationMin: number;
  geometry: [number, number][];
  segments?: RouteSegmentPayload[];
};

export type RouteSegmentPayload = {
  distanceKm: number;
  durationMin: number;
  name?: string;
  geometry: [number, number][];
};

export type TrafficSignalPlacement = {
  id: string;
  location: Coordinates;
  affectedEdges: number;
  totalMinutes: number;
  improvementMinutes: number;
  selected: boolean;
};

export type NewRoadTest = {
  from: Coordinates;
  to: Coordinates;
  lengthKm: number;
  freeFlowMinutes: number;
  oneWayTotalMinutes: number;
  twoWayTotalMinutes: number;
  selectedMode: "tek_yonlu" | "cift_yonlu";
  selectedScenarioKey: ScenarioKey;
  note: string;
};

export type DirectionalitySummary = {
  directedEdges: number;
  oneWayEdges: number;
  twoWayEdges: number;
  twoWayPairs: number;
};

export type SimulationRequest = {
  start: Coordinates;
  end: Coordinates;
  routeMeta: {
    distanceKm: number;
    durationMin: number;
    alternativeDurationMin?: number;
    routes?: RoutePayload[];
    reverseRoutes?: RoutePayload[];
  };
  toggles?: {
    trafficLight?: boolean;
    emergencyPriority?: boolean;
  };
};

export type SimulationResponse = {
  braessDetected: boolean;
  summary: {
    distanceKm: number;
    baseDurationMin: number;
    demandVehPerHour: number;
    model: string;
    confidencePercent: number;
    plainLanguage: string;
    evidence: string[];
    directionality: DirectionalitySummary;
  };
  scenarios: ScenarioResult[];
  recommended: ScenarioResult;
  braessCausingScenarioKey?: ScenarioKey;
  interventions: {
    newRoad: NewRoadTest;
    trafficSignals: TrafficSignalPlacement[];
  };
};
