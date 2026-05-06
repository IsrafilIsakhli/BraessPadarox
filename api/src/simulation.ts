import type {
  Coordinates,
  DirectionalitySummary,
  NewRoadTest,
  RoutePayload,
  ScenarioKey,
  ScenarioResult,
  SimulationRequest,
  SimulationResponse,
  StatusLevel,
  TrafficSignalPlacement
} from "./types.js";

type NodeRecord = {
  id: string;
  coord: Coordinates;
};

type EdgeRecord = {
  id: string;
  from: string;
  to: string;
  lengthKm: number;
  freeFlowMinutes: number;
  capacityVehPerHour: number;
  signalDelayMinutes: number;
  synthetic?: boolean;
};

type TrafficGraph = {
  nodes: Map<string, NodeRecord>;
  edges: Map<string, EdgeRecord>;
  outgoing: Map<string, string[]>;
};

type OdDemand = {
  origin: string;
  destination: string;
  demandVehPerHour: number;
};

type AssignmentResult = {
  totalMinutes: number;
  delayMinutes: number;
  congestionPercent: number;
  flows: Map<string, number>;
  costs: Map<string, number>;
  bottlenecks: Array<{ edgeId: string; utilization: number }>;
  feasible: boolean;
};

const BPR_ALPHA = 0.15;
const BPR_BETA = 4;
const ASSIGNMENT_ITERATIONS = 48;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function coordId(coord: Coordinates): string {
  return `${coord.lat.toFixed(5)},${coord.lon.toFixed(5)}`;
}

function edgeId(from: string, to: string): string {
  return `${from}->${to}`;
}

function haversineKm(a: Coordinates, b: Coordinates): number {
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(s));
}

function toStatus(congestion: number): StatusLevel {
  if (congestion < 45) return "Dusuk";
  if (congestion < 72) return "Orta";
  return "Yuksek";
}

function createGraph(): TrafficGraph {
  return {
    nodes: new Map(),
    edges: new Map(),
    outgoing: new Map()
  };
}

function cloneGraph(graph: TrafficGraph): TrafficGraph {
  const next = createGraph();
  graph.nodes.forEach((node) => next.nodes.set(node.id, { ...node }));
  graph.edges.forEach((edge) => {
    next.edges.set(edge.id, { ...edge });
    const outgoing = next.outgoing.get(edge.from) ?? [];
    outgoing.push(edge.id);
    next.outgoing.set(edge.from, outgoing);
  });
  return next;
}

function addNode(graph: TrafficGraph, coord: Coordinates): string {
  const id = coordId(coord);
  if (!graph.nodes.has(id)) {
    graph.nodes.set(id, { id, coord });
  }
  return id;
}

function addEdge(graph: TrafficGraph, edge: Omit<EdgeRecord, "id">): string {
  if (edge.lengthKm < 0.003) return edgeId(edge.from, edge.to);

  const id = edgeId(edge.from, edge.to);
  const existing = graph.edges.get(id);
  if (existing) {
    existing.lengthKm = Math.min(existing.lengthKm, edge.lengthKm);
    existing.freeFlowMinutes = Math.min(existing.freeFlowMinutes, edge.freeFlowMinutes);
    existing.capacityVehPerHour = Math.max(
      existing.capacityVehPerHour,
      edge.capacityVehPerHour
    );
    existing.signalDelayMinutes = Math.min(
      existing.signalDelayMinutes,
      edge.signalDelayMinutes
    );
    existing.synthetic = existing.synthetic || edge.synthetic;
    return id;
  }

  graph.edges.set(id, { ...edge, id });
  const outgoing = graph.outgoing.get(edge.from) ?? [];
  outgoing.push(id);
  graph.outgoing.set(edge.from, outgoing);
  return id;
}

function removeEdge(graph: TrafficGraph, id: string): void {
  const edge = graph.edges.get(id);
  if (!edge) return;
  graph.edges.delete(id);
  graph.outgoing.set(
    edge.from,
    (graph.outgoing.get(edge.from) ?? []).filter((candidate) => candidate !== id)
  );
}

