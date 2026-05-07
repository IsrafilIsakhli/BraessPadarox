import type {
  Coordinates,
  DirectionalitySummary,
  EmergencyPriorityPlan,
  Language,
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

const apiText = {
  en: {
    model: "Directed graph + BPR cost function + Wardrop equilibrium assignment",
    evidence: {
      routes: (forward: number, reverse: number) =>
        `${forward} forward route(s) and ${reverse} reverse route(s) were evaluated.`,
      segments: (count: number) =>
        `${count} road segment(s) were used for traffic assignment.`,
      edges: (edges: number, oneWay: number) =>
        `${edges} directed edge(s) were built; ${oneWay} edge(s) remained one-way.`,
      newRoad: "The new road was tested separately as one-way and two-way.",
      signals: "Traffic signal candidates were selected from the highest bottleneck nodes."
    },
    plain: {
      braess: (title: string) =>
        `Adding the new road increases average travel time instead of reducing congestion. Strongest recommendation: ${title}.`,
      signal: (lat: string, lon: string) =>
        `No Braess paradox was detected in this test. The clearest gain is signal control at ${lat}, ${lon}.`,
      safe: (title: string) =>
        `The new road did not destabilize the current balance. The best result appears in the ${title} scenario.`
    },
    scenarios: {
      baselineTitle: "Current Network (Baseline)",
      baselineNote:
        "The current traffic balance was calculated on the directed network built from OSRM routes.",
      oneWayTitle: "Add New Road (One-Way)",
      oneWayBad:
        "The new one-way connection attracted flow into a low-capacity shortcut.",
      oneWayGood: "The one-way connection did not increase total travel time.",
      twoWayTitle: "Add New Road (Two-Way)",
      twoWayBad:
        "The two-way connection affected demand in both directions and created Braess risk.",
      twoWayGood: "The two-way connection did not disrupt the network balance.",
      closureTitle: "Bottleneck Link Closed",
      closureGood:
        "Closing the overloaded low-efficiency link redistributed flow to alternative roads.",
      closureNeutral: "The closure test did not find a safe improvement.",
      signalTitle: "Smart Traffic Signal",
      signalGood:
        "Traffic signal candidates were tested at bottleneck nodes; the best candidate was selected.",
      signalNeutral: "No strong bottleneck node was found for signal placement.",
      emergencyTitle: "Emergency Vehicle Priority",
      emergencyNote:
        "Priority passage and reduced signal delay were tested on bottleneck links."
    },
    newRoad: {
      braess:
        "Braess paradox was detected because the new connection increased total travel time at Wardrop equilibrium.",
      safe:
        "The new connection tests did not raise total travel time above the baseline network."
    },
    signals: {
      reason: (approaches: number, utilization: number) =>
        `${approaches} controlled approach(es), average critical utilization ${utilization}%.`
    },
    emergency: {
      note:
        "The priority corridor was selected from the fastest emergency path and reinforced at the most congested links along that corridor."
    }
  },
  tr: {
    model: "Yönlü ağ + BPR maliyet fonksiyonu + Wardrop denge ataması",
    evidence: {
      routes: (forward: number, reverse: number) =>
        `${forward} ileri rota ve ${reverse} geri yön rotası değerlendirildi.`,
      segments: (count: number) =>
        `${count} yol segmenti üzerinden akış ataması yapıldı.`,
      edges: (edges: number, oneWay: number) =>
        `${edges} yönlü kenar kuruldu; ${oneWay} kenar tek yönlü kaldı.`,
      newRoad: "Yeni yol hem tek yönlü hem çift yönlü olarak ayrı ayrı test edildi.",
      signals: "Trafik ışığı adayları en yoğun darboğaz düğümlerinden seçildi."
    },
    plain: {
      braess: (title: string) =>
        `Yeni yol eklemek bu ağda trafiği rahatlatmak yerine ortalama süreyi artırıyor. En güçlü öneri: ${title}.`,
      signal: (lat: string, lon: string) =>
        `Bu testte Braess paradoksu görünmedi. En anlaşılır kazanım, ${lat}, ${lon} noktasında trafik ışığı/sinyal düzenidir.`,
      safe: (title: string) =>
        `Bu testte yeni yol mevcut dengeyi bozmadı. En iyi sonuç ${title} senaryosunda görülüyor.`
    },
    scenarios: {
      baselineTitle: "Mevcut Ağ (Referans)",
      baselineNote:
        "OSRM rotalarından kurulan yönlü ağ üzerinde mevcut akış dengesi hesaplandı.",
      oneWayTitle: "Yeni Yol Ekle (Tek Yön)",
      oneWayBad:
        "Yeni bağlantı tek yönde cazip hale geldi ve akışı düşük kapasiteli bağlantıya çekti.",
      oneWayGood: "Tek yönlü bağlantı mevcut ağda toplam süreyi artırmadı.",
      twoWayTitle: "Yeni Yol Ekle (Çift Yön)",
      twoWayBad:
        "Çift yönlü bağlantı iki yöndeki talebi de etkileyerek Braess riski oluşturdu.",
      twoWayGood: "Çift yönlü bağlantı ağ dengesini bozmadı.",
      closureTitle: "Darboğaz Bağlantısı Kapatıldı",
      closureGood:
        "En yoğun düşük verimli bağlantı kapatılınca akış alternatif yollara dağıtıldı.",
      closureNeutral: "Kapatma testi güvenli bir iyileştirme bulamadı.",
      signalTitle: "Akıllı Trafik Işığı",
      signalGood:
        "Trafik ışığı adayları darboğaz düğümlerinde test edildi; en iyi aday seçildi.",
      signalNeutral: "Işıklandırma için yeterli darboğaz düğümü bulunamadı.",
      emergencyTitle: "Acil Araç Önceliği",
      emergencyNote:
        "Darboğaz bağlantılarında öncelikli geçiş ve sinyal gecikmesi azaltımı test edildi."
    },
    newRoad: {
      braess:
        "Yeni bağlantı Wardrop dengesinde toplam seyahat süresini artırdığı için Braess paradoksu tespit edildi.",
      safe:
        "Yeni bağlantı testlerinde toplam seyahat süresi referans ağın üzerine çıkmadı."
    },
    signals: {
      reason: (approaches: number, utilization: number) =>
        `${approaches} kontrollü yaklaşım, ortalama kritik kullanım %${utilization}.`
    },
    emergency: {
      note:
        "Öncelik koridoru en hızlı acil rota üzerinden seçildi ve bu koridordaki en yoğun bağlantılarda güçlendirildi."
    }
  }
} satisfies Record<Language, unknown>;

function ui(language: Language) {
  return apiText[language];
}

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
    if (walked + segment >= target) {
      const ratio = clamp((target - walked) / Math.max(segment, 0.001), 0, 1);
      return {
        lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * ratio,
        lon: points[i - 1].lon + (points[i].lon - points[i - 1].lon) * ratio
      };
    }
    walked += segment;
  }

  return points[points.length - 1];
}

