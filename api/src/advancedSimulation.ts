import type {
  AdvancedScenarioInput,
  AdvancedScenarioResult,
  AdvancedSimulationRequest,
  AdvancedSimulationResponse,
  BraessDecision,
  Coordinates,
  DataQuality,
  DemandInput,
  EquilibriumMetrics,
  Language,
  LiveTrafficAnalysis,
  RoutePayload,
  UncertaintySummary
} from "./types.js";

export type GraphNode = {
  id: string;
  coord: Coordinates;
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  lengthKm: number;
  freeFlowMinutes: number;
  capacityVehPerHour: number;
  signalDelayMinutes: number;
  geometry: [number, number][];
  synthetic?: boolean;
  capacitySource: "road-class" | "speed-class" | "user";
};

export type TrafficGraph = {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  outgoing: Map<string, string[]>;
};

export type OdDemand = {
  origin: string;
  destination: string;
  demandVehPerHour: number;
};

export type SolveResult = {
  metrics: EquilibriumMetrics;
  flows: Map<string, number>;
  costs: Map<string, number>;
  bottlenecks: Array<{ edgeId: string; utilization: number }>;
};

type PreparedScenario = {
  input: AdvancedScenarioInput;
  key: string;
  title: string;
  category: "network" | "emergency";
  affectedGeometry?: [number, number][];
  affectedEdgeId?: string;
  note: string;
  apply: (graph: TrafficGraph, baseline: SolveResult) => void;
};

type HeapEntry = { node: string; distance: number };

const BPR_ALPHA = 0.15;
const BPR_BETA = 4;
const MAX_ITERATIONS = 100;
const RELATIVE_GAP_TOLERANCE = 1e-4;
const UNCERTAINTY_SAMPLES = 100;

class MinHeap {
  private values: HeapEntry[] = [];

  push(value: HeapEntry): void {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.values[parent].distance <= this.values[index].distance) break;
      [this.values[parent], this.values[index]] = [this.values[index], this.values[parent]];
      index = parent;
    }
  }

  pop(): HeapEntry | undefined {
    if (!this.values.length) return undefined;
    const first = this.values[0];
    const last = this.values.pop()!;
    if (this.values.length) {
      this.values[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < this.values.length && this.values[left].distance < this.values[smallest].distance) {
          smallest = left;
        }
        if (right < this.values.length && this.values[right].distance < this.values[smallest].distance) {
          smallest = right;
        }
        if (smallest === index) break;
        [this.values[index], this.values[smallest]] = [this.values[smallest], this.values[index]];
        index = smallest;
      }
    }
    return first;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function haversineKm(a: Coordinates, b: Coordinates): number {
  const radius = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(value));
}

function geometryLength(geometry: [number, number][]): number {
  return geometry.reduce((sum, [lat, lon], index) => {
    if (index === 0) return sum;
    const [previousLat, previousLon] = geometry[index - 1];
    return sum + haversineKm(
      { lat: previousLat, lon: previousLon },
      { lat, lon }
    );
  }, 0);
}

function createGraph(): TrafficGraph {
  return { nodes: new Map(), edges: new Map(), outgoing: new Map() };
}

function cloneGraph(graph: TrafficGraph): TrafficGraph {
  const next = createGraph();
  graph.nodes.forEach((node) => next.nodes.set(node.id, { ...node, coord: { ...node.coord } }));
  graph.edges.forEach((edge) => {
    next.edges.set(edge.id, { ...edge, geometry: edge.geometry.map((point) => [...point]) });
    next.outgoing.set(edge.from, [...(next.outgoing.get(edge.from) ?? []), edge.id]);
  });
  return next;
}

function nodeId(coord: Coordinates): string {
  return `${coord.lat.toFixed(4)},${coord.lon.toFixed(4)}`;
}

function addNode(graph: TrafficGraph, coord: Coordinates): string {
  const id = nodeId(coord);
  if (!graph.nodes.has(id)) graph.nodes.set(id, { id, coord });
  return id;
}

function addEdge(graph: TrafficGraph, edge: Omit<GraphEdge, "id">, preferredId?: string): string {
  const base = preferredId ?? `${edge.from}->${edge.to}`;
  let id = base;
  let suffix = 1;
  while (graph.edges.has(id)) {
    const existing = graph.edges.get(id)!;
    if (!preferredId && existing.from === edge.from && existing.to === edge.to) {
      existing.freeFlowMinutes = Math.min(existing.freeFlowMinutes, edge.freeFlowMinutes);
      existing.capacityVehPerHour = Math.max(existing.capacityVehPerHour, edge.capacityVehPerHour);
      existing.lengthKm = Math.min(existing.lengthKm, edge.lengthKm);
      return id;
    }
    suffix += 1;
    id = `${base}#${suffix}`;
  }
  graph.edges.set(id, { ...edge, id });
  graph.outgoing.set(edge.from, [...(graph.outgoing.get(edge.from) ?? []), id]);
  return id;
}