function estimateCapacity(speedKmh: number, index: number): number {
  const roadClassCapacity =
    speedKmh > 65 ? 1900 : speedKmh > 45 ? 1450 : speedKmh > 28 ? 1050 : 760;
  return roadClassCapacity * (index === 0 ? 1.08 : 0.94);
}

function estimateSignalDelay(speedKmh: number): number {
  if (speedKmh < 24) return 0.18;
  if (speedKmh < 38) return 0.11;
  return 0.05;
}

function normalizeRoutes(
  routes: RoutePayload[] | undefined,
  fallbackStart: Coordinates,
  fallbackEnd: Coordinates,
  fallbackDistanceKm: number,
  fallbackDurationMin: number
): RoutePayload[] {
  const validRoutes = (routes ?? []).filter((route) => route.geometry.length >= 2);
  if (validRoutes.length > 0) return validRoutes;
  return [
    {
      distanceKm: fallbackDistanceKm,
      durationMin: fallbackDurationMin,
      geometry: [
        [fallbackStart.lat, fallbackStart.lon],
        [fallbackEnd.lat, fallbackEnd.lon]
      ]
    }
  ];
}

function buildRouteEdges(graph: TrafficGraph, routes: RoutePayload[], group: string): void {
  routes.forEach((route, routeIndex) => {
    const routeSegments =
      route.segments && route.segments.length > 0
        ? route.segments
        : [
            {
              distanceKm: route.distanceKm,
              durationMin: route.durationMin,
              geometry: route.geometry
            }
          ];

    routeSegments.forEach((segment) => {
      const geometry = segment.geometry.map(([lat, lon]) => ({ lat, lon }));
      const lengthKm = Math.max(
        segment.distanceKm,
        geometry.reduce((sum, point, index) => {
          if (index === 0) return sum;
          return sum + haversineKm(geometry[index - 1], point);
        }, 0.001)
      );
      const speedKmh = clamp(
        segment.distanceKm / Math.max(segment.durationMin / 60, 0.01),
        8,
        90
      );
      const capacity = estimateCapacity(speedKmh, routeIndex);
      const signalDelay = estimateSignalDelay(speedKmh);

      for (let i = 0; i < geometry.length - 1; i += 1) {
        const from = addNode(graph, geometry[i]);
        const to = addNode(graph, geometry[i + 1]);
        const segmentKm = Math.max(haversineKm(geometry[i], geometry[i + 1]), 0.003);
        const freeFlowMinutes = Math.max(
          0.015,
          segment.durationMin * (segmentKm / lengthKm)
        );

        addEdge(graph, {
          from,
          to,
          lengthKm: segmentKm,
          freeFlowMinutes,
          capacityVehPerHour: capacity,
          signalDelayMinutes: signalDelay,
          synthetic: group === "synthetic"
        });
      }
    });
  });
}

function estimateDemand(input: SimulationRequest): number {
  const distanceKm = clamp(input.routeMeta.distanceKm, 0.4, 80);
  const speedKmh =
    input.routeMeta.distanceKm / Math.max(input.routeMeta.durationMin / 60, 0.02);
  const congestionPressure = clamp((52 - speedKmh) / 52, 0, 0.9);
  return round2(clamp(780 + distanceKm * 38 + congestionPressure * 1150, 650, 2800));
}

function bprCost(edge: EdgeRecord, flow: number): number {
  const utilization = Math.max(flow / edge.capacityVehPerHour, 0);
  return (
    edge.freeFlowMinutes * (1 + BPR_ALPHA * utilization ** BPR_BETA) +
    edge.signalDelayMinutes
  );
}

function makeCostMap(graph: TrafficGraph, flows: Map<string, number>): Map<string, number> {
  const costs = new Map<string, number>();
  graph.edges.forEach((edge, id) => {
    costs.set(id, bprCost(edge, flows.get(id) ?? 0));
  });
  return costs;
}

