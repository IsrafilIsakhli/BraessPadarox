// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { routeAverageSpeedKmh } from "./LiveTrafficPage";

describe("routeAverageSpeedKmh", () => {
  it("calculates a route-wide average speed from TomTom distance and ETA", () => {
    expect(routeAverageSpeedKmh(16.6, 18.2)).toBeCloseTo(54.73, 2);
  });

  it("does not present invalid route summaries as speed", () => {
    expect(routeAverageSpeedKmh(16.6, 0)).toBeNull();
  });
});
