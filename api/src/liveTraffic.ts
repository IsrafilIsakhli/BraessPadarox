import type {
  Coordinates,
  Language,
  LiveFlowSegment,
  LiveTrafficAnalysis,
  LiveTrafficIncident,
  LiveTrafficRoute
} from "./types.js";

const FRESH_CACHE_MS = 60_000;
const STALE_CACHE_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_FLOW_SAMPLES = 24;
const FLOW_CONCURRENCY = 4;

type CacheEntry = {
  createdAt: number;
  value: LiveTrafficAnalysis;
};

const cache = new Map<string, CacheEntry>();

export class LiveTrafficError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function cacheKey(start: Coordinates, end: Coordinates, language: Language): string {
  return [
    start.lat.toFixed(4),
    start.lon.toFixed(4),
    end.lat.toFixed(4),
    end.lon.toFixed(4),
    language
  ].join("|");
}

async function fetchJson(url: URL): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });

    if (response.status === 429) {
      throw new LiveTrafficError(
        "TomTom request limit was reached. Try again shortly.",
        "RATE_LIMITED",
        429
      );
    }
    if (response.status === 403) {
      throw new LiveTrafficError(
        "TomTom rejected the configured API key.",
        "INVALID_PROVIDER_KEY",
        502
      );
    }
    if (!response.ok) {
      throw new LiveTrafficError(
        `TomTom returned HTTP ${response.status}.`,
        "PROVIDER_UNAVAILABLE",
        502
      );
    }

    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof LiveTrafficError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new LiveTrafficError(
        "TomTom did not respond within eight seconds.",
        "PROVIDER_TIMEOUT",
        504
      );
    }
    throw new LiveTrafficError(
      "Live traffic data could not be reached.",
      "PROVIDER_UNAVAILABLE",
      502
    );
  } finally {
    clearTimeout(timeout);
  }
}

function routeGeometry(route: Record<string, unknown>): [number, number][] {
  const points: [number, number][] = [];
  for (const legValue of asArray(route.legs)) {
    const leg = asRecord(legValue);
    for (const pointValue of asArray(leg.points)) {
      const point = asRecord(pointValue);
      const lat = asNumber(point.latitude, Number.NaN);
      const lon = asNumber(point.longitude, Number.NaN);
      if (Number.isFinite(lat) && Number.isFinite(lon)) points.push([lat, lon]);
    }
  }
  return points;
}

async function fetchRoutes(
  start: Coordinates,
  end: Coordinates,
  apiKey: string
): Promise<LiveTrafficRoute[]> {
  const path = `${start.lat},${start.lon}:${end.lat},${end.lon}`;
  const url = new URL(`https://api.tomtom.com/routing/1/calculateRoute/${path}/json`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("traffic", "true");
  url.searchParams.set("departAt", "now");
  url.searchParams.set("travelMode", "car");
  url.searchParams.set("routeType", "fastest");
  url.searchParams.set("maxAlternatives", "2");
  url.searchParams.set("alternativeType", "anyRoute");
  url.searchParams.set("routeRepresentation", "polyline");
  url.searchParams.set("computeTravelTimeFor", "all");
  url.searchParams.set("sectionType", "traffic");

  const data = asRecord(await fetchJson(url));
  const routes = asArray(data.routes).map((value, index) => {
    const route = asRecord(value);
    const summary = asRecord(route.summary);
    const travelSeconds = asNumber(summary.travelTimeInSeconds);
    const noTrafficSeconds = asNumber(summary.noTrafficTravelTimeInSeconds, travelSeconds);
    const historicSeconds = asNumber(summary.historicTrafficTravelTimeInSeconds, Number.NaN);
    return {
      id: `live-route-${index + 1}`,
      distanceKm: round(asNumber(summary.lengthInMeters) / 1000),
      travelTimeMinutes: round(travelSeconds / 60),
      noTrafficTravelTimeMinutes: round(noTrafficSeconds / 60),
      historicTravelTimeMinutes: Number.isFinite(historicSeconds)
        ? round(historicSeconds / 60)
        : undefined,
      trafficDelayMinutes: round(asNumber(summary.trafficDelayInSeconds) / 60),
      trafficLengthKm: round(asNumber(summary.trafficLengthInMeters) / 1000),
      geometry: routeGeometry(route)
    } satisfies LiveTrafficRoute;
  });

  return routes.filter((route) => route.geometry.length >= 2 && route.distanceKm > 0);
}

function sampleGeometry(geometry: [number, number][]): Coordinates[] {
  if (!geometry.length) return [];
  const targetCount = Math.min(MAX_FLOW_SAMPLES, Math.max(6, Math.ceil(geometry.length / 12)));
  const seen = new Set<string>();
  const samples: Coordinates[] = [];

  for (let index = 0; index < targetCount; index += 1) {
    const pointIndex = Math.round((index / Math.max(targetCount - 1, 1)) * (geometry.length - 1));
    const [lat, lon] = geometry[pointIndex];
    const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    samples.push({ lat, lon });
  }

  return samples;
}

async function mapLimit<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return results;
}