function shortestPath(
  graph: TrafficGraph,
  origin: string,
  destination: string,
  costs: Map<string, number>
): { cost: number; edges: string[] } | null {
  const distances = new Map<string, number>();
  const previousEdge = new Map<string, string>();
  const unvisited = new Set<string>();

  graph.nodes.forEach((_node, id) => {
    distances.set(id, Number.POSITIVE_INFINITY);
    unvisited.add(id);
  });
  distances.set(origin, 0);

  while (unvisited.size > 0) {
    let current: string | null = null;
    let currentCost = Number.POSITIVE_INFINITY;
    unvisited.forEach((nodeId) => {
      const distance = distances.get(nodeId) ?? Number.POSITIVE_INFINITY;
      if (distance < currentCost) {
        current = nodeId;
        currentCost = distance;
      }
    });

    if (!current || currentCost === Number.POSITIVE_INFINITY) break;
    if (current === destination) break;
    unvisited.delete(current);

    for (const id of graph.outgoing.get(current) ?? []) {
      const edge = graph.edges.get(id);
      if (!edge) continue;
      const nextCost = currentCost + (costs.get(id) ?? edge.freeFlowMinutes);
      if (nextCost < (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.to, nextCost);
        previousEdge.set(edge.to, id);
      }
    }
  }

  const totalCost = distances.get(destination) ?? Number.POSITIVE_INFINITY;
  if (totalCost === Number.POSITIVE_INFINITY) return null;

  const pathEdges: string[] = [];
  let cursor = destination;
  while (cursor !== origin) {
    const id = previousEdge.get(cursor);
    if (!id) return null;
    pathEdges.unshift(id);
    cursor = graph.edges.get(id)!.from;
  }

  return { cost: totalCost, edges: pathEdges };
}

function assignTraffic(graph: TrafficGraph, ods: OdDemand[]): AssignmentResult {
  const flows = new Map<string, number>();
  graph.edges.forEach((_edge, id) => flows.set(id, 0));

  const activeOds = ods.filter((od) => graph.nodes.has(od.origin) && graph.nodes.has(od.destination));
  if (activeOds.length === 0) {
    return {
      totalMinutes: Number.POSITIVE_INFINITY,
      delayMinutes: Number.POSITIVE_INFINITY,
      congestionPercent: 100,
      flows,
      costs: new Map(),
      bottlenecks: [],
      feasible: false
    };
  }

  for (let iteration = 1; iteration <= ASSIGNMENT_ITERATIONS; iteration += 1) {
    const costs = makeCostMap(graph, flows);
    const auxiliary = new Map<string, number>();
    graph.edges.forEach((_edge, id) => auxiliary.set(id, 0));

    for (const od of activeOds) {
      const path = shortestPath(graph, od.origin, od.destination, costs);
      if (!path) {
        return {
          totalMinutes: Number.POSITIVE_INFINITY,
          delayMinutes: Number.POSITIVE_INFINITY,
          congestionPercent: 100,
          flows,
          costs,
          bottlenecks: [],
          feasible: false
        };
      }

      for (const id of path.edges) {
        auxiliary.set(id, (auxiliary.get(id) ?? 0) + od.demandVehPerHour);
      }
    }

    const step = 1 / iteration;
    graph.edges.forEach((_edge, id) => {
      const current = flows.get(id) ?? 0;
      const target = auxiliary.get(id) ?? 0;
      flows.set(id, current + step * (target - current));
    });
  }

  const costs = makeCostMap(graph, flows);
  const totalDemand = activeOds.reduce((sum, od) => sum + od.demandVehPerHour, 0);
  let vehicleMinutes = 0;
  let freeFlowVehicleMinutes = 0;
  let utilizationWeighted = 0;
  let weightedFlow = 0;
  const bottlenecks: AssignmentResult["bottlenecks"] = [];

  graph.edges.forEach((edge, id) => {
    const flow = flows.get(id) ?? 0;
    const cost = costs.get(id) ?? edge.freeFlowMinutes;
    const utilization = flow / edge.capacityVehPerHour;
    vehicleMinutes += flow * cost;
    utilizationWeighted += flow * utilization;
    weightedFlow += flow;
    if (flow > 0) {
      bottlenecks.push({ edgeId: id, utilization });
    }
  });

  const freeCosts = new Map<string, number>();
  graph.edges.forEach((edge, id) => {
    freeCosts.set(id, edge.freeFlowMinutes + edge.signalDelayMinutes);
  });

  for (const od of activeOds) {
    const path = shortestPath(graph, od.origin, od.destination, freeCosts);
    if (path) {
      freeFlowVehicleMinutes += path.cost * od.demandVehPerHour;
    }
  }

  const totalMinutes = vehicleMinutes / totalDemand;
  const freeFlowMinutes = freeFlowVehicleMinutes / totalDemand;
  const congestionPercent = clamp((utilizationWeighted / Math.max(weightedFlow, 1)) * 100, 5, 100);

  return {
    totalMinutes: round2(totalMinutes),
    delayMinutes: round2(Math.max(0, totalMinutes - freeFlowMinutes)),
    congestionPercent: round2(congestionPercent),
    flows,
    costs,
    bottlenecks: bottlenecks.sort((a, b) => b.utilization - a.utilization).slice(0, 12),
    feasible: true
  };
}

