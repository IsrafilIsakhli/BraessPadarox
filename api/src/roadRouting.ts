import type { AdvancedSimulationRequest } from "./types.js";

type Point = [number, number];
type RouteReply = { code: string; routes?: { geometry: { coordinates: Point[] } }[]; waypoints?: { distance: number }[] };
const cache = new Map<string, { expires: number; request: Promise<Point[]> }>();

// The driving profile enforces OSM access, one-way and turn restrictions.
// Each direction is routed independently: reversing a polyline is never a legal route check.
export async function routeRoadGeometry(geometry: Point[]): Promise<Point[]> {
  const count = Math.min(48, geometry.length);
  const controls = Array.from({ length: count }, (_, i) => geometry[Math.round(i * (geometry.length - 1) / (count - 1))]);
  const key = controls.map(([lat, lon]) => `${lon},${lat}`).join(";");
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return existing.request;
  const request = (async () => {
    const radiuses = controls.map(() => "60").join(";");
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${key}?overview=full&geometries=geojson&steps=false&continue_straight=true&radiuses=${radiuses}`, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("Road validation unavailable. Please retry; the intervention was not applied.");
    const data = await response.json() as RouteReply;
    const points = data.routes?.[0]?.geometry.coordinates;
    if (data.code !== "Ok" || !points || points.length < 2 || data.waypoints?.some((point) => point.distance > 60)) {
      throw new Error("No legal driving route follows the selected points. Move the points onto accessible roads.");
    }
    return points.map(([lon, lat]) => [lat, lon] as Point);
  })();
  if (cache.size > 200) cache.clear();
  cache.set(key, { expires: Date.now() + 300000, request });
  try { return await request; } catch (error) { cache.delete(key); throw error; }
}

export async function validateRoadScenarios(input: AdvancedSimulationRequest): Promise<AdvancedSimulationRequest> {
  const scenarios = [];
  for (const scenario of input.scenarios) {
    if (scenario.type !== "newRoad") { scenarios.push(scenario); continue; }
    const [geometry, reverseGeometry] = await Promise.all([
      routeRoadGeometry(scenario.waypoints ?? scenario.geometry),
      scenario.direction === "two-way" ? routeRoadGeometry([...(scenario.waypoints ?? [scenario.geometry[0],scenario.geometry[scenario.geometry.length - 1]])].reverse()) : Promise.resolve(undefined)
    ]);
    scenarios.push({ ...scenario, geometry, reverseGeometry });
  }
  return { ...input, scenarios };
}
