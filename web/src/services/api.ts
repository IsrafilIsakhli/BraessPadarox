import { getTexts } from "../i18n";
import { apiLanguage } from "../localization";
import type {
  AdvancedScenarioInput,
  AdvancedSimulationResponse,
  AnalysisMode,
  Coordinates,
  Language,
  LiveTrafficAnalysis,
  RouteData,
  SimulationResponse
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

type SimulateParams = {
  language: Language;
  demandVehPerHour?: number;
  start: Coordinates;
  end: Coordinates;
  routeMeta: {
    distanceKm: number;
    durationMin: number;
    alternativeDurationMin?: number;
    routes: RouteData[];
    reverseRoutes: RouteData[];
    candidateConnector?: {
      from: Coordinates;
      to: Coordinates;
      route: RouteData;
    };
  };
  toggles: {
    trafficLight: boolean;
    emergencyPriority: boolean;
  };
};

type ApiErrorPayload = {
  message?: string;
  detail?: string;
  issues?: Array<{ path?: Array<string | number>; message?: string }>;
};

export async function simulateBraess(
  params: SimulateParams
): Promise<SimulationResponse> {
  let response: Response;
  const errors = getTexts(params.language).errors;

  try {
    response = await fetch(`${API_BASE_URL}/api/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, language: apiLanguage(params.language) })
    });
  } catch {
    throw new Error(errors.apiConnection);
  }

  if (!response.ok) {
    let payload: ApiErrorPayload | null = null;
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      payload = null;
    }

    const firstIssue = payload?.issues?.[0];
    const issueText = firstIssue
      ? `${firstIssue.path?.join(".")}: ${firstIssue.message}`
      : undefined;
    const detail = payload?.detail ?? issueText;
    const message = payload?.message ?? errors.apiNoResponse;

    throw new Error(detail ? `${message}: ${detail}` : message);
  }

  return (await response.json()) as SimulationResponse;
}

type AdvancedSimulationParams = {
  mode: AnalysisMode;
  language: Language;
  start: Coordinates;
  end: Coordinates;
  demand?: {
    forwardVehPerHour?: number;
    reverseVehPerHour?: number;
  };
  routeMeta?: {
    routes: RouteData[];
    reverseRoutes: RouteData[];
  };
  scenarios: AdvancedScenarioInput[];
};

async function parseApiError(response: Response, fallback: string): Promise<Error> {
  let payload: ApiErrorPayload & { code?: string } = {};
  try {
    payload = (await response.json()) as ApiErrorPayload & { code?: string };
  } catch {
    payload = {};
  }
  const issue = payload.issues?.[0];
  const detail = payload.detail ?? issue?.message;
  const message = payload.message ?? fallback;
  return new Error(detail ? `${message}: ${detail}` : message);
}

export async function runAdvancedAnalysis(
  params: AdvancedSimulationParams
): Promise<AdvancedSimulationResponse> {
  const errors = getTexts(params.language).errors;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, language: apiLanguage(params.language) })
    });
  } catch {
    throw new Error(errors.apiConnection);
  }
  if (!response.ok) throw await parseApiError(response, errors.apiNoResponse);
  return (await response.json()) as AdvancedSimulationResponse;
}

export async function fetchLiveTrafficAnalysis(
  start: Coordinates,
  end: Coordinates,
  language: Language
): Promise<LiveTrafficAnalysis> {
  const errors = getTexts(language).errors;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/live-traffic/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start, end, language: apiLanguage(language), departAt: "now" })
    });
  } catch {
    throw new Error(errors.apiConnection);
  }
  if (!response.ok) throw await parseApiError(response, errors.apiNoResponse);
  return (await response.json()) as LiveTrafficAnalysis;
}