function resultFromAssignment(
  key: ScenarioKey,
  title: string,
  assignment: AssignmentResult,
  baselineTotal: number,
  note: string,
  intervention?: string,
  directionMode: ScenarioResult["directionMode"] = "mevcut"
): ScenarioResult {
  return {
    key,
    title,
    totalMinutes: round2(assignment.totalMinutes),
    delayMinutes: round2(assignment.delayMinutes),
    congestionPercent: round2(assignment.congestionPercent),
    deltaMinutes: round2(assignment.totalMinutes - baselineTotal),
    status: toStatus(assignment.congestionPercent),
    note,
    intervention,
    directionMode
  };
}

function routePointByFraction(route: RoutePayload, fraction: number): Coordinates {
  const points = route.geometry.map(([lat, lon]) => ({ lat, lon }));
  const total = Math.max(
    points.reduce((sum, point, index) => {
      if (index === 0) return sum;
      return sum + haversineKm(points[index - 1], point);
    }, 0),
    0.001
  );
  const target = total * fraction;
  let walked = 0;

  for (let i = 1; i < points.length; i += 1) {
    const segment = haversineKm(points[i - 1], points[i]);
    if (walked + segment >= target) return points[i];
    walked += segment;
  }

  return points[points.length - 1];
}

function chooseNewRoadCandidate(graph: TrafficGraph, routes: RoutePayload[]): {
  from: Coordinates;
  to: Coordinates;
} {
  const primary = routes[0];
  const alternative = routes[1] ?? routes[0];
  let from = routePointByFraction(primary, 0.34);
  let to = routePointByFraction(alternative, routes[1] ? 0.62 : 0.72);

  if (coordId(from) === coordId(to)) {
    from = routePointByFraction(primary, 0.25);
    to = routePointByFraction(primary, 0.75);
  }

  addNode(graph, from);
  addNode(graph, to);
  return { from, to };
}

function addCandidateRoad(
  graph: TrafficGraph,
  from: Coordinates,
  to: Coordinates,
  bidirectional: boolean
): { lengthKm: number; freeFlowMinutes: number } {
  const fromId = addNode(graph, from);
  const toId = addNode(graph, to);
  const lengthKm = Math.max(haversineKm(from, to), 0.08);
  const freeFlowMinutes = (lengthKm / 52) * 60;
  const capacityVehPerHour = clamp(360 + lengthKm * 120, 360, 720);

  addEdge(graph, {
    from: fromId,
    to: toId,
    lengthKm,
    freeFlowMinutes,
    capacityVehPerHour,
    signalDelayMinutes: 0.03,
    synthetic: true
  });

  if (bidirectional) {
    addEdge(graph, {
      from: toId,
      to: fromId,
      lengthKm,
      freeFlowMinutes,
      capacityVehPerHour: capacityVehPerHour * 0.92,
      signalDelayMinutes: 0.03,
      synthetic: true
    });
  }

  return { lengthKm, freeFlowMinutes };
}