function parseFlowGeometry(value: unknown): [number, number][] {
  const coordinates = asRecord(asRecord(value).coordinates);
  return asArray(coordinates.coordinate)
    .map((item) => {
      const point = asRecord(item);
      return [
        asNumber(point.latitude, Number.NaN),
        asNumber(point.longitude, Number.NaN)
      ] as [number, number];
    })
    .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
}

async function fetchFlowSegment(
  point: Coordinates,
  apiKey: string,
  index: number
): Promise<LiveFlowSegment | null> {
  const url = new URL(
    "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/16/json"
  );
  url.searchParams.set("key", apiKey);
  url.searchParams.set("point", `${point.lat},${point.lon}`);
  url.searchParams.set("unit", "kmph");

  try {
    const payload = asRecord(await fetchJson(url));
    const flow = asRecord(payload.flowSegmentData);
    const currentSpeed = asNumber(flow.currentSpeed);
    const freeFlowSpeed = asNumber(flow.freeFlowSpeed);
    if (currentSpeed <= 0 || freeFlowSpeed <= 0) return null;

    return {
      id: `flow-${index + 1}`,
      point,
      roadClass: asString(flow.frc) || undefined,
      currentSpeedKmh: round(currentSpeed, 1),
      freeFlowSpeedKmh: round(freeFlowSpeed, 1),
      currentTravelTimeSeconds: round(asNumber(flow.currentTravelTime), 1),
      freeFlowTravelTimeSeconds: round(asNumber(flow.freeFlowTravelTime), 1),
      confidence: round(clamp(asNumber(flow.confidence), 0, 1), 2),
      roadClosure: flow.roadClosure === true,
      geometry: parseFlowGeometry(flow)
    };
  } catch {
    return null;
  }
}

function flattenCoordinatePairs(value: unknown, output: [number, number][]): void {
  if (!Array.isArray(value)) return;
  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    output.push([value[1], value[0]]);
    return;
  }
  value.forEach((item) => flattenCoordinatePairs(item, output));
}

function incidentMagnitude(value: unknown): string {
  const labels = ["unknown", "minor", "moderate", "major", "critical"];
  const numeric = Math.round(asNumber(value, 0));
  return labels[clamp(numeric, 0, labels.length - 1)];
}

async function fetchIncidents(
  geometries: [number, number][][],
  apiKey: string,
  language: Language
): Promise<LiveTrafficIncident[]> {
  const points = geometries.flat();
  if (!points.length) return [];
  const lats = points.map(([lat]) => lat);
  const lons = points.map(([, lon]) => lon);
  const margin = 0.012;
  const bbox = [
    Math.min(...lons) - margin,
    Math.min(...lats) - margin,
    Math.max(...lons) + margin,
    Math.max(...lats) + margin
  ].join(",");

  const url = new URL("https://api.tomtom.com/traffic/services/5/incidentDetails");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("bbox", bbox);
  url.searchParams.set("language", language === "tr" ? "tr-TR" : "en-GB");
  url.searchParams.set("timeValidityFilter", "present");
  url.searchParams.set(
    "fields",
    "{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code},from,to,delay}}}"
  );

  try {
    const payload = asRecord(await fetchJson(url));
    return asArray(payload.incidents).map((value, index) => {
      const incident = asRecord(value);
      const properties = asRecord(incident.properties);
      const geometryRecord = asRecord(incident.geometry);
      const geometry: [number, number][] = [];
      flattenCoordinatePairs(geometryRecord.coordinates, geometry);
      const firstEvent = asRecord(asArray(properties.events)[0]);
      return {
        id: asString(properties.id, `incident-${index + 1}`),
        category: asString(properties.iconCategory, "incident"),
        magnitude: incidentMagnitude(properties.magnitudeOfDelay),
        description: asString(firstEvent.description, "Traffic incident"),
        delaySeconds: asNumber(properties.delay, Number.NaN),
        from: asString(properties.from) || undefined,
        to: asString(properties.to) || undefined,
        geometry
      } satisfies LiveTrafficIncident;
    });
  } catch {
    return [];
  }
}

