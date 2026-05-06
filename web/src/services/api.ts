import type { Coordinates, RouteData, SimulationResponse } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

type SimulateParams = {
  start: Coordinates;
  end: Coordinates;
  routeMeta: {
    distanceKm: number;
    durationMin: number;
    alternativeDurationMin?: number;
    routes: RouteData[];
    reverseRoutes: RouteData[];
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

  try {
    response = await fetch(`${API_BASE_URL}/api/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params)
    });
  } catch {
    throw new Error("Simulasyon API'sine baglanilamadi. Docker servislerini kontrol edin.");
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
    const message = payload?.message ?? "Simulasyon servisi yanit vermedi.";

    throw new Error(detail ? `${message}: ${detail}` : message);
  }

  return (await response.json()) as SimulationResponse;
}

