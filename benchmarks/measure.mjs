#!/usr/bin/env node
// Score the eng-audit detection benchmark from a snapshot of raw reviews. For each (case, arm, rep)
// a planted violation is "caught" if the review matches every regex in its `need`. Reports, per arm:
// recall (caught planted violations / total), per-principle recall, and the flag rate on clean cases
// (a proxy for over-flagging). Writes <snap>.scored.json for the chart generator.
//
// Usage: node measure.mjs [snapshots/results-<date>.json]

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CASES } from "./cases.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const byId = Object.fromEntries(CASES.map((c) => [c.id, c]));
const newest = () => {
  const dir = join(HERE, "snapshots");
  const f = readdirSync(dir).filter((x) => x.startsWith("results-") && x.endsWith(".json")).sort();
  if (!f.length) throw new Error("no snapshot");
  return join(dir, f[f.length - 1]);
};
const SNAP = process.argv[2] || newest();
const snap = JSON.parse(readFileSync(SNAP, "utf8"));
const arms = snap.metadata.arms;

// On clean code, a false positive is a claim of a real DEFECT (bug / broken / vulnerability /
// critical issue), not a minor "you could add X" suggestion. Stricter than a generic problem-word
// match so legitimate nitpicks are not scored as false alarms. Applied equally to all arms.
const FALSE_DEFECT = /\b(bug|incorrect|broken|will (break|fail)|fails\b|vulnerab|security (issue|risk|hole|concern)|data ?loss|race condition|crash|critical (issue|bug|problem|flaw)|must fix|defect|is wrong|does ?n('|o)?t work)\b/i;

const scored = snap.records.map((r) => {
  const c = byId[r.case];
  const text = r.result || "";
  if (c.clean) return { ...r, flagged: !r.error && FALSE_DEFECT.test(text), caught: [], planted: 0 };
  const caught = (c.violations || []).map((v) => ({
    principle: v.principle,
    hit: !r.error && v.need.every((rx) => rx.test(text)),
  }));
  return { ...r, caught, planted: caught.length };
});

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
function recall(arm) {
  const rows = scored.filter((s) => s.arm === arm && !s.clean);
  const planted = rows.reduce((a, s) => a + s.planted, 0);
  const hit = rows.reduce((a, s) => a + s.caught.filter((x) => x.hit).length, 0);
  return { hit, planted, pct: pct(hit, planted) };
}
function cleanFlag(arm) {
  const rows = scored.filter((s) => s.arm === arm && s.clean);
  const flagged = rows.filter((s) => s.flagged).length;
  return { flagged, n: rows.length, pct: pct(flagged, rows.length) };
}

const principles = [...new Set(CASES.flatMap((c) => (c.violations || []).map((v) => v.principle)))];
function principleRecall(arm, principle) {
  const items = scored.filter((s) => s.arm === arm && !s.clean).flatMap((s) => s.caught.filter((x) => x.principle === principle));
  return { hit: items.filter((x) => x.hit).length, n: items.length, pct: pct(items.filter((x) => x.hit).length, items.length) };
}

const L = [];
const p = (s = "") => L.push(s);
p(`# eng-audit detection benchmark`);
p(`_Model: \`${snap.metadata.model}\` · reps: ${snap.metadata.reps} · ${CASES.filter((c) => !c.clean).length} dirty + ${CASES.filter((c) => c.clean).length} clean cases_`);
p();
p(`## Planted-violation recall (higher = catches more), flag rate on clean code (lower = over-flags less)`);
p(`| arm | recall | caught/planted | flags on clean code |`);
p(`|-----|--:|--:|--:|`);
for (const arm of arms) {
  const rc = recall(arm), cf = cleanFlag(arm);
  p(`| ${arm === "eng-audit" ? "**eng-audit**" : arm} | ${rc.pct}% | ${rc.hit}/${rc.planted} | ${cf.pct}% (${cf.flagged}/${cf.n}) |`);
}
p();
p(`## Recall by principle`);
p(`| principle | ${arms.join(" | ")} |`);
p(`|-----------|${arms.map(() => "--:").join("|")}|`);
for (const pr of principles) p(`| ${pr} | ${arms.map((a) => principleRecall(a, pr).pct + "%").join(" | ")} |`);
console.log(L.join("\n"));

writeFileSync(SNAP.replace(/\.json$/, ".scored.json"), JSON.stringify({
  arms, principles,
  recall: Object.fromEntries(arms.map((a) => [a, recall(a)])),
  cleanFlag: Object.fromEntries(arms.map((a) => [a, cleanFlag(a)])),
  byPrinciple: Object.fromEntries(arms.map((a) => [a, Object.fromEntries(principles.map((pr) => [pr, principleRecall(a, pr)]))])),
}, null, 2));
