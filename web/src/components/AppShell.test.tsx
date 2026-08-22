// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("exposes real navigation routes and the language switch", () => {
    const onLanguageChange = vi.fn();
    render(<MemoryRouter initialEntries={["/analysis"]}><AppShell language="tr" onLanguageChange={onLanguageChange}><main>İçerik</main></AppShell></MemoryRouter>);

    expect(screen.getByRole("link", { name: /Analiz/i }).getAttribute("href")).toBe("/analysis");
    expect(screen.getByRole("link", { name: /Canlı Trafik/i }).getAttribute("href")).toBe("/live-traffic");
    expect(screen.getByRole("link", { name: /Metodoloji/i }).getAttribute("href")).toBe("/methodology");
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(onLanguageChange).toHaveBeenCalledWith("en");
  });
});
