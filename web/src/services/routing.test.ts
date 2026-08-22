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
});
