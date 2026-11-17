import { describe, expect, it } from "vitest";
import { deriveRoadAlignedConnector, mergeRoadAlignedGeometry } from "./routing";
import type { RouteData } from "../types";

describe("road-aligned new-road geometry", () => {
  it("keeps the intermediate road shape instead of drawing a straight chord", () => {
    const geometry: [number, number][] = [
      [40.4, 49.8],
      [40.401, 49.802],
      [40.403, 49.803],
      [40.405, 49.801],
      [40.407, 49.804],
      [40.409, 49.806]
    ];
    const route: RouteData = {
      distanceKm: 2,
      durationMin: 4,
      geometry
    };

    expect(deriveRoadAlignedConnector([route])).toEqual(geometry.slice(1, 5));
  });

  it("joins routed segments without duplicating their shared road point", () => {
    expect(mergeRoadAlignedGeometry(
      [[40.4, 49.8], [40.401, 49.801]],
      [[40.401, 49.801], [40.402, 49.802], [40.403, 49.803]]
    )).toEqual([
      [40.4, 49.8],
      [40.401, 49.801],
      [40.402, 49.802],
      [40.403, 49.803]
    ]);
  });

  it("preserves every bend even on routes with thousands of points", () => {
    const geometry: [number, number][] = Array.from({ length: 2000 }, (_, i) => [40 + i / 100000, 49 + Math.sin(i / 5) / 10000]);
    const candidate = deriveRoadAlignedConnector([{ geometry, distanceKm: 4, durationMin: 8 }]);
    expect(candidate).toEqual(geometry.slice(599, 1401));
    expect(mergeRoadAlignedGeometry([], geometry)).toEqual(geometry);
  });

  it("rejects disconnected snaps rather than drawing a chord across buildings", () => {
    expect(() => mergeRoadAlignedGeometry([[40,49],[40.01,49.01]],[[40.02,49.02],[40.03,49.03]])).toThrow(/share a routed junction/);
  });
});