function nearestGraphNode(graph: TrafficGraph, point: Coordinates): NodeRecord | null {
  let nearest: NodeRecord | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  graph.nodes.forEach((node) => {
    const distance = haversineKm(point, node.coord);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = node;
    }
  });

  return nearest;
}

function snapToGraph(graph: TrafficGraph, point: Coordinates): Coordinates {
  return nearestGraphNode(graph, point)?.coord ?? point;
}

function chooseNewRoadCandidate(graph: TrafficGraph, routes: RoutePayload[]): {
  from: Coordinates;
  to: Coordinates;
} {
  const primary = routes[0];
  const alternative = routes[1] ?? routes[0];
  const attempts: Array<[RoutePayload, number, RoutePayload, number]> = [
    [primary, 0.34, alternative, routes[1] ? 0.62 : 0.72],
    [primary, 0.25, alternative, routes[1] ? 0.75 : 0.82],
    [primary, 0.18, primary, 0.66],
    [primary, 0.42, primary, 0.86]
  ];

  let best: { from: Coordinates; to: Coordinates; score: number } | null = null;
  for (const [fromRoute, fromFraction, toRoute, toFraction] of attempts) {
    const from = snapToGraph(graph, routePointByFraction(fromRoute, fromFraction));
    const to = snapToGraph(graph, routePointByFraction(toRoute, toFraction));
    const fromId = coordId(from);
    const toId = coordId(to);
    if (fromId === toId) continue;

    const lengthKm = haversineKm(from, to);
    if (lengthKm < 0.18) continue;

    const duplicatesExisting =
      graph.edges.has(edgeId(fromId, toId)) || graph.edges.has(edgeId(toId, fromId));
    const score = lengthKm - (duplicatesExisting ? 4 : 0);
    if (!best || score > best.score) {
      best = { from, to, score };
    }
  }

  if (best) return { from: best.from, to: best.to };

  const nodes = [...graph.nodes.values()];
  if (nodes.length >= 2) {
    return {
      from: nodes[0].coord,
      to: nodes[nodes.length - 1].coord
    };
  }

  return {
    from: routePointByFraction(primary, 0.25),
    to: routePointByFraction(primary, 0.75)
  };
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

function adjacentEdgeIds(graph: TrafficGraph, nodeId: string): string[] {
  const ids: string[] = [];
  graph.edges.forEach((edge, id) => {
    if (edge.from === nodeId || edge.to === nodeId) ids.push(id);
  });
  return ids;
}

function criticalUtilization(result: AssignmentResult, edge: EdgeRecord): number {
  return (result.flows.get(edge.id) ?? 0) / Math.max(edge.capacityVehPerHour, 1);
}

function signalCandidateScore(
  graph: TrafficGraph,
  baseline: AssignmentResult,
  nodeId: string
): { score: number; approaches: number; averageUtilization: number } {
  const adjacent = adjacentEdgeIds(graph, nodeId)
    .map((id) => graph.edges.get(id))
    .filter((edge): edge is EdgeRecord => Boolean(edge));
  if (adjacent.length < 2) {
    return { score: 0, approaches: adjacent.length, averageUtilization: 0 };
  }

  let pressure = 0;
  let utilizationSum = 0;
  adjacent.forEach((edge) => {
    const flow = baseline.flows.get(edge.id) ?? 0;
    const utilization = criticalUtilization(baseline, edge);
    const currentCost = baseline.costs.get(edge.id) ?? edge.freeFlowMinutes;
    const queueDelay = Math.max(0, currentCost - edge.freeFlowMinutes);
    pressure += flow * (0.6 + utilization) * (queueDelay + edge.signalDelayMinutes + 0.02);
    utilizationSum += utilization;
  });

  const approaches = new Set(adjacent.map((edge) => edge.from === nodeId ? edge.to : edge.from)).size;
  const degreeBonus = Math.min(approaches, 5) * 18;
  return {
    score: round2(pressure + degreeBonus),
    approaches,
    averageUtilization: adjacent.length ? utilizationSum / adjacent.length : 0
  };
}

function applySignalAtNode(
  graph: TrafficGraph,
  nodeId: string,
  baseline: AssignmentResult
): {
  affectedEdges: number;
  controlledApproaches: number;
  queueReductionPercent: number;
  averageUtilization: number;
} {
  const adjacent = adjacentEdgeIds(graph, nodeId);
  const approaches = new Set<string>();
  let affectedEdges = 0;
  let weightedReduction = 0;
  let weightedFlow = 0;
  let utilizationSum = 0;

  for (const id of adjacent) {
    const edge = graph.edges.get(id);
    if (!edge) continue;
    approaches.add(edge.from === nodeId ? edge.to : edge.from);

    const utilization = criticalUtilization(baseline, edge);
    const flow = baseline.flows.get(id) ?? 0;
    utilizationSum += utilization;

    const delayBefore = edge.signalDelayMinutes;
    if (utilization >= 0.82) {
      edge.capacityVehPerHour *= 1.22;
      edge.signalDelayMinutes = Math.max(0.015, edge.signalDelayMinutes * 0.45);
    } else if (utilization >= 0.55) {
      edge.capacityVehPerHour *= 1.14;
      edge.signalDelayMinutes = Math.max(0.02, edge.signalDelayMinutes * 0.62);
    } else {
      edge.capacityVehPerHour *= 1.05;
      edge.signalDelayMinutes = Math.max(0.025, edge.signalDelayMinutes * 0.82);
    }

    weightedReduction += Math.max(0, delayBefore - edge.signalDelayMinutes) * Math.max(flow, 1);
    weightedFlow += Math.max(flow, 1);
    affectedEdges += 1;
  }

  return {
    affectedEdges,
    controlledApproaches: approaches.size,
    queueReductionPercent: round2(
      clamp((weightedReduction / Math.max(weightedFlow, 1)) * 900, 0, 45)
    ),
    averageUtilization: adjacent.length ? utilizationSum / adjacent.length : 0
  };
}

function orderedCorridorFromPath(graph: TrafficGraph, pathEdges: string[]): Coordinates[] {
  const points: Coordinates[] = [];
  pathEdges.forEach((id, index) => {
    const edge = graph.edges.get(id);
    if (!edge) return;
    const from = graph.nodes.get(edge.from)?.coord;
    const to = graph.nodes.get(edge.to)?.coord;
    if (index === 0 && from) points.push(from);
    if (to) points.push(to);
  });
  return points;
}

function pathCost(graph: TrafficGraph, pathEdges: string[], costs: Map<string, number>): number {
  return round2(
    pathEdges.reduce((sum, id) => {
      const edge = graph.edges.get(id);
      if (!edge) return sum;
      return sum + (costs.get(id) ?? edge.freeFlowMinutes + edge.signalDelayMinutes);
    }, 0)
  );
}

function applyEmergencyPriorityToEdges(graph: TrafficGraph, edgeIds: string[]): number {
  let affected = 0;
  for (const id of edgeIds) {
    const edge = graph.edges.get(id);
    if (!edge) continue;
    edge.capacityVehPerHour *= 1.18;
    edge.signalDelayMinutes = Math.max(0, edge.signalDelayMinutes * 0.28);
    affected += 1;
  }
  return affected;
}

function testEmergencyPriority(
  baselineGraph: TrafficGraph,
  ods: OdDemand[],
  baseline: AssignmentResult,
  language: Language
): { result: AssignmentResult; plan: EmergencyPriorityPlan } {
  const primaryOd = [...ods].sort((a, b) => b.demandVehPerHour - a.demandVehPerHour)[0];
  const baselineCosts = baseline.costs.size ? baseline.costs : makeCostMap(baselineGraph, baseline.flows);
  const path = primaryOd
    ? shortestPath(baselineGraph, primaryOd.origin, primaryOd.destination, baselineCosts)
    : null;
  const pathEdges = path?.edges ?? baseline.bottlenecks.map((item) => item.edgeId).slice(0, 6);
  const corridorSet = new Set(pathEdges);

  for (const bottleneck of baseline.bottlenecks.slice(0, 6)) {
    const edge = baselineGraph.edges.get(bottleneck.edgeId);
    if (!edge) continue;
    if (corridorSet.has(edge.id) || corridorSet.has(edgeId(edge.to, edge.from))) {
      corridorSet.add(edge.id);
    }
  }

  const priorityEdges = [...corridorSet].filter((id) => baselineGraph.edges.has(id));
  const emergencyGraph = cloneGraph(baselineGraph);
  const affectedEdges = applyEmergencyPriorityToEdges(emergencyGraph, priorityEdges);
  const result = assignTraffic(emergencyGraph, ods);
  const afterCosts = result.costs.size ? result.costs : makeCostMap(emergencyGraph, result.flows);
  const afterPath = primaryOd
    ? shortestPath(emergencyGraph, primaryOd.origin, primaryOd.destination, afterCosts)
    : null;
  const afterEdges = afterPath?.edges ?? priorityEdges;
  const corridor = orderedCorridorFromPath(baselineGraph, pathEdges.length ? pathEdges : afterEdges);
  const travelTimeWithoutPriority = pathCost(baselineGraph, pathEdges, baselineCosts);
  const travelTimeWithPriority = pathCost(emergencyGraph, afterEdges, afterCosts);

  return {
    result,
    plan: {
      corridor,
      affectedEdges,
      travelTimeWithoutPriority,
      travelTimeWithPriority,
      improvementMinutes: round2(Math.max(0, travelTimeWithoutPriority - travelTimeWithPriority)),
      signalDelayReductionPercent: 72,
      capacityBoostPercent: 18,
      note: ui(language).emergency.note
    }
  };
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
  language: Language,
  forwardRoutes: RoutePayload[],
  reverseRoutes: RoutePayload[],
  graph: TrafficGraph,
  directionSummary: DirectionalitySummary
): string[] {
  const text = ui(language).evidence;
  return [
    text.routes(forwardRoutes.length, reverseRoutes.length),
    text.segments(countSegments(forwardRoutes) + countSegments(reverseRoutes)),
    text.edges(graph.edges.size, directionSummary.oneWayEdges),
    text.newRoad,
    text.signals
  ];
}

function plainLanguageSummary(
  language: Language,
  braessDetected: boolean,
  recommended: ScenarioResult,
  signal: TrafficSignalPlacement | undefined
): string {
  const text = ui(language).plain;
  if (braessDetected) {
    return text.braess(recommended.title);
  }

  if (signal && signal.improvementMinutes > 0.1) {
    return text.signal(
      signal.location.lat.toFixed(5),
      signal.location.lon.toFixed(5)
    );
  }

  return text.safe(recommended.title);
}
function testTrafficSignals(
  baselineGraph: TrafficGraph,
  ods: OdDemand[],
  baseline: AssignmentResult,
  language: Language
): { placements: TrafficSignalPlacement[]; best: AssignmentResult; affected: number } {
  const candidateIds = new Set<string>();
  for (const item of baseline.bottlenecks.slice(0, 12)) {
    const edge = baselineGraph.edges.get(item.edgeId);
    if (!edge) continue;
    candidateIds.add(edge.from);
    candidateIds.add(edge.to);
  }

  const uniqueCandidates = [...candidateIds]
    .map((nodeId) => ({ nodeId, ...signalCandidateScore(baselineGraph, baseline, nodeId) }))
    .filter((candidate) => candidate.approaches >= 2 && candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const tests = uniqueCandidates.map((candidate) => {
    const graph = cloneGraph(baselineGraph);
    const signal = applySignalAtNode(graph, candidate.nodeId, baseline);
    const result = assignTraffic(graph, ods);
    return { ...candidate, signal, result };
  });

  tests.sort((a, b) => {
    const improvementDelta =
      (baseline.totalMinutes - b.result.totalMinutes) -
      (baseline.totalMinutes - a.result.totalMinutes);
    if (Math.abs(improvementDelta) > 0.01) return improvementDelta;
    return b.score - a.score;
  });
  const selected = tests.find((test) => baseline.totalMinutes - test.result.totalMinutes > 0.03);
  const placements = tests.slice(0, 4).map((test) => {
    const utilizationPercent = Math.round(test.signal.averageUtilization * 100);
    return {
      id: test.nodeId,
      location: baselineGraph.nodes.get(test.nodeId)!.coord,
      affectedEdges: test.signal.affectedEdges,
      controlledApproaches: test.signal.controlledApproaches,
      score: round2(test.score),
      queueReductionPercent: test.signal.queueReductionPercent,
      totalMinutes: test.result.totalMinutes,
      improvementMinutes: round2(baseline.totalMinutes - test.result.totalMinutes),
      reason: ui(language).signals.reason(test.signal.controlledApproaches, utilizationPercent),
      selected: selected?.nodeId === test.nodeId
    };
  });

  return {
    placements,
    best: selected?.result ?? baseline,
    affected: selected?.signal.affectedEdges ?? 0
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
  const language = input.language ?? "en";
  const text = ui(language);
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
  const signalTest = testTrafficSignals(baselineGraph, ods, baseline, language);
  const emergencyTest = testEmergencyPriority(baselineGraph, ods, baseline, language);

  const scenarioText = text.scenarios;
  const scenarios: ScenarioResult[] = [
    resultFromAssignment(
      "mevcut_ag",
      scenarioText.baselineTitle,
      baseline,
      baseline.totalMinutes,
      scenarioText.baselineNote
    ),
    resultFromAssignment(
      "yeni_yol_tek_yonlu",
      scenarioText.oneWayTitle,
      oneWay,
      baseline.totalMinutes,
      oneWay.totalMinutes > baseline.totalMinutes
        ? scenarioText.oneWayBad
        : scenarioText.oneWayGood,
      `${candidate.from.lat.toFixed(5)}, ${candidate.from.lon.toFixed(5)} -> ${candidate.to.lat.toFixed(5)}, ${candidate.to.lon.toFixed(5)}`,
      "tek_yonlu"
    ),
    resultFromAssignment(
      "yeni_yol_cift_yonlu",
      scenarioText.twoWayTitle,
      twoWay,
      baseline.totalMinutes,
      twoWay.totalMinutes > baseline.totalMinutes
        ? scenarioText.twoWayBad
        : scenarioText.twoWayGood,
      `${candidate.from.lat.toFixed(5)}, ${candidate.from.lon.toFixed(5)} <-> ${candidate.to.lat.toFixed(5)}, ${candidate.to.lon.toFixed(5)}`,
      "cift_yonlu"
    ),
    resultFromAssignment(
      "baglanti_yolu_kapat",
      scenarioText.closureTitle,
      closure.result,
      baseline.totalMinutes,
      closure.closedEdge ? scenarioText.closureGood : scenarioText.closureNeutral,
      closure.closedEdge
        ? `${baselineGraph.nodes.get(closure.closedEdge.from)?.coord.lat.toFixed(5)}, ${baselineGraph.nodes.get(closure.closedEdge.from)?.coord.lon.toFixed(5)} -> ${baselineGraph.nodes.get(closure.closedEdge.to)?.coord.lat.toFixed(5)}, ${baselineGraph.nodes.get(closure.closedEdge.to)?.coord.lon.toFixed(5)}`
        : undefined
    ),
    resultFromAssignment(
      "akilli_isiklandirma",
      scenarioText.signalTitle,
      signalTest.best,
      baseline.totalMinutes,
      signalTest.placements.length ? scenarioText.signalGood : scenarioText.signalNeutral,
      signalTest.placements[0]
        ? `${signalTest.placements[0].location.lat.toFixed(5)}, ${signalTest.placements[0].location.lon.toFixed(5)}`
        : undefined
    ),
    resultFromAssignment(
      "acil_arac_onceligi",
      scenarioText.emergencyTitle,
      emergencyTest.result,
      baseline.totalMinutes,
      `${scenarioText.emergencyNote} ${emergencyTest.plan.note}`
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
    note: worstBraess ? text.newRoad.braess : text.newRoad.safe
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
      model: text.model,
      confidencePercent: confidencePercent(
        baselineGraph,
        forwardRoutes,
        reverseRoutes,
        baseline
      ),
      plainLanguage: plainLanguageSummary(
        language,
        braessCandidates.length > 0,
        safeRecommended,
        selectedSignal
      ),
      evidence: buildEvidence(
        language,
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
      trafficSignals: signalTest.placements,
      emergencyPriority: emergencyTest.plan
    }
  };
}