function applySignalAtNode(graph: TrafficGraph, nodeId: string): number {
  let affected = 0;
  graph.edges.forEach((edge) => {
    if (edge.from === nodeId || edge.to === nodeId) {
      edge.capacityVehPerHour *= 1.22;
      edge.signalDelayMinutes = Math.max(0.01, edge.signalDelayMinutes - 0.08);
      affected += 1;
    }
  });
  return affected;
}

function applyEmergencyPriority(graph: TrafficGraph, baseline: AssignmentResult): void {
  for (const bottleneck of baseline.bottlenecks.slice(0, 8)) {
    const edge = graph.edges.get(bottleneck.edgeId);
    if (!edge) continue;
    edge.capacityVehPerHour *= 1.14;
    edge.signalDelayMinutes = Math.max(0, edge.signalDelayMinutes - 0.06);
  }
}

function directionality(graph: TrafficGraph): DirectionalitySummary {
  let oneWayEdges = 0;
  let twoWayEdges = 0;
  let twoWayPairs = 0;
  const countedPairs = new Set<string>();

  graph.edges.forEach((edge) => {
    const reverse = edgeId(edge.to, edge.from);
    if (graph.edges.has(reverse)) {
      twoWayEdges += 1;
      const pairKey = [edge.id, reverse].sort().join("|");
      if (!countedPairs.has(pairKey)) {
        countedPairs.add(pairKey);
        twoWayPairs += 1;
      }
    } else {
      oneWayEdges += 1;
    }
  });

  return {
    directedEdges: graph.edges.size,
    oneWayEdges,
    twoWayEdges,
    twoWayPairs
  };
}

function createOds(
  forwardRoutes: RoutePayload[],
  reverseRoutes: RoutePayload[],
  demandVehPerHour: number
): OdDemand[] {
  const ods: OdDemand[] = [];
  const forward = forwardRoutes[0];
  ods.push({
    origin: coordId({ lat: forward.geometry[0][0], lon: forward.geometry[0][1] }),
    destination: coordId({
      lat: forward.geometry[forward.geometry.length - 1][0],
      lon: forward.geometry[forward.geometry.length - 1][1]
    }),
    demandVehPerHour: reverseRoutes.length ? demandVehPerHour * 0.62 : demandVehPerHour
  });

  if (reverseRoutes.length) {
    const reverse = reverseRoutes[0];
    ods.push({
      origin: coordId({ lat: reverse.geometry[0][0], lon: reverse.geometry[0][1] }),
      destination: coordId({
        lat: reverse.geometry[reverse.geometry.length - 1][0],
        lon: reverse.geometry[reverse.geometry.length - 1][1]
      }),
      demandVehPerHour: demandVehPerHour * 0.38
    });
  }

  return ods;
}

function countSegments(routes: RoutePayload[]): number {
  return routes.reduce((sum, route) => {
    if (route.segments?.length) return sum + route.segments.length;
    return sum + Math.max(route.geometry.length - 1, 1);
  }, 0);
}

function confidencePercent(
  graph: TrafficGraph,
  forwardRoutes: RoutePayload[],
  reverseRoutes: RoutePayload[],
  baseline: AssignmentResult
): number {
  let score = 48;
  score += Math.min(countSegments(forwardRoutes) * 1.8, 22);
  score += Math.min(Math.max(forwardRoutes.length - 1, 0) * 8, 16);
  score += reverseRoutes.length > 0 ? 10 : 0;
  score += graph.edges.size > 30 ? 8 : graph.edges.size > 12 ? 4 : 0;
  score += baseline.feasible ? 6 : -20;
  return Math.round(clamp(score, 35, 94));
}

