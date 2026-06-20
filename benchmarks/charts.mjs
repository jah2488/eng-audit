#!/usr/bin/env node
// Generate assets/benchmark.svg from a scored snapshot. A recall-vs-false-alarm scatter: y =
// planted-violation recall (higher better), x = real-defect false-alarm rate on clean code (lower
// better). The honest story is that every careful reviewer catches the obvious violations (points
// cluster high), and they separate on false alarms, with eng-audit in the top-left (good) corner.
//
// Usage: node charts.mjs [snapshots/results-<date>.scored.json]

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const newest = () => {
  const dir = join(HERE, "snapshots");
  const f = readdirSync(dir).filter((x) => x.endsWith(".scored.json")).sort();
  if (!f.length) throw new Error("no scored snapshot");
  return join(dir, f[f.length - 1]);
};
const d = JSON.parse(readFileSync(process.argv[2] || newest(), "utf8"));
const FONT = "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
const LABEL = { baseline: "plain review", critical: "review, be critical", "eng-audit": "eng-audit" };

// plot geometry
const X0 = 70, Y0 = 60, PW = 460, PH = 280; // x: 0..100 false-alarm, y: 0..100 recall
const px = (fa) => X0 + (fa / 100) * PW;
const py = (rc) => Y0 + (1 - rc / 100) * PH;

const pts = d.arms.map((a) => {
  const rc = d.recall[a].pct, fa = d.cleanFlag[a].pct;
  const skill = a === "eng-audit";
  const fill = skill ? "#b45309" : "#9aa0a6";
  const cx = px(fa), cy = py(rc);
  // offset label to avoid overlap; eng-audit labels left, others right
  const lx = skill ? cx - 10 : cx + 12, anchor = skill ? "end" : "start";
  return `<circle cx="${cx}" cy="${cy}" r="${skill ? 8 : 6}" fill="${fill}"/>` +
    `<text x="${lx}" y="${cy + 4}" text-anchor="${anchor}" class="${skill ? "fv" : "lbl"}">${LABEL[a] || a} (${rc}% / ${fa}%)</text>`;
});

// gridlines + axis labels
const grid = [];
for (const v of [0, 25, 50, 75, 100]) {
  grid.push(`<line x1="${px(v)}" y1="${Y0}" x2="${px(v)}" y2="${Y0 + PH}" stroke="#eee" stroke-width="1"/>`);
  grid.push(`<text x="${px(v)}" y="${Y0 + PH + 16}" text-anchor="middle" class="cap">${v}%</text>`);
  grid.push(`<line x1="${X0}" y1="${py(v)}" x2="${X0 + PW}" y2="${py(v)}" stroke="#eee" stroke-width="1"/>`);
  grid.push(`<text x="${X0 - 8}" y="${py(v) + 4}" text-anchor="end" class="cap">${v}%</text>`);
}
const H = Y0 + PH + 64;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 ${H}" font-family="${FONT}" role="img" aria-label="eng-audit: high recall with the fewest false alarms on clean code"><style>.lbl{fill:#6b7280;font-size:12px}.sub{fill:#6b7280;font-size:13px;font-weight:700}.fv{fill:#b45309;font-size:12px;font-weight:700}.cap{fill:#9aa0a6;font-size:10px}.ax{fill:#6b7280;font-size:11px}</style>
<text x="20" y="26" class="sub" font-size="15">Catch the real issues, without crying wolf</text>
<text x="20" y="42" class="cap">y = planted-violation recall (higher better) · x = false-alarm rate on clean code (lower better) · the top-left corner is best</text>
${grid.join("\n")}
<rect x="${X0}" y="${Y0}" width="${PW}" height="${PH}" fill="none" stroke="#d8d8d8" stroke-width="1"/>
${pts.join("\n")}
<text x="${X0}" y="${H - 8}" class="cap">claude-haiku-4-5, ${d.arms.length} arms. labels show (recall% / false-alarm%). detection keyword-based, equal across arms.</text></svg>`;
writeFileSync(join(HERE, "..", "assets", "benchmark.svg"), svg);
console.error(`benchmark.svg: ${d.arms.map((a) => `${a} rec ${d.recall[a].pct}% / fa ${d.cleanFlag[a].pct}%`).join(", ")}`);
