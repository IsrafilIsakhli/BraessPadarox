import { afterEach, describe, expect, it, vi } from "vitest";
import { validateRoadScenarios } from "./roadRouting.js";
import type { AdvancedSimulationRequest } from "./types.js";
afterEach(() => vi.unstubAllGlobals());
describe("legal driving geometry", () => {
  it("routes each direction independently and preserves the reverse detour", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok:true, json:async()=>({ code:"Ok", routes:[{geometry:{coordinates:[[49,40],[49.01,40.01],[49.02,40.02]]}}] }) }).mockResolvedValueOnce({ ok:true, json:async()=>({ code:"Ok", routes:[{geometry:{coordinates:[[49.02,40.02],[49.04,40.03],[49,40]]}}] }) });
    vi.stubGlobal("fetch",fetcher);
    const input: AdvancedSimulationRequest = { mode:"static", start:{lat:40,lon:49},end:{lat:40.02,lon:49.02},scenarios:[{type:"newRoad",geometry:[[40,49],[40.02,49.02]],direction:"two-way",laneCount:2,speedLimitKmh:50}] };
    const verified = await validateRoadScenarios(input);
    const road = verified.scenarios[0];
    if (road.type !== "newRoad") throw new Error("Expected road");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(road.reverseGeometry).toEqual([[40.02,49.02],[40.03,49.04],[40,49]]);
    expect(road.reverseGeometry).not.toEqual([...road.geometry].reverse());
    expect(String(fetcher.mock.calls[1][0])).toContain("continue_straight=true");
    expect(String(fetcher.mock.calls[1][0])).toContain('/49.02,40.02;49,40?');
  });
  it("rejects inaccessible points instead of accepting an unverified straight line", async () => {
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({code:"NoRoute"})}));
    await expect(validateRoadScenarios({mode:"static",start:{lat:1,lon:1},end:{lat:2,lon:2},scenarios:[{type:"newRoad",geometry:[[1,1],[2,2]],direction:"one-way",laneCount:1,speedLimitKmh:30}]})).rejects.toThrow(/No legal driving route/);
  });
});
