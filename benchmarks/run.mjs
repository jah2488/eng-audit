#!/usr/bin/env node
// Capture-only runner for the eng-audit detection benchmark. For each (case, arm, rep) it asks the
// local `claude` CLI to review a code snippet and records the raw review text. measure.mjs scores
// detection from that text, so the raw reviews stay the source of truth.
//
// Arms: baseline (plain review), critical (review + "be thorough/critical"), eng-audit (baseline +
// the SKILL.md body). Same clean single-shot setup flint uses: no tools, no MCP, project settings
// only so the operator's user-level CLAUDE.md does not leak in.
//
// Usage: node run.mjs [--reps 5] [--concurrency 6] [--model claude-haiku-4-5] [--out snapshots/<f>.json]

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CASES, ARMS } from "./cases.mjs";

const exec = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };

const MODEL = arg("model", "claude-haiku-4-5");
const REPS = parseInt(arg("reps", "5"), 10);
const CONCURRENCY = parseInt(arg("concurrency", "6"), 10);
const stamp = new Date().toISOString().slice(0, 10);
const OUT = arg("out", join(HERE, "snapshots", `results-${stamp}.json`));

const SKILL = readFileSync(join(HERE, "..", "skills", "eng-audit", "SKILL.md"), "utf8")
  .replace(/^---\n[\s\S]*?\n---\n/, "").trim();
const systemFor = (arm) => (arm === "eng-audit" ? `${ARMS.baseline}\n\n${SKILL}` : ARMS[arm]);

async function callClaude(system, prompt) {
  const args = ["-p", prompt, "--system-prompt", system, "--model", MODEL, "--output-format", "json",
    "--strict-mcp-config", "--allowed-tools", "", "--permission-mode", "default", "--setting-sources", "project"];
  const { stdout } = await exec("claude", args, { maxBuffer: 32 * 1024 * 1024, timeout: 240_000 });
  const j = JSON.parse(stdout);
  return { result: j.result ?? "", is_error: !!j.is_error };
}
async function withRetry(system, prompt) {
  for (let a = 0; a < 2; a++) {
    try { const r = await callClaude(system, prompt); if (!r.is_error && r.result.trim()) return r; }
    catch (e) { if (a === 1) return { result: "", error: String(e).slice(0, 160) }; }
  }
  return { result: "", error: "empty after retry" };
}
async function pool(jobs, n, worker) {
  const out = new Array(jobs.length); let next = 0;
  const run = async () => { while (next < jobs.length) { const i = next++; out[i] = await worker(jobs[i]); } };
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, run));
  return out;
}

async function main() {
  const arms = Object.keys(ARMS);
  const jobs = [];
  for (const c of CASES) for (const arm of arms) for (let r = 0; r < REPS; r++) jobs.push({ c, arm, r });
  console.error(`eng-audit bench: ${CASES.length} cases x ${arms.length} arms x ${REPS} reps = ${jobs.length} calls, model=${MODEL}`);
  let done = 0;
  const records = await pool(jobs, CONCURRENCY, async ({ c, arm, r }) => {
    const prompt = `Code under review:\n\n\`\`\`js\n${c.code}\n\`\`\`\n\nReview it and list the problems you find.`;
    const res = await withRetry(systemFor(arm), prompt);
    process.stderr.write(`\r  ${++done}/${jobs.length}`);
    return { case: c.id, clean: !!c.clean, arm, rep: r, error: res.error ?? null, result: res.result };
  });
  process.stderr.write("\n");
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    metadata: { generated_at: new Date().toISOString(), model: MODEL, reps: REPS, arms,
      method: "claude -p review of each snippet, no tools, --setting-sources project. eng-audit arm = baseline + SKILL.md body. Detection scored by measure.mjs from the raw review text." },
    records,
  }, null, 2));
  console.error(`wrote ${records.length} records -> ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
