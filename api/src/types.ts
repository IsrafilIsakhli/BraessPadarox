export type Coordinates = {
  lat: number;
  lon: number;
};

export type Language = "en" | "tr";

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
  controlledApproaches: number;
  score: number;
  queueReductionPercent: number;
  totalMinutes: number;
  improvementMinutes: number;
  reason: string;
  selected: boolean;
};

export type EmergencyPriorityPlan = {
  corridor: Coordinates[];
  affectedEdges: number;
  travelTimeWithoutPriority: number;
  travelTimeWithPriority: number;
  improvementMinutes: number;
  signalDelayReductionPercent: number;
  capacityBoostPercent: number;
  note: string;
};

export type NewRoadTest = {
  from: Coordinates;
  to: Coordinates;
  geometry: [number, number][];
  geometrySource: "straight_candidate" | "road_matched";
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
  language?: Language;
  demandVehPerHour?: number;
  start: Coordinates;
  end: Coordinates;
  routeMeta: {
    distanceKm: number;
    durationMin: number;
    alternativeDurationMin?: number;
    routes?: RoutePayload[];
    reverseRoutes?: RoutePayload[];
    candidateConnector?: {
      from: Coordinates;
      to: Coordinates;
      route: RoutePayload;
    };
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
    emergencyPriority: EmergencyPriorityPlan;
  };
};

export type AnalysisMode = "static" | "live-calibrated";

export type DemandInput = {
  forwardVehPerHour?: number;
  reverseVehPerHour?: number;
};

export type NewRoadScenarioInput = {
  type: "newRoad";
  id?: string;
  name?: string;
  geometry: [number, number][];
  direction: "one-way" | "two-way";
  laneCount: number;
  speedLimitKmh: number;
  capacityVehPerHour?: number;
};

export type ClosureScenarioInput = {
  type: "closure";
  id?: string;
  name?: string;
  edgeId?: string;
};

export type SignalScenarioInput = {
  type: "signal";
  id?: string;
  name?: string;
  nodeId?: string;
  cycleSeconds?: number;
  greenRatio?: number;
};

export type EmergencyScenarioInput = {
  type: "emergencyPriority";
  id?: string;
  name?: string;
};

export type AdvancedScenarioInput =
  | NewRoadScenarioInput
  | ClosureScenarioInput
  | SignalScenarioInput
  | EmergencyScenarioInput;

export type AdvancedSimulationRequest = {
  mode: AnalysisMode;
  language?: Language;
  start: Coordinates;
  end: Coordinates;
  demand?: DemandInput;
  routeMeta?: {
    routes?: RoutePayload[];
    reverseRoutes?: RoutePayload[];
  };
  scenarios: AdvancedScenarioInput[];
};

export type DataQuality = {
  score: number;
  grade: "high" | "medium" | "low";
  coveragePercent: number;
  averageConfidence?: number;
  demandSource: "manual" | "estimated";
  stale: boolean;
  notes: string[];
};

export type UncertaintySummary = {
  p10DeltaPercent: number;
  medianDeltaPercent: number;
  p90DeltaPercent: number;
  probabilityOfWorsening: number;
  samples: number;
};

export type EquilibriumMetrics = {
  feasible: boolean;
  converged: boolean;
  averageTravelTimeMinutes: number;
  freeFlowTravelTimeMinutes: number;
  averageDelayMinutes: number;
  totalSystemTravelTimeHours: number;
  averageVolumeCapacityRatio: number;
  iterations: number;
  relativeGap: number;
};

export type AdvancedScenarioResult = {
  key: string;
  type: AdvancedScenarioInput["type"] | "baseline";
  title: string;
  category: "network" | "emergency";
  metrics: EquilibriumMetrics;
  deltaMinutes: number;
  deltaPercent: number;
  uncertainty?: UncertaintySummary;
  affectedGeometry?: [number, number][];
  affectedEdgeId?: string;
  note: string;
};

export type BraessDecision = {
  status: "detected" | "possible" | "not-detected" | "inconclusive";
  headline: string;
  summary: string;
  deltaPercent: number;
  probabilityOfWorsening: number;
  recommendedScenarioKey: string;
};

export type AdvancedSimulationResponse = {
  decision: BraessDecision;
  baseline: AdvancedScenarioResult;
  scenarios: AdvancedScenarioResult[];
  dataQuality: DataQuality;
  provenance: Array<{
    source: "TomTom" | "OSRM" | "Model" | "User";
    label: string;
    observedAt?: string;
  }>;
  diagnostics: {
    model: string;
    nodeCount: number;
    edgeCount: number;
    forwardDemandVehPerHour: number;
    reverseDemandVehPerHour: number;
    assumptions: string[];
    edgeFlows: Array<{
      edgeId: string;
      flowVehPerHour: number;
      capacityVehPerHour: number;
      travelTimeMinutes: number;
      volumeCapacityRatio: number;
      capacitySource: "road-class" | "speed-class" | "user";
      geometry: [number, number][];
    }>;
  };
  liveTraffic?: LiveTrafficAnalysis;
};

export type LiveTrafficRoute = {
  id: string;
  distanceKm: number;
  travelTimeMinutes: number;
  noTrafficTravelTimeMinutes: number;
  historicTravelTimeMinutes?: number;
  trafficDelayMinutes: number;
  trafficLengthKm: number;
  geometry: [number, number][];
};

export type LiveFlowSegment = {
  id: string;
  point: Coordinates;
  roadClass?: string;
  currentSpeedKmh: number;
  freeFlowSpeedKmh: number;
  currentTravelTimeSeconds: number;
  freeFlowTravelTimeSeconds: number;
  confidence: number;
  roadClosure: boolean;
  geometry: [number, number][];
};

export type LiveTrafficIncident = {
  id: string;
  category: string;
  magnitude: string;
  description: string;
  delaySeconds?: number;
  from?: string;
  to?: string;
  geometry: [number, number][];
};

export type LiveTrafficAnalysis = {
  snapshotAt: string;
  provider: "TomTom";
  stale: boolean;
  routes: LiveTrafficRoute[];
  flowSegments: LiveFlowSegment[];
  incidents: LiveTrafficIncident[];
  dataQuality: Omit<DataQuality, "demandSource">;
};
