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

function compactGeometry(points: [number, number][], maxPoints = 24): [number, number][] {
  if (points.length <= maxPoints) return points;

  const compacted: [number, number][] = [points[0]];
  const step = (points.length - 1) / (maxPoints - 1);

  for (let i = 1; i < maxPoints - 1; i += 1) {
    compacted.push(points[Math.round(i * step)]);
  }

  compacted.push(points[points.length - 1]);
  return compacted;
}

function toRouteData(route: OsrmResponse["routes"][number]): RouteData {
  const segments =
    route.legs
      ?.flatMap((leg) => leg.steps ?? [])
      .map((step) => ({
        distanceKm: Math.max(step.distance / 1000, 0),
        durationMin: Math.max(step.duration / 60, 0),
        name: step.name || "Unnamed road",
        geometry: compactGeometry(
          step.geometry.coordinates.map(([lon, lat]) => [lat, lon] as [number, number])
        )
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
  const errors = getTexts(language).errors;
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${start.lon},${start.lat};${end.lon},${end.lat}` +
    `?overview=full&geometries=geojson&alternatives=true&steps=true`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(errors.osmUnavailable);
  }

  const data = (await response.json()) as OsrmResponse;
  if (data.code !== "Ok" || !data.routes.length) {
    throw new Error(errors.routeNotFound);
  }

  return data.routes.map(toRouteData);
}
