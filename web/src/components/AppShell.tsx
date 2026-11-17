import { useState, type ReactNode } from "react";
import { Activity, BookOpenText, Info, Menu, Network, RadioTower, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { getCopy } from "../copy";
import { localized } from "../localization";
import type { Language } from "../types";

type Props = { children: ReactNode; language: Language; onLanguageChange: (language: Language) => void };

export function AppShell({ children, language, onLanguageChange }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const text = getCopy(language);
  const links = [
    { to: "/analysis", label: localized(language,"Simülasyon","Simulyasiya","Simulation"), icon: Activity },
    { to: "/live-traffic", label: text.nav.live, icon: RadioTower },
    { to: "/methodology", label: text.nav.methodology, icon: BookOpenText },
    { to: "/about", label: localized(language,"Araştırma","Tədqiqat","Research"), icon: Info }
  ];

  return (
    <div className="app-shell">
      <header className="site-header">
        <NavLink to="/analysis" className="wordmark" aria-label={text.brand}>
          <span className="wordmark-mark" aria-hidden="true"><svg viewBox="0 0 44 40" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 20L22 5l16 15-16 15L6 20m0 0h32"/><circle cx="6" cy="20" r="4" fill="#fffdfa"/><circle cx="22" cy="5" r="4" fill="#fffdfa"/><circle cx="38" cy="20" r="4" fill="#fffdfa"/><circle cx="22" cy="35" r="4" fill="#fffdfa"/></svg></span>
          <span><strong>{text.brand}</strong><small>{localized(language,"Ulaşım Ağları Araştırma Platformu","Nəqliyyat Şəbəkələri Tədqiqat Platforması","Transport Network Research Platform")}</small></span>
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
            <button type="button" className={language === "az" ? "active" : ""} onClick={() => onLanguageChange("az")}>AZ</button>
            <button type="button" className={language === "en" ? "active" : ""} onClick={() => onLanguageChange("en")}>EN</button>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