function removeEdge(graph: TrafficGraph, edgeId: string): void {
  const edge = graph.edges.get(edgeId);
  if (!edge) return;
  graph.edges.delete(edgeId);
  graph.outgoing.set(
    edge.from,
    (graph.outgoing.get(edge.from) ?? []).filter((id) => id !== edgeId)
  );
}

function compactGeometry(geometry: [number, number][], maxPoints = 88): [number, number][] {
  if (geometry.length <= maxPoints) return geometry;
  const compacted: [number, number][] = [geometry[0]];
  const step = (geometry.length - 1) / (maxPoints - 1);
  for (let index = 1; index < maxPoints - 1; index += 1) {
    compacted.push(geometry[Math.round(index * step)]);
  }
  compacted.push(geometry[geometry.length - 1]);
  return compacted;
}

function capacityFromSpeed(speedKmh: number): number {
  if (speedKmh >= 75) return 2100;
  if (speedKmh >= 55) return 1750;
  if (speedKmh >= 38) return 1450;
  if (speedKmh >= 25) return 1150;
  return 850;
}

function capacityFromRoadClass(roadClass?: string): number {
  const capacities: Record<string, number> = {
    FRC0: 2200,
    FRC1: 1900,
    FRC2: 1650,
    FRC3: 1400,
    FRC4: 1150,
    FRC5: 900,
    FRC6: 720
  };
  return capacities[roadClass ?? ""] ?? 1200;
}

function estimatedIntersectionDelay(speedKmh: number): number {
  if (speedKmh < 25) return 0.42;
  if (speedKmh < 40) return 0.28;
  if (speedKmh < 60) return 0.16;
  return 0.08;
}

function normalizeRoutes(
  routes: RoutePayload[] | undefined,
  start: Coordinates,
  end: Coordinates
): RoutePayload[] {
  const valid = (routes ?? []).filter((route) => route.geometry.length >= 2);
  if (valid.length) return valid;
  const distanceKm = Math.max(haversineKm(start, end), 0.2);
  return [{
    distanceKm,
    durationMin: (distanceKm / 42) * 60,
    geometry: [[start.lat, start.lon], [end.lat, end.lon]]
  }];
}

function addRoutesToGraph(graph: TrafficGraph, routes: RoutePayload[]): void {
  routes.forEach((route) => {
    const geometry = compactGeometry(route.geometry);
    const measuredLength = Math.max(geometryLength(geometry), 0.001);
    const speedKmh = clamp(route.distanceKm / Math.max(route.durationMin / 60, 0.01), 8, 110);
    for (let index = 0; index < geometry.length - 1; index += 1) {
      const [fromLat, fromLon] = geometry[index];
      const [toLat, toLon] = geometry[index + 1];
      const fromCoord = { lat: fromLat, lon: fromLon };
      const toCoord = { lat: toLat, lon: toLon };
      const segmentLength = Math.max(haversineKm(fromCoord, toCoord), 0.004);
      const from = addNode(graph, fromCoord);
      const to = addNode(graph, toCoord);
      if (from === to) continue;
      addEdge(graph, {
        from,
        to,
        lengthKm: segmentLength,
        freeFlowMinutes: Math.max(0.01, route.durationMin * (segmentLength / measuredLength)),
        capacityVehPerHour: capacityFromSpeed(speedKmh),
        signalDelayMinutes: estimatedIntersectionDelay(speedKmh),
        geometry: [[fromLat, fromLon], [toLat, toLon]],
        capacitySource: "speed-class"
      });
    }
  });
}

function nearestEdge(graph: TrafficGraph, point: Coordinates): GraphEdge | undefined {
  let closest: GraphEdge | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;
  graph.edges.forEach((edge) => {
    const from = graph.nodes.get(edge.from)?.coord;
    const to = graph.nodes.get(edge.to)?.coord;
    if (!from || !to) return;
    const midpoint = { lat: (from.lat + to.lat) / 2, lon: (from.lon + to.lon) / 2 };
    const distance = haversineKm(midpoint, point);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = edge;
    }
  });
  return closestDistance <= 1.2 ? closest : undefined;
}

function applyLiveCalibration(graph: TrafficGraph, liveTraffic?: LiveTrafficAnalysis): void {
  if (!liveTraffic) return;
  for (const segment of liveTraffic.flowSegments) {
    const edge = nearestEdge(graph, segment.point);
    if (!edge) continue;
    edge.capacityVehPerHour = capacityFromRoadClass(segment.roadClass);
    edge.capacitySource = "road-class";
    if (segment.freeFlowSpeedKmh > 0 && edge.lengthKm > 0) {
      edge.freeFlowMinutes = Math.max(0.01, (edge.lengthKm / segment.freeFlowSpeedKmh) * 60);
    }
    if (segment.roadClosure) edge.capacityVehPerHour = 1;
  }
}

