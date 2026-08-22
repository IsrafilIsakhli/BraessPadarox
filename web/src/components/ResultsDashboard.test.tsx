// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResultsDashboard } from "./ResultsDashboard";
import type { AdvancedSimulationResponse } from "../types";

const fixture: AdvancedSimulationResponse = {
  decision: { status: "detected", headline: "Yeni yol denge süresini %3,2 artırıyor", summary: "100 örneklemenin 86'sında süre arttı.", deltaPercent: 3.2, probabilityOfWorsening: 0.86, recommendedScenarioKey: "baseline" },
  baseline: { key: "baseline", type: "baseline", title: "Mevcut Koridor", category: "network", metrics: { feasible: true, converged: true, averageTravelTimeMinutes: 20, freeFlowTravelTimeMinutes: 14, averageDelayMinutes: 6, totalSystemTravelTimeHours: 200, averageVolumeCapacityRatio: .8, iterations: 8, relativeGap: .00001 }, deltaMinutes: 0, deltaPercent: 0, note: "Referans" },
  scenarios: [{ key: "road", type: "newRoad", title: "Çizilen Yeni Yol", category: "network", metrics: { feasible: true, converged: true, averageTravelTimeMinutes: 20.64, freeFlowTravelTimeMinutes: 13, averageDelayMinutes: 7.64, totalSystemTravelTimeHours: 206, averageVolumeCapacityRatio: .9, iterations: 11, relativeGap: .00004 }, deltaMinutes: .64, deltaPercent: 3.2, uncertainty: { p10DeltaPercent: 1.1, medianDeltaPercent: 3.2, p90DeltaPercent: 5.4, probabilityOfWorsening: .86, samples: 100 }, note: "Kullanıcı geometrisi" }],
  dataQuality: { score: 78, grade: "high", coveragePercent: 82, averageConfidence: .8, demandSource: "manual", stale: false, notes: [] },
  provenance: [{ source: "TomTom", label: "Live snapshot", observedAt: "2026-08-22T10:00:00Z" }, { source: "Model", label: "Frank-Wolfe" }],
  diagnostics: { model: "BPR + Frank-Wolfe", nodeCount: 42, edgeCount: 68, forwardDemandVehPerHour: 900, reverseDemandVehPerHour: 500, assumptions: ["Kapasite tahminidir."], edgeFlows: [] }
};

describe("ResultsDashboard", () => {
  it("renders a textual decision, uncertainty and convergence evidence", () => {
    render(<ResultsDashboard language="tr" result={fixture} />);
    expect(screen.getByRole("heading", { name: "BRAESS PARADOKSU: VAR" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: /Yeni yolu eklemeyin/i })).not.toBeNull();
    expect(screen.getByText("KÖTÜLEŞTİRİYOR")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Hangi müdahale neyi değiştiriyor?" })).not.toBeNull();
    expect(screen.getByText(/Yeni bağlantı sürücüleri aynı darboğaza çekiyor/i)).not.toBeNull();
    expect(screen.getAllByText(/Kötüleşme olasılığı/i).length).toBeGreaterThan(0);
    expect(screen.getByText("1,1–5,4%")).not.toBeNull();
    expect(screen.getByText(/11 iter/i)).not.toBeNull();
    expect(screen.getByText(/TomTom \+ Model/i)).not.toBeNull();
  });
});
