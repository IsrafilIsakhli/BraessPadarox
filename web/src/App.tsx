import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AboutPage } from "./pages/AboutPage";
import { AnalysisPage } from "./pages/AnalysisPage";
import { LiveTrafficPage } from "./pages/LiveTrafficPage";
import { MethodologyPage } from "./pages/MethodologyPage";
import { localized } from "./localization";
import type { Language } from "./types";

export default function App() {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = window.localStorage.getItem("braess-language");
    return saved === "tr" || saved === "az" || saved === "en" ? saved : "tr";
  });
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = localized(language, "Braess Lab · Trafik Analizi", "Braess Lab · Nəqliyyat analizi", "Braess Lab · Traffic Analysis");
    window.localStorage.setItem("braess-language", language);
  }, [language]);
  return (
    <BrowserRouter>
      <AppShell language={language} onLanguageChange={setLanguage}>
        <Routes>
          <Route path="/analysis" element={<AnalysisPage language={language} />} />
          <Route path="/live-traffic" element={<LiveTrafficPage language={language} />} />
          <Route path="/methodology" element={<MethodologyPage language={language} />} />
          <Route path="/about" element={<AboutPage language={language} />} />
          <Route path="*" element={<Navigate to="/analysis" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