function bprCost(edge: GraphEdge, flow: number): number {
  const ratio = Math.max(0, flow / Math.max(edge.capacityVehPerHour, 1));
  return edge.freeFlowMinutes * (1 + BPR_ALPHA * ratio ** BPR_BETA) + edge.signalDelayMinutes;
}

function costMap(graph: TrafficGraph, flows: Map<string, number>): Map<string, number> {
  const costs = new Map<string, number>();
  graph.edges.forEach((edge, id) => costs.set(id, bprCost(edge, flows.get(id) ?? 0)));
  return costs;
}

function shortestPath(
  graph: TrafficGraph,
  origin: string,
  destination: string,
  costs: Map<string, number>
): { edges: string[]; cost: number } | null {
  const distances = new Map<string, number>([[origin, 0]]);
  const previous = new Map<string, string>();
  const heap = new MinHeap();
  heap.push({ node: origin, distance: 0 });

  while (true) {
    const current = heap.pop();
    if (!current) break;
    if (current.distance !== distances.get(current.node)) continue;
    if (current.node === destination) break;
    for (const edgeId of graph.outgoing.get(current.node) ?? []) {
      const edge = graph.edges.get(edgeId);
      if (!edge) continue;
      const nextDistance = current.distance + (costs.get(edgeId) ?? edge.freeFlowMinutes);
      if (nextDistance < (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.to, nextDistance);
        previous.set(edge.to, edgeId);
        heap.push({ node: edge.to, distance: nextDistance });
      }
    }
  }

  const totalCost = distances.get(destination);
  if (totalCost === undefined) return null;
  const edges: string[] = [];
  let cursor = destination;
  while (cursor !== origin) {
    const edgeId = previous.get(cursor);
    if (!edgeId) return null;
    edges.unshift(edgeId);
    cursor = graph.edges.get(edgeId)!.from;
  }
  return { edges, cost: totalCost };
}

function allOrNothing(
  graph: TrafficGraph,
  ods: OdDemand[],
  costs: Map<string, number>
): { flows: Map<string, number>; shortestCostTotal: number; feasible: boolean } {
  const flows = new Map<string, number>();
  graph.edges.forEach((_edge, id) => flows.set(id, 0));
  let shortestCostTotal = 0;
  for (const od of ods) {
    if (od.demandVehPerHour <= 0) continue;
    const path = shortestPath(graph, od.origin, od.destination, costs);
    if (!path) return { flows, shortestCostTotal, feasible: false };
    shortestCostTotal += path.cost * od.demandVehPerHour;
    path.edges.forEach((edgeId) => flows.set(edgeId, (flows.get(edgeId) ?? 0) + od.demandVehPerHour));
  }
  return { flows, shortestCostTotal, feasible: true };
}

function lineSearch(
  graph: TrafficGraph,
  flows: Map<string, number>,
  target: Map<string, number>
): number {
  function derivative(lambda: number): number {
    let total = 0;
    graph.edges.forEach((edge, id) => {
      const current = flows.get(id) ?? 0;
      const direction = (target.get(id) ?? 0) - current;
      total += direction * bprCost(edge, Math.max(0, current + lambda * direction));
    });
    return total;
  }

  if (derivative(0) >= 0) return 0;
  if (derivative(1) <= 0) return 1;
  let low = 0;
  let high = 1;
  for (let index = 0; index < 36; index += 1) {
    const middle = (low + high) / 2;
    if (derivative(middle) > 0) high = middle;
    else low = middle;
  }
  return (low + high) / 2;
}

function infeasibleMetrics(): EquilibriumMetrics {
  return {
    feasible: false,
    converged: false,
    averageTravelTimeMinutes: Number.POSITIVE_INFINITY,
    freeFlowTravelTimeMinutes: Number.POSITIVE_INFINITY,
    averageDelayMinutes: Number.POSITIVE_INFINITY,
    totalSystemTravelTimeHours: Number.POSITIVE_INFINITY,
    averageVolumeCapacityRatio: 0,
    iterations: 0,
    relativeGap: Number.POSITIVE_INFINITY
  };
}

