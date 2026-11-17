import { getTexts } from "../i18n";
import type { Coordinates, Language, RouteData } from "../types";

type OsrmResponse = {
  code: string;
  routes: Array<{
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
    legs?: Array<{
      steps?: Array<{
        name?: string;
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
      }>;
    }>;
  }>;
};

const routeCache = new Map<string, Promise<RouteData[]>>();

function routeCacheKey(start: Coordinates, end: Coordinates, language: Language): string {
  return [
    language,
    start.lat.toFixed(6),
    start.lon.toFixed(6),
    end.lat.toFixed(6),
    end.lon.toFixed(6)
  ].join("|");
}

export function deriveRoadAlignedConnector(routes: RouteData[]): [number, number][] {
  const primary = routes[0]?.geometry ?? [];
  if (primary.length < 2) return [];

  const startIndex = Math.floor((primary.length - 1) * 0.3);
  const endIndex = Math.ceil((primary.length - 1) * 0.7);
  const connector = primary.slice(startIndex, endIndex + 1);

  return connector.length >= 2 ? connector : [primary[0], primary[primary.length - 1]];
}

export function mergeRoadAlignedGeometry(
  current: [number, number][],
  nextSegment: [number, number][]
): [number, number][] {
  if (!nextSegment.length) return current;
  if (current.length <= 1) return nextSegment;

  const currentEnd = current[current.length - 1];
  const segmentStart = nextSegment[0];
  const sameJoin =
    Math.abs(currentEnd[0] - segmentStart[0]) < 0.00001 &&
    Math.abs(currentEnd[1] - segmentStart[1]) < 0.00001;
  const merged = [
    ...current,
    ...nextSegment.slice(sameJoin ? 1 : 0)
  ];

  if (!sameJoin) throw new Error("Road segments do not share a routed junction. Select the last road point again.");
  return merged;
}

function toRouteData(route: OsrmResponse["routes"][number]): RouteData {
  const segments =
    route.legs
      ?.flatMap((leg) => leg.steps ?? [])
      .map((step) => ({
        distanceKm: Math.max(step.distance / 1000, 0),
        durationMin: Math.max(step.duration / 60, 0),
        name: step.name || "Unnamed road",
        geometry: step.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number])
      }))
      .filter((step) => step.geometry.length >= 2) ?? [];

  return {
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    geometry: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    segments
  };
}

export async function fetchDrivingRoutes(
  start: Coordinates,
  end: Coordinates,
  language: Language = "en"
): Promise<RouteData[]> {
  const cacheKey = routeCacheKey(start, end, language);
  const cached = routeCache.get(cacheKey);
  if (cached) return cached;

  const request = fetchDrivingRoutesFromOsrm(start, end, language).catch((error) => {
    routeCache.delete(cacheKey);
    throw error;
  });
  routeCache.set(cacheKey, request);
  return request;
}

async function fetchDrivingRoutesFromOsrm(
  start: Coordinates,
  end: Coordinates,
  language: Language
): Promise<RouteData[]> {
  const errors = getTexts(language).errors;
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${start.lon},${start.lat};${end.lon},${end.lat}` +
    `?overview=full&geometries=geojson&alternatives=true&steps=true&radiuses=100;100`;

  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) {
    throw new Error(errors.osmUnavailable);
  }

  const data = (await response.json()) as OsrmResponse;
  if (data.code !== "Ok" || !data.routes.length) {
    throw new Error(errors.routeNotFound);
  }

  return data.routes.map(toRouteData);
}