function buildEvidence(
  forwardRoutes: RoutePayload[],
  reverseRoutes: RoutePayload[],
  graph: TrafficGraph,
  directionSummary: DirectionalitySummary
): string[] {
  return [
    `${forwardRoutes.length} ileri rota ve ${reverseRoutes.length} geri yön rotası değerlendirildi.`,
    `${countSegments(forwardRoutes) + countSegments(reverseRoutes)} yol segmenti üzerinden akış ataması yapıldı.`,
    `${graph.edges.size} yönlü kenar kuruldu; ${directionSummary.oneWayEdges} kenar tek yönlü kaldı.`,
    "Yeni yol hem tek yönlü hem çift yönlü olarak ayrı ayrı test edildi.",
    "Trafik ışığı adayları en yoğun darboğaz düğümlerinden seçildi."
  ];
}

function plainLanguageSummary(
  braessDetected: boolean,
  recommended: ScenarioResult,
  signal: TrafficSignalPlacement | undefined
): string {
  if (braessDetected) {
    return `Yeni yol eklemek bu ağda trafiği rahatlatmak yerine ortalama süreyi artırıyor. En güçlü öneri: ${recommended.title}.`;
  }

  if (signal && signal.improvementMinutes > 0.1) {
    return `Bu testte Braess paradoksu görünmedi. En anlaşılır kazanım, ${signal.location.lat.toFixed(5)}, ${signal.location.lon.toFixed(5)} noktasında trafik ışığı/sinyal düzenidir.`;
  }

  return `Bu testte yeni yol mevcut dengeyi bozmadı. En iyi sonuç ${recommended.title} senaryosunda görülüyor.`;
}

function testTrafficSignals(
  baselineGraph: TrafficGraph,
  ods: OdDemand[],
  baseline: AssignmentResult
): { placements: TrafficSignalPlacement[]; best: AssignmentResult; affected: number } {
  const candidates = baseline.bottlenecks
    .map((item) => baselineGraph.edges.get(item.edgeId)?.to)
    .filter((id): id is string => Boolean(id));
  const uniqueCandidates = [...new Set(candidates)].slice(0, 6);

  const tests = uniqueCandidates.map((nodeId) => {
    const graph = cloneGraph(baselineGraph);
    const affected = applySignalAtNode(graph, nodeId);
    const result = assignTraffic(graph, ods);
    return { nodeId, affected, result };
  });

  tests.sort((a, b) => a.result.totalMinutes - b.result.totalMinutes);
  const selected = tests[0];
  const placements = tests.slice(0, 3).map((test, index) => ({
    id: test.nodeId,
    location: baselineGraph.nodes.get(test.nodeId)!.coord,
    affectedEdges: test.affected,
    totalMinutes: test.result.totalMinutes,
    improvementMinutes: round2(baseline.totalMinutes - test.result.totalMinutes),
    selected: index === 0
  }));

  return {
    placements,
    best: selected?.result ?? baseline,
    affected: selected?.affected ?? 0
  };
}

function testBestClosure(
  baselineGraph: TrafficGraph,
  ods: OdDemand[],
  baseline: AssignmentResult
): { result: AssignmentResult; closedEdge?: EdgeRecord } {
  let best = baseline;
  let closedEdge: EdgeRecord | undefined;

  for (const item of baseline.bottlenecks.slice(0, 10)) {
    const edge = baselineGraph.edges.get(item.edgeId);
    if (!edge || edge.synthetic) continue;

    const graph = cloneGraph(baselineGraph);
    removeEdge(graph, item.edgeId);
    const result = assignTraffic(graph, ods);
    if (result.feasible && result.totalMinutes < best.totalMinutes) {
      best = result;
      closedEdge = edge;
    }
  }

  return { result: best, closedEdge };
}