export function solveUserEquilibrium(graph: TrafficGraph, ods: OdDemand[]): SolveResult {
  const totalDemand = ods.reduce((sum, od) => sum + Math.max(0, od.demandVehPerHour), 0);
  if (!totalDemand || !ods.length) {
    return { metrics: infeasibleMetrics(), flows: new Map(), costs: new Map(), bottlenecks: [] };
  }
  const zeroFlows = new Map<string, number>();
  graph.edges.forEach((_edge, id) => zeroFlows.set(id, 0));
  const freeCosts = costMap(graph, zeroFlows);
  const initial = allOrNothing(graph, ods, freeCosts);
  if (!initial.feasible) {
    return { metrics: infeasibleMetrics(), flows: initial.flows, costs: freeCosts, bottlenecks: [] };
  }

  const flows = initial.flows;
  let relativeGap = Number.POSITIVE_INFINITY;
  let iterations = 0;
  let converged = false;

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration += 1) {
    iterations = iteration;
    const costs = costMap(graph, flows);
    const auxiliary = allOrNothing(graph, ods, costs);
    if (!auxiliary.feasible) break;
    let currentTotal = 0;
    graph.edges.forEach((_edge, id) => {
      currentTotal += (flows.get(id) ?? 0) * (costs.get(id) ?? 0);
    });
    relativeGap = Math.max(0, (currentTotal - auxiliary.shortestCostTotal) / Math.max(currentTotal, 1));
    if (relativeGap <= RELATIVE_GAP_TOLERANCE) {
      converged = true;
      break;
    }
    const lambda = lineSearch(graph, flows, auxiliary.flows);
    graph.edges.forEach((_edge, id) => {
      const current = flows.get(id) ?? 0;
      flows.set(id, Math.max(0, current + lambda * ((auxiliary.flows.get(id) ?? 0) - current)));
    });
  }

  const costs = costMap(graph, flows);
  let systemMinutes = 0;
  let weightedVc = 0;
  let weightedFlow = 0;
  const bottlenecks: Array<{ edgeId: string; utilization: number }> = [];
  graph.edges.forEach((edge, id) => {
    const flow = flows.get(id) ?? 0;
    const utilization = flow / Math.max(edge.capacityVehPerHour, 1);
    systemMinutes += flow * (costs.get(id) ?? edge.freeFlowMinutes);
    weightedVc += flow * utilization;
    weightedFlow += flow;
    if (flow > 0) bottlenecks.push({ edgeId: id, utilization });
  });
  const freeAssignment = allOrNothing(graph, ods, freeCosts);
  const freeFlowAverage = freeAssignment.shortestCostTotal / totalDemand;
  const averageTravel = systemMinutes / totalDemand;

  return {
    metrics: {
      feasible: true,
      converged,
      averageTravelTimeMinutes: round(averageTravel),
      freeFlowTravelTimeMinutes: round(freeFlowAverage),
      averageDelayMinutes: round(Math.max(0, averageTravel - freeFlowAverage)),
      totalSystemTravelTimeHours: round(systemMinutes / 60),
      averageVolumeCapacityRatio: round(weightedVc / Math.max(weightedFlow, 1), 3),
      iterations,
      relativeGap: round(relativeGap, 6)
    },
    flows,
    costs,
    bottlenecks: bottlenecks.sort((a, b) => b.utilization - a.utilization).slice(0, 12)
  };
}

function routeEndpoints(routes: RoutePayload[]): { origin: string; destination: string } {
  const first = routes[0].geometry[0];
  const last = routes[0].geometry[routes[0].geometry.length - 1];
  return {
    origin: nodeId({ lat: first[0], lon: first[1] }),
    destination: nodeId({ lat: last[0], lon: last[1] })
  };
}

function inverseBprDemand(route: RoutePayload, capacity: number, liveRoute?: LiveTrafficAnalysis["routes"][number]): number {
  if (liveRoute && liveRoute.noTrafficTravelTimeMinutes > 0) {
    const ratio = Math.max(1, liveRoute.travelTimeMinutes / liveRoute.noTrafficTravelTimeMinutes);
    const volumeCapacity = ((Math.max(0, ratio - 1) / BPR_ALPHA) ** (1 / BPR_BETA));
    return clamp(volumeCapacity * capacity, 250, 5000);
  }
  const speed = route.distanceKm / Math.max(route.durationMin / 60, 0.02);
  return clamp(700 + route.distanceKm * 28 + Math.max(0, 45 - speed) * 22, 400, 2800);
}

function resolveDemand(
  input: DemandInput | undefined,
  forwardRoutes: RoutePayload[],
  reverseRoutes: RoutePayload[],
  liveTraffic?: LiveTrafficAnalysis
): { forward: number; reverse: number; source: "manual" | "estimated" } {
  const manual = input?.forwardVehPerHour !== undefined || input?.reverseVehPerHour !== undefined;
  const forward = input?.forwardVehPerHour ?? inverseBprDemand(forwardRoutes[0], 1550, liveTraffic?.routes[0]);
  const reverse = reverseRoutes.length
    ? input?.reverseVehPerHour ?? inverseBprDemand(reverseRoutes[0], 1450, undefined)
    : 0;
  return {
    forward: round(clamp(forward, 0, 12_000)),
    reverse: round(clamp(reverse, 0, 12_000)),
    source: manual ? "manual" : "estimated"
  };
}

