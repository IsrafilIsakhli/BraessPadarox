import { getTexts } from "../i18n";
import type { Language, ScenarioResult, SimulationResponse } from "../types";

type Props = {
  simulation: SimulationResponse | null;
  language: Language;
};

function statusClass(status: ScenarioResult["status"]): string {
  if (status === "Dusuk") return "badge low";
  if (status === "Orta") return "badge medium";
  return "badge high";
}

function safeFileDate(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function htmlEscape(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildCsv(result: SimulationResponse, textBundle: ReturnType<typeof getTexts>): string {
  const text = textBundle.table;
  const header = [
    text.scenario,
    text.time,
    text.delay,
    text.delta,
    text.congestion,
    text.status,
    text.intervention
  ];
  const rows = result.scenarios.map((scenario) => [
    scenario.title,
    `${scenario.totalMinutes.toFixed(2)} ${text.minuteShort}`,
    `${scenario.delayMinutes.toFixed(2)} ${text.minuteShort}`,
    `${scenario.deltaMinutes.toFixed(2)} ${text.minuteShort}`,
    `%${Math.round(scenario.congestionPercent)}`,
    textBundle.status[scenario.status],
    scenario.intervention ?? text.reference
  ]);

  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function buildHtmlReport(
  result: SimulationResponse,
  language: Language,
  textBundle: ReturnType<typeof getTexts>
): string {
  const text = textBundle.table;
  const rows = result.scenarios
    .map(
      (scenario) => `
        <tr>
          <td>${htmlEscape(scenario.title)}</td>
          <td>${scenario.totalMinutes.toFixed(2)} ${htmlEscape(text.minuteShort)}</td>
          <td>${scenario.delayMinutes.toFixed(2)} ${htmlEscape(text.minuteShort)}</td>
          <td>${scenario.deltaMinutes > 0 ? "+" : ""}${scenario.deltaMinutes.toFixed(2)} ${htmlEscape(text.minuteShort)}</td>
          <td>%${Math.round(scenario.congestionPercent)}</td>
          <td>${htmlEscape(textBundle.status[scenario.status])}</td>
          <td>${htmlEscape(scenario.intervention ?? text.reference)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8" />
  <title>${htmlEscape(text.title)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; color: #111827; }
    h1 { margin-bottom: 6px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 20px 0; }
    .card { border: 1px solid #d8dce8; border-radius: 10px; padding: 14px; background: #f8fafc; }
    .card span { color: #64748b; display: block; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .card strong { display: block; font-size: 22px; margin-top: 6px; }
    table { border-collapse: collapse; width: 100%; margin-top: 18px; }
    th, td { border: 1px solid #d8dce8; padding: 10px; text-align: left; }
    th { background: #eff6ff; }
    tr:nth-child(even) { background: #f8fafc; }
  </style>
</head>
<body>
  <h1>${htmlEscape(text.title)}</h1>
  <p>${htmlEscape(result.summary.plainLanguage)}</p>
  <section class="summary">
    <div class="card"><span>${htmlEscape(textBundle.metrics.braessLabel)}</span><strong>${result.braessDetected ? htmlEscape(textBundle.metrics.present) : htmlEscape(textBundle.metrics.absent)}</strong></div>
    <div class="card"><span>${htmlEscape(textBundle.metrics.recommended)}</span><strong>${htmlEscape(result.recommended.title)}</strong></div>
    <div class="card"><span>${htmlEscape(textBundle.interventions.demand)}</span><strong>${Math.round(result.summary.demandVehPerHour)} ${htmlEscape(textBundle.interventions.vehiclePerHour)}</strong></div>
    <div class="card"><span>${htmlEscape(textBundle.decision.confidence)}</span><strong>${result.summary.confidencePercent}%</strong></div>
  </section>
  <table>
    <thead>
      <tr>
        <th>${htmlEscape(text.scenario)}</th>
        <th>${htmlEscape(text.time)}</th>
        <th>${htmlEscape(text.delay)}</th>
        <th>${htmlEscape(text.delta)}</th>
        <th>${htmlEscape(text.congestion)}</th>
        <th>${htmlEscape(text.status)}</th>
        <th>${htmlEscape(text.intervention)}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

function exportPng(result: SimulationResponse, textBundle: ReturnType<typeof getTexts>): void {
  const text = textBundle.table;
  const canvas = document.createElement("canvas");
  const scale = window.devicePixelRatio || 1;
  const width = 1300;
  const rowHeight = 56;
  const height = 330 + result.scenarios.length * rowHeight;
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.scale(scale, scale);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#111827";
  ctx.font = "bold 34px Arial";
  ctx.fillText(text.title, 42, 58);
  ctx.font = "18px Arial";
  ctx.fillStyle = "#475569";
  ctx.fillText(result.summary.plainLanguage.slice(0, 130), 42, 92);

  const cards = [
    [textBundle.metrics.braessLabel, result.braessDetected ? textBundle.metrics.present : textBundle.metrics.absent],
    [textBundle.metrics.recommended, result.recommended.title],
    [textBundle.interventions.demand, `${Math.round(result.summary.demandVehPerHour)} ${textBundle.interventions.vehiclePerHour}`],
    [textBundle.decision.confidence, `${result.summary.confidencePercent}%`]
  ];

  cards.forEach(([label, value], index) => {
    const x = 42 + index * 305;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#d8dce8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, 122, 280, 92, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 13px Arial";
    ctx.fillText(label.toUpperCase(), x + 18, 154);
    ctx.fillStyle = "#111827";
    ctx.font = "bold 22px Arial";
    ctx.fillText(value.slice(0, 24), x + 18, 188);
  });

  const columns = [42, 365, 535, 690, 840, 995, 1120];
  const headers = [
    text.scenario,
    text.time,
    text.delay,
    text.delta,
    text.congestion,
    text.status,
    text.intervention
  ];
  ctx.fillStyle = "#dbeafe";
  ctx.fillRect(42, 250, 1210, 42);
  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 15px Arial";
  headers.forEach((header, index) => ctx.fillText(header, columns[index], 277));

  result.scenarios.forEach((scenario, index) => {
    const y = 292 + index * rowHeight;
    ctx.fillStyle = index % 2 === 0 ? "#ffffff" : "#f1f5f9";
    ctx.fillRect(42, y, 1210, rowHeight);
    ctx.strokeStyle = "#e2e8f0";
    ctx.strokeRect(42, y, 1210, rowHeight);
    ctx.fillStyle = "#111827";
    ctx.font = "15px Arial";
    const values = [
      scenario.title,
      `${scenario.totalMinutes.toFixed(1)} ${text.minuteShort}`,
      `${scenario.delayMinutes.toFixed(1)} ${text.minuteShort}`,
      `${scenario.deltaMinutes > 0 ? "+" : ""}${scenario.deltaMinutes.toFixed(2)}`,
      `%${Math.round(scenario.congestionPercent)}`,
      textBundle.status[scenario.status],
      scenario.intervention ?? text.reference
    ];
    values.forEach((value, columnIndex) => {
      ctx.fillText(String(value).slice(0, columnIndex === 0 ? 32 : 22), columns[columnIndex], y + 34);
    });
  });

  canvas.toBlob((blob) => {
    if (blob) triggerDownload(`braess-analysis-${safeFileDate()}.png`, blob);
  }, "image/png");
}

export function ScenarioTable({ simulation, language }: Props) {
  if (!simulation) return null;

  const result = simulation;
  const textBundle = getTexts(language);
  const text = textBundle.table;

  function exportCsv() {
    triggerDownload(
      `braess-analysis-${safeFileDate()}.csv`,
      new Blob([`\uFEFF${buildCsv(result, textBundle)}`], { type: "text/csv;charset=utf-8" })
    );
  }

  function exportHtml() {
    triggerDownload(
      `braess-analysis-${safeFileDate()}.html`,
      new Blob([buildHtmlReport(result, language, textBundle)], { type: "text/html;charset=utf-8" })
    );
  }

  return (
    <section className="table-card">
      <div className="table-header">
        <h3>{text.title}</h3>
        <div className="export-buttons">
          <button type="button" onClick={() => exportPng(result, textBundle)}>PNG</button>
          <button type="button" onClick={exportCsv}>CSV</button>
          <button type="button" className="html-btn" onClick={exportHtml}>
            {text.report}
          </button>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>{text.scenario}</th>
            <th>{text.time}</th>
            <th>{text.delay}</th>
            <th>{text.delta}</th>
            <th>{text.congestion}</th>
            <th>{text.status}</th>
            <th>{text.intervention}</th>
          </tr>
        </thead>
        <tbody>
          {result.scenarios.map((scenario) => (
            <tr
              key={scenario.key}
              className={scenario.key === result.recommended.key ? "highlight" : ""}
            >
              <td>{scenario.title}</td>
              <td>{scenario.totalMinutes.toFixed(1)} {text.minuteShort}</td>
              <td>{scenario.delayMinutes.toFixed(1)} {text.minuteShort}</td>
              <td className={scenario.deltaMinutes > 0 ? "delta bad" : "delta good"}>
                {scenario.deltaMinutes > 0 ? "+" : ""}
                {scenario.deltaMinutes.toFixed(2)} {text.minuteShort}
              </td>
              <td>%{Math.round(scenario.congestionPercent)}</td>
              <td>
                <span className={statusClass(scenario.status)}>
                  {textBundle.status[scenario.status]}
                </span>
              </td>
              <td>{scenario.intervention ?? text.reference}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