export function runSimulation(input: SimulationRequest): SimulationResponse {
  const forwardRoutes = normalizeRoutes(
    input.routeMeta.routes,
    input.start,
    input.end,
    input.routeMeta.distanceKm,
    input.routeMeta.durationMin
  );
  const reverseRoutes = normalizeRoutes(
    input.routeMeta.reverseRoutes,
    input.end,
    input.start,
    input.routeMeta.distanceKm,
    input.routeMeta.alternativeDurationMin ?? input.routeMeta.durationMin
  ).filter((_route, index) => Boolean(input.routeMeta.reverseRoutes?.[index]));

  const baselineGraph = createGraph();
  buildRouteEdges(baselineGraph, forwardRoutes, "forward");
  buildRouteEdges(baselineGraph, reverseRoutes, "reverse");

  const demandVehPerHour = estimateDemand(input);
  const ods = createOds(forwardRoutes, reverseRoutes, demandVehPerHour);
  const baseline = assignTraffic(baselineGraph, ods);

  const candidate = chooseNewRoadCandidate(baselineGraph, forwardRoutes);
  const oneWayGraph = cloneGraph(baselineGraph);
  const oneWayMeta = addCandidateRoad(oneWayGraph, candidate.from, candidate.to, false);
  const oneWay = assignTraffic(oneWayGraph, ods);

  const twoWayGraph = cloneGraph(baselineGraph);
  const twoWayMeta = addCandidateRoad(twoWayGraph, candidate.from, candidate.to, true);
  const twoWay = assignTraffic(twoWayGraph, ods);

  const closure = testBestClosure(baselineGraph, ods, baseline);
  const signalTest = testTrafficSignals(baselineGraph, ods, baseline);

  const emergencyGraph = cloneGraph(baselineGraph);
  applyEmergencyPriority(emergencyGraph, baseline);
  const emergency = assignTraffic(emergencyGraph, ods);

  const scenarios: ScenarioResult[] = [
    resultFromAssignment(
      "mevcut_ag",
      "Mevcut Durum (Referans)",
      baseline,
      baseline.totalMinutes,
      "OSRM rotalarından kurulan yönlü ağ üzerinde mevcut akış dengesi hesaplandı."
    ),
    resultFromAssignment(
      "yeni_yol_tek_yonlu",
      "Yeni Yol Ekle (Tek Yön)",
      oneWay,
      baseline.totalMinutes,
      oneWay.totalMinutes > baseline.totalMinutes
        ? "Yeni bağlantı tek yönde cazip hale geldi ve akışı düşük kapasiteli bağlantıya çekti."
        : "Tek yönlü bağlantı mevcut ağda toplam süreyi artırmadı.",
      `${candidate.from.lat.toFixed(5)}, ${candidate.from.lon.toFixed(5)} -> ${candidate.to.lat.toFixed(5)}, ${candidate.to.lon.toFixed(5)}`,
      "tek_yonlu"
    ),
    resultFromAssignment(
      "yeni_yol_cift_yonlu",
      "Yeni Yol Ekle (Çift Yön)",
      twoWay,
      baseline.totalMinutes,
      twoWay.totalMinutes > baseline.totalMinutes
        ? "Çift yönlü bağlantı iki yöndeki talebi de etkileyerek Braess riski oluşturdu."
        : "Çift yönlü bağlantı ağ dengesini bozmadı.",
      `${candidate.from.lat.toFixed(5)}, ${candidate.from.lon.toFixed(5)} <-> ${candidate.to.lat.toFixed(5)}, ${candidate.to.lon.toFixed(5)}`,
      "cift_yonlu"
    ),
    resultFromAssignment(
      "baglanti_yolu_kapat",
      "Darboğaz Bağlantısı Kapatıldı",
      closure.result,
      baseline.totalMinutes,
      closure.closedEdge
        ? "En yoğun düşük verimli bağlantı kapatılınca akış alternatif yollara dağıtıldı."
        : "Kapatma testi güvenli bir iyileştirme bulamadı.",
      closure.closedEdge
        ? `${baselineGraph.nodes.get(closure.closedEdge.from)?.coord.lat.toFixed(5)}, ${baselineGraph.nodes.get(closure.closedEdge.from)?.coord.lon.toFixed(5)} -> ${baselineGraph.nodes.get(closure.closedEdge.to)?.coord.lat.toFixed(5)}, ${baselineGraph.nodes.get(closure.closedEdge.to)?.coord.lon.toFixed(5)}`
        : undefined
    ),
    resultFromAssignment(
      "akilli_isiklandirma",
      "Akıllı Trafik Işığı",
      signalTest.best,
      baseline.totalMinutes,
      signalTest.placements.length
        ? "Trafik ışığı adayları darboğaz düğümlerinde test edildi; en iyi aday seçildi."
        : "Işıklandırma için yeterli darboğaz düğümü bulunamadı.",
      signalTest.placements[0]
        ? `${signalTest.placements[0].location.lat.toFixed(5)}, ${signalTest.placements[0].location.lon.toFixed(5)}`
        : undefined
    ),
    resultFromAssignment(
      "acil_arac_onceligi",
      "Acil Araç Önceliği",
      emergency,
      baseline.totalMinutes,
      "Darboğaz bağlantılarında öncelikli geçiş ve sinyal gecikmesi azaltımı test edildi."
    )
  ];

  const baselineTotal = baseline.totalMinutes;
  const braessCandidates = scenarios.filter(
    (scenario) =>
      (scenario.key === "yeni_yol_tek_yonlu" || scenario.key === "yeni_yol_cift_yonlu") &&
      scenario.totalMinutes > baselineTotal + 0.15
  );
  const worstBraess = [...braessCandidates].sort(
    (a, b) => b.totalMinutes - a.totalMinutes
  )[0];

  const recommended = [...scenarios]
    .filter((scenario) => Number.isFinite(scenario.totalMinutes))
    .sort((a, b) => a.totalMinutes - b.totalMinutes)[0];
  const safeRecommended = recommended ?? scenarios[0]!;

  const selectedMode =
    twoWay.totalMinutes <= oneWay.totalMinutes ? "cift_yonlu" : "tek_yonlu";
  const newRoad: NewRoadTest = {
    from: candidate.from,
    to: candidate.to,
    lengthKm: round2(oneWayMeta.lengthKm || twoWayMeta.lengthKm),
    freeFlowMinutes: round2(oneWayMeta.freeFlowMinutes || twoWayMeta.freeFlowMinutes),
    oneWayTotalMinutes: round2(oneWay.totalMinutes),
    twoWayTotalMinutes: round2(twoWay.totalMinutes),
    selectedMode,
    selectedScenarioKey:
      selectedMode === "cift_yonlu" ? "yeni_yol_cift_yonlu" : "yeni_yol_tek_yonlu",
    note: worstBraess
      ? "Yeni bağlantı Wardrop dengesinde toplam seyahat süresini artırdığı için Braess paradoksu tespit edildi."
      : "Yeni bağlantı testlerinde toplam seyahat süresi referans ağın üzerine çıkmadı."
  };
  const directionSummary = directionality(baselineGraph);
  const selectedSignal = signalTest.placements.find((signal) => signal.selected);

  return {
    braessDetected: braessCandidates.length > 0,
    braessCausingScenarioKey: worstBraess?.key,
    summary: {
      distanceKm: round2(input.routeMeta.distanceKm),
      baseDurationMin: round2(input.routeMeta.durationMin),
      demandVehPerHour,
      model: "Yönlü ağ + BPR maliyet fonksiyonu + Wardrop denge ataması",
      confidencePercent: confidencePercent(
        baselineGraph,
        forwardRoutes,
        reverseRoutes,
        baseline
      ),
      plainLanguage: plainLanguageSummary(
        braessCandidates.length > 0,
        safeRecommended,
        selectedSignal
      ),
      evidence: buildEvidence(
        forwardRoutes,
        reverseRoutes,
        baselineGraph,
        directionSummary
      ),
      directionality: directionSummary
    },
    scenarios,
    recommended: safeRecommended,
    interventions: {
      newRoad,
      trafficSignals: signalTest.placements
    }
  };
}