function nearestNodeId(graph: TrafficGraph, coord: Coordinates): string | undefined {
  let nearest: string | undefined;
  let distance = Number.POSITIVE_INFINITY;
  graph.nodes.forEach((node) => {
    const candidate = haversineKm(node.coord, coord);
    if (candidate < distance) {
      distance = candidate;
      nearest = node.id;
    }
  });
  return nearest;
}

function websterDelayMinutes(cycleSeconds: number, greenRatio: number, saturation: number): number {
  const denominator = Math.max(0.08, 1 - Math.min(1, saturation) * greenRatio);
  return (0.5 * cycleSeconds * (1 - greenRatio) ** 2) / denominator / 60;
}

function scenarioTitle(input: AdvancedScenarioInput, language: Language): string {
  if (input.name) return input.name;
  const tr = language === "tr";
  if (input.type === "newRoad") return tr ? "Önerilen Yeni Yol" : "Proposed New Road";
  if (input.type === "closure") return tr ? "Bağlantı Kapatma" : "Link Closure";
  if (input.type === "signal") return tr ? "Akıllı Sinyal" : "Adaptive Signal";
  return tr ? "Acil Araç Önceliği" : "Emergency Priority";
}

function prepareScenario(
  input: AdvancedScenarioInput,
  index: number,
  graph: TrafficGraph,
  baseline: SolveResult,
  ods: OdDemand[],
  language: Language
): PreparedScenario {
  const key = input.id ?? `${input.type}-${index + 1}`;
  const title = scenarioTitle(input, language);
  const tr = language === "tr";

  if (input.type === "newRoad") {
    const first = input.geometry[0];
    const last = input.geometry[input.geometry.length - 1];
    const from = first ? nearestNodeId(graph, { lat: first[0], lon: first[1] }) : undefined;
    const to = last ? nearestNodeId(graph, { lat: last[0], lon: last[1] }) : undefined;
    const lengthKm = Math.max(geometryLength(input.geometry), 0.08);
    const laneCapacity = capacityFromSpeed(input.speedLimitKmh);
    const capacity = input.capacityVehPerHour ?? laneCapacity * input.laneCount;
    const automaticCandidate = input.id?.startsWith("auto-road-") ?? false;
    return {
      input,
      key,
      title,
      category: "network",
      affectedGeometry: input.geometry,
      note: automaticCandidate
        ? tr
          ? "Otomatik koridor adayıyla modellendi; mühendislik uygulanabilirliği ayrıca doğrulanmalıdır."
          : "Modelled with an automatic corridor candidate; engineering feasibility requires separate validation."
        : tr
          ? "Yol, kullanıcı geometrisi ve girilen mühendislik özellikleriyle modellendi."
          : "The road uses the user geometry and supplied engineering attributes.",
      apply(next) {
        if (!from || !to || from === to) return;
        const baseEdge = {
          from,
          to,
          lengthKm,
          freeFlowMinutes: (lengthKm / input.speedLimitKmh) * 60,
          capacityVehPerHour: capacity,
          signalDelayMinutes: 0.03,
          geometry: input.geometry,
          synthetic: true,
          capacitySource: "user" as const
        };
        addEdge(next, baseEdge, `${key}:forward`);
        if (input.direction === "two-way") {
          addEdge(next, {
            ...baseEdge,
            from: to,
            to: from,
            geometry: [...input.geometry].reverse()
          }, `${key}:reverse`);
        }
      }
    };
  }

  if (input.type === "closure") {
    let edgeId = input.edgeId && graph.edges.has(input.edgeId) ? input.edgeId : undefined;
    if (!edgeId) {
      let bestTime = baseline.metrics.averageTravelTimeMinutes;
      for (const candidate of baseline.bottlenecks.slice(0, 8)) {
        const testGraph = cloneGraph(graph);
        removeEdge(testGraph, candidate.edgeId);
        const test = solveUserEquilibrium(testGraph, ods);
        if (test.metrics.feasible && test.metrics.converged && test.metrics.averageTravelTimeMinutes < bestTime) {
          edgeId = candidate.edgeId;
          bestTime = test.metrics.averageTravelTimeMinutes;
        }
      }
    }
    const affectedGeometry = edgeId ? graph.edges.get(edgeId)?.geometry : undefined;
    return {
      input,
      key,
      title,
      category: "network",
      affectedGeometry,
      affectedEdgeId: edgeId,
      note: edgeId
        ? tr
          ? "Seçilen darboğaz kaldırıldı ve ağ bağlantısı yeniden kontrol edildi."
          : "The selected bottleneck was removed and network feasibility was checked again."
        : tr
          ? "Güvenli ve iyileştirici bir kapatma adayı bulunamadı."
          : "No safe closure candidate improved the corridor.",
      apply(next) {
        if (edgeId) removeEdge(next, edgeId);
      }
    };
  }

  if (input.type === "signal") {
    const candidateEdge = baseline.bottlenecks
      .map((item) => graph.edges.get(item.edgeId))
      .find((edge) => edge && !ods.some((od) => od.origin === edge.to || od.destination === edge.to));
    const selectedNode = input.nodeId && graph.nodes.has(input.nodeId)
      ? input.nodeId
      : candidateEdge?.to;
    const cycle = input.cycleSeconds ?? 90;
    const green = input.greenRatio ?? 0.48;
    return {
      input,
      key,
      title,
      category: "network",
      affectedGeometry: selectedNode
        ? [[graph.nodes.get(selectedNode)!.coord.lat, graph.nodes.get(selectedNode)!.coord.lon]]
        : undefined,
      note: tr
        ? "Sinyal gecikmesi Webster modeli ve yaklaşım doygunluğu ile yeniden hesaplandı."
        : "Signal delay was recalculated with the Webster model and approach saturation.",
      apply(next, sampleBaseline) {
        if (!selectedNode) return;
        next.edges.forEach((edge) => {
          if (edge.to !== selectedNode) return;
          const flow = sampleBaseline.flows.get(edge.id) ?? 0;
          const saturation = flow / Math.max(edge.capacityVehPerHour, 1);
          edge.signalDelayMinutes = Math.min(
            edge.signalDelayMinutes,
            websterDelayMinutes(cycle, green, saturation)
          );
        });
      }
    };
  }

  return {
    input,
    key,
    title,
    category: "emergency",
    note: tr
      ? "Acil koridorda sinyal gecikmesi azaltıldı; bu sonuç genel ağ önerisine katılmaz."
      : "Signal delay was reduced on the emergency corridor; this is excluded from network recommendations.",
    apply(next, sampleBaseline) {
      const primaryOd = ods[0];
      if (!primaryOd) return;
      const path = shortestPath(next, primaryOd.origin, primaryOd.destination, sampleBaseline.costs);
      path?.edges.forEach((edgeId) => {
        const edge = next.edges.get(edgeId);
        if (!edge) return;
        edge.signalDelayMinutes *= 0.28;
        edge.capacityVehPerHour *= 1.05;
      });
    }
  };
}

