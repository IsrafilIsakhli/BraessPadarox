import { getTexts } from "../i18n";
import type { InfoPageKey, Language } from "../types";

export type { InfoPageKey } from "../types";

type Props = {
  activePage: InfoPageKey | null;
  language: Language;
  onClose: () => void;
};

export function InfoPanel({ activePage, language, onClose }: Props) {
  if (!activePage) return null;

  const texts = getTexts(language);
  const page = texts.info[activePage];

  return (
    <section className="info-panel">
      <div className="info-panel-header">
        <div>
          <span>{page.eyebrow}</span>
          <h2>{page.title}</h2>
          <p>{page.summary}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={page.title}>
          {texts.common.close}
        </button>
      </div>

      <div className="info-sections">
        {page.sections.map((section) => (
          <article key={section.title}>
            <h3>{section.title}</h3>
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
