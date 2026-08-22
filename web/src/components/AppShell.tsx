import { useState, type ReactNode } from "react";
import { Activity, BookOpenText, Info, Menu, RadioTower, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { getCopy } from "../copy";
import type { Language } from "../types";

type Props = { children: ReactNode; language: Language; onLanguageChange: (language: Language) => void };

export function AppShell({ children, language, onLanguageChange }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const text = getCopy(language);
  const links = [
    { to: "/analysis", label: text.nav.analysis, icon: Activity },
    { to: "/live-traffic", label: text.nav.live, icon: RadioTower },
    { to: "/methodology", label: text.nav.methodology, icon: BookOpenText },
    { to: "/about", label: text.nav.about, icon: Info }
  ];

  return (
    <div className="app-shell">
      <header className="site-header">
        <NavLink to="/analysis" className="wordmark" aria-label={text.brand}>
          <span className="wordmark-mark" aria-hidden="true">B</span>
          <span><strong>{text.brand}</strong><small>{text.descriptor}</small></span>
        </NavLink>
        <button className="mobile-menu-button" type="button" aria-label={menuOpen ? text.common.close : "Menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        <div className={`header-navigation ${menuOpen ? "is-open" : ""}`}>
          <nav aria-label="Primary">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} onClick={() => setMenuOpen(false)} className={({ isActive }) => isActive ? "active" : ""}>
                <Icon size={17} aria-hidden="true" />{label}
              </NavLink>
            ))}
          </nav>
          <div className="language-control" aria-label="Language">
            <button type="button" className={language === "tr" ? "active" : ""} onClick={() => onLanguageChange("tr")}>TR</button>
            <button type="button" className={language === "en" ? "active" : ""} onClick={() => onLanguageChange("en")}>EN</button>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