function resultForScenario(
  prepared: PreparedScenario,
  solved: SolveResult,
  baseline: SolveResult
): AdvancedScenarioResult {
  const deltaMinutes = solved.metrics.averageTravelTimeMinutes - baseline.metrics.averageTravelTimeMinutes;
  const deltaPercent = (deltaMinutes / Math.max(baseline.metrics.averageTravelTimeMinutes, 0.01)) * 100;
  return {
    key: prepared.key,
    type: prepared.input.type,
    title: prepared.title,
    category: prepared.category,
    metrics: solved.metrics,
    deltaMinutes: round(deltaMinutes),
    deltaPercent: round(deltaPercent),
    affectedGeometry: prepared.affectedGeometry,
    affectedEdgeId: prepared.affectedEdgeId,
    note: prepared.note
  };
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function perturbedGraph(graph: TrafficGraph, random: () => number, confidence = 0.55): TrafficGraph {
  const next = cloneGraph(graph);
  const spread = 0.1 + (1 - confidence) * 0.08;
  next.edges.forEach((edge) => {
    const factor = 1 + (random() * 2 - 1) * spread;
    edge.capacityVehPerHour = Math.max(1, edge.capacityVehPerHour * factor);
  });
  return next;
}

function percentile(sorted: number[], probability: number): number {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function uncertaintyFor(values: number[]): UncertaintySummary {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p10DeltaPercent: round(percentile(sorted, 0.1)),
    medianDeltaPercent: round(percentile(sorted, 0.5)),
    p90DeltaPercent: round(percentile(sorted, 0.9)),
    probabilityOfWorsening: round(values.filter((value) => value > 0).length / Math.max(values.length, 1), 3),
    samples: values.length
  };
}

export function classifyDecision(
  language: Language,
  baseline: SolveResult,
  results: AdvancedScenarioResult[]
): BraessDecision {
  const tr = language === "tr";
  const networkCandidates = results.filter(
    (result) => result.category === "network" && result.metrics.feasible && result.metrics.converged
  );
  const recommended = [
    {
      key: "baseline",
      metrics: baseline.metrics
    },
    ...networkCandidates
  ].sort((a, b) => a.metrics.averageTravelTimeMinutes - b.metrics.averageTravelTimeMinutes)[0];
  const roadResults = networkCandidates.filter((result) => result.type === "newRoad");
  const focus = [...roadResults].sort(
    (a, b) => (b.uncertainty?.medianDeltaPercent ?? b.deltaPercent) - (a.uncertainty?.medianDeltaPercent ?? a.deltaPercent)
  )[0];

  if (!baseline.metrics.feasible || !baseline.metrics.converged) {
    return {
      status: "inconclusive",
      headline: tr ? "Model henüz güvenilir bir dengeye ulaşmadı" : "The model did not reach a reliable equilibrium",
      summary: tr ? "Ağ veya talep girdilerini kontrol edip analizi yeniden çalıştırın." : "Review the network or demand inputs and run the analysis again.",
      deltaPercent: 0,
      probabilityOfWorsening: 0,
      recommendedScenarioKey: "baseline"
    };
  }

  if (!focus) {
    return {
      status: "not-detected",
      headline: tr ? "Koridor senaryoları karşılaştırıldı" : "Corridor scenarios compared",
      summary: tr ? "En düşük denge süresine sahip ağ seçeneği öne çıkarıldı." : "The network option with the lowest equilibrium time is highlighted.",
      deltaPercent: 0,
      probabilityOfWorsening: 0,
      recommendedScenarioKey: recommended.key
    };
  }

  const uncertainty = focus.uncertainty!;
  const median = uncertainty.medianDeltaPercent;
  const probability = uncertainty.probabilityOfWorsening;
  let status: BraessDecision["status"] = "not-detected";
  if (median >= 2 && probability >= 0.8) status = "detected";
  else if (
    probability >= 0.55 ||
    (uncertainty.p10DeltaPercent < 0 && uncertainty.p90DeltaPercent > 0)
  ) status = "possible";

  const headline = status === "detected"
    ? tr ? `Yeni yol denge süresini %${Math.abs(median).toFixed(1)} artırıyor` : `The new road increases equilibrium time by ${Math.abs(median).toFixed(1)}%`
    : status === "possible"
      ? tr ? "Yeni yol için Braess riski belirsiz" : "Braess risk is uncertain for the new road"
      : tr ? "Yeni yol için Braess etkisi tespit edilmedi" : "No Braess effect was detected for the new road";
  const summary = tr
    ? `100 duyarlılık çalışmasının %${Math.round(probability * 100)}’inde yolculuk süresi arttı.`
    : `Travel time increased in ${Math.round(probability * 100)}% of 100 sensitivity runs.`;

  return {
    status,
    headline,
    summary,
    deltaPercent: median,
    probabilityOfWorsening: probability,
    recommendedScenarioKey: recommended.key
  };
}

function buildDataQuality(
  language: Language,
  source: "manual" | "estimated",
  baseline: SolveResult,
  liveTraffic?: LiveTrafficAnalysis
): DataQuality {
  const tr = language === "tr";
  let score = liveTraffic?.dataQuality.score ?? 42;
  if (source === "manual") score += 16;
  if (!baseline.metrics.converged) score -= 24;
  score = Math.round(clamp(score, 0, 100));
  return {
    score,
    grade: score >= 78 ? "high" : score >= 52 ? "medium" : "low",
    coveragePercent: liveTraffic?.dataQuality.coveragePercent ?? 0,
    averageConfidence: liveTraffic?.dataQuality.averageConfidence,
    demandSource: source,
    stale: liveTraffic?.stale ?? false,
    notes: [
      ...(liveTraffic?.dataQuality.notes ?? [
        tr ? "OSRM koridor geometrisi ve model varsayımları kullanıldı." : "OSRM corridor geometry and model assumptions were used."
      ]),
      source === "manual"
        ? tr ? "Talep kullanıcı tarafından sağlandı." : "Demand was supplied by the user."
        : tr ? "Talep ters BPR yaklaşımıyla tahmin edildi." : "Demand was estimated with an inverse BPR approach."
    ]
  };
}

export function runAdvancedSimulation(
  input: AdvancedSimulationRequest,
  liveTraffic?: LiveTrafficAnalysis
): AdvancedSimulationResponse {
  const language = input.language ?? "en";
  const liveForwardRoutes: RoutePayload[] | undefined = liveTraffic?.routes.map((route) => ({
    distanceKm: route.distanceKm,
    durationMin: route.noTrafficTravelTimeMinutes,
    geometry: route.geometry
  }));
  const forwardRoutes = normalizeRoutes(
    liveForwardRoutes ?? input.routeMeta?.routes,
    input.start,
    input.end
  );
  const reverseRoutes = input.routeMeta?.reverseRoutes?.filter((route) => route.geometry.length >= 2) ?? [];
  const graph = createGraph();
  addRoutesToGraph(graph, forwardRoutes);
  addRoutesToGraph(graph, reverseRoutes);
  applyLiveCalibration(graph, liveTraffic);

  const demand = resolveDemand(input.demand, forwardRoutes, reverseRoutes, liveTraffic);
  const forwardEndpoints = routeEndpoints(forwardRoutes);
  const ods: OdDemand[] = [{
    ...forwardEndpoints,
    demandVehPerHour: demand.forward
  }];
  if (reverseRoutes.length && demand.reverse > 0) {
    ods.push({
      ...routeEndpoints(reverseRoutes),
      demandVehPerHour: demand.reverse
    });
  }

  const baseline = solveUserEquilibrium(graph, ods);
  const prepared = input.scenarios.map((scenario, index) =>
    prepareScenario(scenario, index, graph, baseline, ods, language)
  );
  const scenarioResults = prepared.map((scenario) => {
    const scenarioGraph = cloneGraph(graph);
    scenario.apply(scenarioGraph, baseline);
    return resultForScenario(scenario, solveUserEquilibrium(scenarioGraph, ods), baseline);
  });

  const deltas = new Map(prepared.map((scenario) => [scenario.key, [] as number[]]));
  const random = seededRandom(0x0b7ae55);
  const liveConfidence = liveTraffic?.dataQuality.averageConfidence ?? 0.55;
  for (let sample = 0; sample < UNCERTAINTY_SAMPLES; sample += 1) {
    const sampleGraph = perturbedGraph(graph, random, liveConfidence);
    const demandFactor = 0.85 + random() * 0.3;
    const sampleOds = ods.map((od) => ({ ...od, demandVehPerHour: od.demandVehPerHour * demandFactor }));
    const sampleBaseline = solveUserEquilibrium(sampleGraph, sampleOds);
    if (!sampleBaseline.metrics.feasible) continue;
    prepared.forEach((scenario) => {
      const scenarioGraph = cloneGraph(sampleGraph);
      scenario.apply(scenarioGraph, sampleBaseline);
      const solved = solveUserEquilibrium(scenarioGraph, sampleOds);
      if (!solved.metrics.feasible) return;
      const deltaPercent =
        ((solved.metrics.averageTravelTimeMinutes - sampleBaseline.metrics.averageTravelTimeMinutes) /
          Math.max(sampleBaseline.metrics.averageTravelTimeMinutes, 0.01)) * 100;
      deltas.get(scenario.key)!.push(deltaPercent);
    });
  }
  scenarioResults.forEach((result) => {
    result.uncertainty = uncertaintyFor(deltas.get(result.key) ?? []);
  });

  const baselineResult: AdvancedScenarioResult = {
    key: "baseline",
    type: "baseline",
    title: language === "tr" ? "Mevcut Koridor" : "Current Corridor",
    category: "network",
    metrics: baseline.metrics,
    deltaMinutes: 0,
    deltaPercent: 0,
    note: language === "tr"
      ? "Mevcut yönlü ağ kullanıcı dengesi altında çözüldü."
      : "The current directed network was solved at user equilibrium."
  };
  const dataQuality = buildDataQuality(language, demand.source, baseline, liveTraffic);

  return {
    decision: classifyDecision(language, baseline, scenarioResults),
    baseline: baselineResult,
    scenarios: scenarioResults,
    dataQuality,
    provenance: [
      liveTraffic
        ? { source: "TomTom", label: "Live traffic, route and incident snapshot", observedAt: liveTraffic.snapshotAt }
        : { source: "OSRM", label: "Route geometry and alternatives" },
      { source: "Model", label: "BPR cost + Frank-Wolfe user equilibrium + 100-run sensitivity" },
      ...(demand.source === "manual" ? [{ source: "User" as const, label: "Directional demand input" }] : [])
    ],
    diagnostics: {
      model: "Directed corridor graph · BPR α=0.15 β=4 · Frank-Wolfe relative gap ≤ 1e-4",
      nodeCount: graph.nodes.size,
      edgeCount: graph.edges.size,
      forwardDemandVehPerHour: demand.forward,
      reverseDemandVehPerHour: demand.reverse,
      assumptions: [
        language === "tr"
          ? "Kapasite, yol sınıfı veya serbest-akış hızından tahmin edilir."
          : "Capacity is estimated from functional road class or free-flow speed.",
        language === "tr"
          ? "Sonuçlar seçilen güzergâh koridorunu temsil eder; şehir ölçeği değildir."
          : "Results represent the selected corridor, not a city-wide network."
      ],
      edgeFlows: baseline.bottlenecks.map(({ edgeId, utilization }) => {
        const edge = graph.edges.get(edgeId)!;
        return {
          edgeId,
          flowVehPerHour: round(baseline.flows.get(edgeId) ?? 0),
          capacityVehPerHour: round(edge.capacityVehPerHour),
          travelTimeMinutes: round(baseline.costs.get(edgeId) ?? edge.freeFlowMinutes),
          volumeCapacityRatio: round(utilization, 3),
          capacitySource: edge.capacitySource,
          geometry: edge.geometry
        };
      })
    },
    liveTraffic
  };
}
