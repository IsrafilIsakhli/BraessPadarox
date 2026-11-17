export type Coordinates = {
  lat: number;
  lon: number;
};

export type Language = "en" | "tr" | "az";

export type InfoPageKey = "documentation" | "methodology" | "about";

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

export type RouteData = {
  distanceKm: number;
  durationMin: number;
  geometry: [number, number][];
  segments?: RouteSegmentData[];
};

export type RouteSegmentData = {
  distanceKm: number;
  durationMin: number;
  name?: string;
  geometry: [number, number][];
};

export type ScenarioOption = "mevcut_ag" | "yeni_yol_ekle" | "yol_kapat";

export type AnalysisMode = "static" | "live-calibrated";

export type AdvancedScenarioInput =
  | {
      type: "newRoad";
      id?: string;
      name?: string;
      geometry: [number, number][];
      direction: "one-way" | "two-way";
      reverseGeometry?: [number, number][];
      waypoints?: [number, number][];
      laneCount: number;
      speedLimitKmh: number;
      capacityVehPerHour?: number;
    }
  | { type: "closure"; id?: string; name?: string; edgeId?: string; location?: Coordinates }
  | {
      type: "signal";
      id?: string;
      name?: string;
      nodeId?: string;
      location?: Coordinates;
      cycleSeconds?: number;
      greenRatio?: number;
    }
  | { type: "emergencyPriority"; id?: string; name?: string };

export type DataQuality = {
  score: number;
  grade: "high" | "medium" | "low";
  coveragePercent: number;
  averageConfidence?: number;
  demandSource: "manual" | "estimated";
  stale: boolean;
  notes: string[];
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
  mapEdges?: ModelMapEdge[];
  key: string;
  type: AdvancedScenarioInput["type"] | "baseline";
  title: string;
  category: "network" | "emergency";
  metrics: EquilibriumMetrics;
  deltaMinutes: number;
  deltaPercent: number;
  uncertainty?: {
    p10DeltaPercent: number;
    medianDeltaPercent: number;
    p90DeltaPercent: number;
    probabilityOfWorsening: number;
    samples: number;
  };
  affectedGeometry?: [number, number][];
  reverseAffectedGeometry?: [number, number][];
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
    mapEdges?: ModelMapEdge[];
    sensitivity?: Array<{ demand: number; baselineMinutes: number; scenarioMinutes: number; converged: boolean }>;
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

export type ModelMapEdge = { edgeId: string; geometry: [number,number][]; flowVehPerHour: number; capacityVehPerHour: number; volumeCapacityRatio: number; speedKmh: number; travelTimeMinutes: number };
