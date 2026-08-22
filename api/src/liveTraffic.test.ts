import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeLiveTraffic, clearLiveTrafficCache, LiveTrafficError } from "./liveTraffic.js";

const routeFixture = {
  routes: [{
    summary: {
      lengthInMeters: 10000,
      travelTimeInSeconds: 900,
      noTrafficTravelTimeInSeconds: 720,
      historicTrafficTravelTimeInSeconds: 840,
      trafficDelayInSeconds: 180,
      trafficLengthInMeters: 2400
    },
    legs: [{ points: Array.from({ length: 72 }, (_, index) => ({ latitude: 40.4 + index * 0.0001, longitude: 49.8 + index * 0.0001 })) }]
  }]
};

const flowFixture = {
  flowSegmentData: {
    frc: "FRC2",
    currentSpeed: 34,
    freeFlowSpeed: 52,
    currentTravelTime: 88,
    freeFlowTravelTime: 58,
    confidence: 0.82,
    roadClosure: false,
    coordinates: { coordinate: [{ latitude: 40.4, longitude: 49.8 }, { latitude: 40.401, longitude: 49.801 }] }
  }
};

afterEach(() => {
  vi.unstubAllGlobals();
  clearLiveTrafficCache();
});

describe("TomTom live traffic provider", () => {
  it("fails clearly when the server key is not configured", async () => {
    await expect(analyzeLiveTraffic({ lat: 40.4, lon: 49.8 }, { lat: 40.5, lon: 49.9 }, "tr", undefined))
      .rejects.toMatchObject({ code: "LIVE_TRAFFIC_NOT_CONFIGURED", status: 503 });
  });

  it("normalizes route, flow and incident fixtures without exposing the key", async () => {
    const providerKey = "fixture-secret-key";
    const mockFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("calculateRoute")) return new Response(JSON.stringify(routeFixture), { status: 200 });
      if (url.includes("flowSegmentData")) return new Response(JSON.stringify(flowFixture), { status: 200 });
      return new Response(JSON.stringify({ incidents: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await analyzeLiveTraffic({ lat: 40.4, lon: 49.8 }, { lat: 40.5, lon: 49.9 }, "en", providerKey);
    expect(result.routes[0]).toMatchObject({ travelTimeMinutes: 15, noTrafficTravelTimeMinutes: 12, trafficDelayMinutes: 3 });
    expect(result.flowSegments.length).toBeGreaterThan(0);
    expect(result.dataQuality.coveragePercent).toBe(100);
    expect(JSON.stringify(result)).not.toContain(providerKey);

    const callsAfterFirstLoad = mockFetch.mock.calls.length;
    await analyzeLiveTraffic({ lat: 40.4, lon: 49.8 }, { lat: 40.5, lon: 49.9 }, "en", providerKey);
    expect(mockFetch).toHaveBeenCalledTimes(callsAfterFirstLoad);
  });

  it("maps provider rate limits to a stable public error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    try {
      await analyzeLiveTraffic({ lat: 40.4, lon: 49.8 }, { lat: 40.5, lon: 49.9 }, "en", "fixture-key");
      throw new Error("Expected provider failure");
    } catch (error) {
      expect(error).toBeInstanceOf(LiveTrafficError);
      expect(error).toMatchObject({ code: "RATE_LIMITED", status: 429 });
    }
  });
});
