import { describe, expect, it } from "vitest";
import {
  classifyDecision,
  runAdvancedSimulation,
  solveUserEquilibrium,
  type GraphEdge,
  type SolveResult,
  type TrafficGraph
} from "./advancedSimulation.js";
import type { AdvancedScenarioResult, EquilibriumMetrics } from "./types.js";

function graphWithNodes(ids: string[]): TrafficGraph {
  return {
    nodes: new Map(ids.map((id, index) => [id, { id, coord: { lat: index, lon: index } }])),
    edges: new Map(),
    outgoing: new Map()
  };
}

function addEdge(
  graph: TrafficGraph,
  id: string,
  from: string,
  to: string,
  freeFlowMinutes: number,
  capacityVehPerHour: number
) {
  const edge: GraphEdge = {
    id,
    from,
    to,
    lengthKm: 1,
    freeFlowMinutes,
    capacityVehPerHour,
    signalDelayMinutes: 0,
    geometry: [[graph.nodes.get(from)!.coord.lat, graph.nodes.get(from)!.coord.lon], [graph.nodes.get(to)!.coord.lat, graph.nodes.get(to)!.coord.lon]],
    capacitySource: "user"
  };
  graph.edges.set(id, edge);
  graph.outgoing.set(from, [...(graph.outgoing.get(from) ?? []), id]);
}

function classicBraess(includeConnector: boolean): TrafficGraph {
  const graph = graphWithNodes(["s", "a", "b", "t"]);
  addEdge(graph, "s-a", "s", "a", 1, 400);
  addEdge(graph, "a-t", "a", "t", 5, 1_000_000_000);
  addEdge(graph, "s-b", "s", "b", 5, 1_000_000_000);
  addEdge(graph, "b-t", "b", "t", 1, 400);
  if (includeConnector) addEdge(graph, "a-b", "a", "b", 0.01, 1_000_000_000);
  return graph;
}

function metrics(average: number): EquilibriumMetrics {
  return {
    feasible: true,
    converged: true,
    averageTravelTimeMinutes: average,
    freeFlowTravelTimeMinutes: 5,
    averageDelayMinutes: average - 5,
    totalSystemTravelTimeHours: average * 10,
    averageVolumeCapacityRatio: 0.8,
    iterations: 8,
    relativeGap: 0.00001
  };
}

function solved(average: number): SolveResult {
  return { metrics: metrics(average), flows: new Map(), costs: new Map(), bottlenecks: [] };
}

describe("Frank–Wolfe directed user equilibrium", () => {
  it("detects the deterministic four-node Braess network effect", () => {
    const demand = [{ origin: "s", destination: "t", demandVehPerHour: 1000 }];
    const baseline = solveUserEquilibrium(classicBraess(false), demand);
    const withConnector = solveUserEquilibrium(classicBraess(true), demand);

    expect(baseline.metrics.converged).toBe(true);
    expect(withConnector.metrics.converged).toBe(true);
    expect(baseline.metrics.averageTravelTimeMinutes).toBeCloseTo(6.37, 1);
    expect(withConnector.metrics.averageTravelTimeMinutes).toBeGreaterThan(
      baseline.metrics.averageTravelTimeMinutes * 1.02
    );
  });

  it("does not report a false penalty when added capacity is useful", () => {
    const base = graphWithNodes(["s", "t"]);
    addEdge(base, "old", "s", "t", 10, 400);
    const expanded = graphWithNodes(["s", "t"]);
    addEdge(expanded, "old", "s", "t", 10, 400);
    addEdge(expanded, "relief", "s", "t", 12, 2000);
    const demand = [{ origin: "s", destination: "t", demandVehPerHour: 1000 }];

    expect(solveUserEquilibrium(expanded, demand).metrics.averageTravelTimeMinutes)
      .toBeLessThan(solveUserEquilibrium(base, demand).metrics.averageTravelTimeMinutes);
  });

  it("keeps directional demands separate and rejects disconnected demand", () => {
    const directed = graphWithNodes(["s", "t"]);
    addEdge(directed, "forward", "s", "t", 8, 1000);
    addEdge(directed, "reverse", "t", "s", 9, 1000);
    const result = solveUserEquilibrium(directed, [
      { origin: "s", destination: "t", demandVehPerHour: 600 },
      { origin: "t", destination: "s", demandVehPerHour: 300 }
    ]);
    expect(result.metrics.feasible).toBe(true);
    expect(result.flows.get("forward")).toBeCloseTo(600);
    expect(result.flows.get("reverse")).toBeCloseTo(300);

    const disconnected = graphWithNodes(["s", "t"]);
    expect(solveUserEquilibrium(disconnected, [{ origin: "s", destination: "t", demandVehPerHour: 500 }]).metrics.feasible).toBe(false);
  });
});

describe("uncertainty decision rules", () => {
  function roadResult(probability: number, median: number, p10: number, p90: number): AdvancedScenarioResult {
    return {
      key: "road", type: "newRoad", title: "Road", category: "network", metrics: metrics(10 + median / 10),
      deltaMinutes: median / 10, deltaPercent: median, note: "fixture",
      uncertainty: { probabilityOfWorsening: probability, medianDeltaPercent: median, p10DeltaPercent: p10, p90DeltaPercent: p90, samples: 100 }
    };
  }

  it("requires both a two-percent median and eighty-percent probability", () => {
    expect(classifyDecision("en", solved(10), [roadResult(0.8, 2.1, 1, 3)]).status).toBe("detected");
    expect(classifyDecision("en", solved(10), [roadResult(0.79, 2.1, 1, 3)]).status).toBe("possible");
  });

  it("marks a zero-crossing interval as possible", () => {
    expect(classifyDecision("en", solved(10), [roadResult(0.4, -0.2, -2, 1)]).status).toBe("possible");
    expect(classifyDecision("en", solved(10), [roadResult(0, 0, 0, 0)]).status).toBe("not-detected");
    expect(classifyDecision("en", solved(10), [roadResult(0.2, -2, -4, -1)]).status).toBe("not-detected");
  });
});

describe("advanced simulation response", () => {
  it("runs one hundred reproducible uncertainty samples and returns diagnostics", () => {
    const response = runAdvancedSimulation({
      mode: "static",
      language: "tr",
      start: { lat: 0, lon: 0 },
      end: { lat: 1, lon: 1 },
      demand: { forwardVehPerHour: 700, reverseVehPerHour: 300 },
      routeMeta: {
        routes: [
          { distanceKm: 10, durationMin: 15, geometry: [[0, 0], [0, 1], [1, 1]] },
          { distanceKm: 11, durationMin: 16, geometry: [[0, 0], [1, 0], [1, 1]] }
        ],
        reverseRoutes: [
          { distanceKm: 10, durationMin: 15, geometry: [[1, 1], [0, 1], [0, 0]] }
        ]
      },
      scenarios: [{ type: "newRoad", geometry: [[0, 1], [1, 0]], direction: "two-way", laneCount: 1, speedLimitKmh: 40 }]
    });

    expect(response.scenarios[0].uncertainty?.samples).toBe(100);
    expect(response.dataQuality.demandSource).toBe("manual");
    expect(response.diagnostics.nodeCount).toBeGreaterThanOrEqual(4);
    expect(response.provenance.map((item) => item.source)).toContain("Model");
  });
});