function makeQuality(
  expectedSamples: number,
  flows: LiveFlowSegment[],
  stale: boolean,
  language: Language
): LiveTrafficAnalysis["dataQuality"] {
  const coverage = expectedSamples > 0 ? flows.length / expectedSamples : 0;
  const averageConfidence = flows.length
    ? flows.reduce((sum, flow) => sum + flow.confidence, 0) / flows.length
    : 0;
  const score = Math.round(clamp(35 + coverage * 35 + averageConfidence * 30 - (stale ? 20 : 0), 0, 100));
  const grade = score >= 78 ? "high" : score >= 52 ? "medium" : "low";
  const notes = language === "tr"
    ? [
        `Canlı akış kapsamı %${Math.round(coverage * 100)}.`,
        stale ? "Son başarılı canlı veri kullanılıyor." : "Veri son TomTom anlık görüntüsünden alındı."
      ]
    : [
        `Live flow coverage is ${Math.round(coverage * 100)}%.`,
        stale ? "The last successful live snapshot is being used." : "Data comes from the latest TomTom snapshot."
      ];

  return {
    score,
    grade,
    coveragePercent: Math.round(coverage * 100),
    averageConfidence: round(averageConfidence, 2),
    stale,
    notes
  };
}

async function loadLiveTraffic(
  start: Coordinates,
  end: Coordinates,
  language: Language,
  apiKey: string
): Promise<LiveTrafficAnalysis> {
  const routes = await fetchRoutes(start, end, apiKey);
  if (!routes.length) {
    throw new LiveTrafficError(
      "TomTom could not find a traffic-aware route for these points.",
      "ROUTE_NOT_FOUND",
      404
    );
  }

  const samples = sampleGeometry(routes[0].geometry);
  const flowResults = await mapLimit(samples, FLOW_CONCURRENCY, (point, index) =>
    fetchFlowSegment(point, apiKey, index)
  );
  const flowSegments = flowResults.filter(
    (segment): segment is LiveFlowSegment => segment !== null
  );
  const incidents = await fetchIncidents(
    routes.map((route) => route.geometry),
    apiKey,
    language
  );

  return {
    snapshotAt: new Date().toISOString(),
    provider: "TomTom",
    stale: false,
    routes,
    flowSegments,
    incidents,
    dataQuality: makeQuality(samples.length, flowSegments, false, language)
  };
}

export async function analyzeLiveTraffic(
  start: Coordinates,
  end: Coordinates,
  language: Language = "en",
  apiKey = process.env.TOMTOM_API_KEY?.trim()
): Promise<LiveTrafficAnalysis> {
  if (!apiKey) {
    throw new LiveTrafficError(
      language === "tr"
        ? "Canlı trafik servisi henüz yapılandırılmadı."
        : "The live traffic service is not configured yet.",
      "LIVE_TRAFFIC_NOT_CONFIGURED",
      503
    );
  }

  const key = cacheKey(start, end, language);
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && now - cached.createdAt <= FRESH_CACHE_MS) return cached.value;

  try {
    const value = await loadLiveTraffic(start, end, language, apiKey);
    cache.set(key, { createdAt: now, value });
    return value;
  } catch (error) {
    if (cached && now - cached.createdAt <= STALE_CACHE_MS) {
      const staleValue: LiveTrafficAnalysis = {
        ...cached.value,
        stale: true,
        dataQuality: makeQuality(
          cached.value.flowSegments.length,
          cached.value.flowSegments,
          true,
          language
        )
      };
      return staleValue;
    }
    throw error;
  }
}

export function clearLiveTrafficCache(): void {
  cache.clear();
}
