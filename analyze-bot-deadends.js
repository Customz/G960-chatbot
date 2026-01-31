"use strict";

const fs = require("fs");
const path = require("path");

const FILE = process.argv[2] || "index.js";
const src = fs.readFileSync(path.resolve(FILE), "utf8");

// =====================================================
// Analyzer config (NO hardcoded max-2 assumptions)
// =====================================================

// 1) Primary: env var when running analyzer (lets you simulate Cloud Run runtime)
const ENV_MAX_FOLLOWUPS = Number(process.env.MAX_FOLLOWUPS_PER_INTENT || "");

// 2) Best-effort: infer default from index.js source (DEFAULT_MAX_FOLLOWUPS assignment)
function inferMaxFollowupsFromSource(source) {
  // Match patterns like:
  // const DEFAULT_MAX_FOLLOWUPS = Number(process.env.MAX_FOLLOWUPS_PER_INTENT || 6);
  // const DEFAULT_MAX_FOLLOWUPS = +(process.env.MAX_FOLLOWUPS_PER_INTENT || 6);
  // const DEFAULT_MAX_FOLLOWUPS = parseInt(process.env.MAX_FOLLOWUPS_PER_INTENT || 6, 10);
  const rx =
    /const\s+DEFAULT_MAX_FOLLOWUPS\s*=\s*(?:Number\(|parseInt\(|\+)?\s*process\.env\.MAX_FOLLOWUPS_PER_INTENT\s*\|\|\s*(\d+)\s*(?:,\s*10)?\s*\)?\s*;/m;
  const m = source.match(rx);
  if (m && m[1]) return Number(m[1]);

  // Also allow: const SOMETHING_MAX_FOLLOWUPS = Number(process.env.MAX_FOLLOWUPS_PER_INTENT || 6);
  const rx2 =
    /const\s+[A-Z0-9_]*MAX_FOLLOWUPS[A-Z0-9_]*\s*=\s*(?:Number\(|parseInt\(|\+)?\s*process\.env\.MAX_FOLLOWUPS_PER_INTENT\s*\|\|\s*(\d+)\s*(?:,\s*10)?\s*\)?\s*;/m;
  const m2 = source.match(rx2);
  if (m2 && m2[1]) return Number(m2[1]);

  return null;
}

const INFERRED_MAX_FOLLOWUPS = inferMaxFollowupsFromSource(src);

// 3) Final cap used by analyzer (priority: env > inferred > fallback 6)
const ANALYZER_MAX_FOLLOWUPS =
  Number.isFinite(ENV_MAX_FOLLOWUPS) && ENV_MAX_FOLLOWUPS > 0
    ? ENV_MAX_FOLLOWUPS
    : Number.isFinite(INFERRED_MAX_FOLLOWUPS) && INFERRED_MAX_FOLLOWUPS > 0
      ? INFERRED_MAX_FOLLOWUPS
      : 6;

// =====================================================
// BRACE-SAFE EXTRACTORS (fix LEX pattern mismatch hard)
// =====================================================
function findConstObjectBlock(name) {
  const idx = src.indexOf(`const ${name}`);
  if (idx === -1) return null;

  const braceStart = src.indexOf("{", idx);
  if (braceStart === -1) return null;

  let i = braceStart;
  let depth = 0;
  let inStr = false;
  let strCh = "";
  let inLineComment = false;
  let inBlockComment = false;

  for (; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];

    // comments
    if (!inStr) {
      if (!inBlockComment && !inLineComment && ch === "/" && next === "/") {
        inLineComment = true;
        i++;
        continue;
      }
      if (!inBlockComment && !inLineComment && ch === "/" && next === "*") {
        inBlockComment = true;
        i++;
        continue;
      }
      if (inLineComment && ch === "\n") {
        inLineComment = false;
        continue;
      }
      if (inBlockComment && ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
        continue;
      }
      if (inLineComment || inBlockComment) continue;
    }

    // strings
    if (!inLineComment && !inBlockComment) {
      if (!inStr && (ch === `"` || ch === `'` || ch === "`")) {
        inStr = true;
        strCh = ch;
        continue;
      }
      if (inStr) {
        if (ch === "\\") {
          i++;
          continue;
        }
        if (ch === strCh) {
          inStr = false;
          strCh = "";
        }
        continue;
      }
    }

    // braces
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(idx, i + 1);
    }
  }
  return null;
}

function extractSubObject(block, propName) {
  // finds propName: { ... } brace-safe
  const p = block.indexOf(`${propName}`);
  if (p === -1) return null;
  const braceStart = block.indexOf("{", p);
  if (braceStart === -1) return null;

  let i = braceStart;
  let depth = 0;
  let inStr = false,
    strCh = "";
  let inLineComment = false,
    inBlockComment = false;

  for (; i < block.length; i++) {
    const ch = block[i];
    const next = block[i + 1];

    if (!inStr) {
      if (!inBlockComment && !inLineComment && ch === "/" && next === "/") {
        inLineComment = true;
        i++;
        continue;
      }
      if (!inBlockComment && !inLineComment && ch === "/" && next === "*") {
        inBlockComment = true;
        i++;
        continue;
      }
      if (inLineComment && ch === "\n") {
        inLineComment = false;
        continue;
      }
      if (inBlockComment && ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
        continue;
      }
      if (inLineComment || inBlockComment) continue;
    }

    if (!inLineComment && !inBlockComment) {
      if (!inStr && (ch === `"` || ch === `'` || ch === "`")) {
        inStr = true;
        strCh = ch;
        continue;
      }
      if (inStr) {
        if (ch === "\\") {
          i++;
          continue;
        }
        if (ch === strCh) {
          inStr = false;
          strCh = "";
        }
        continue;
      }
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return block.slice(braceStart, i + 1);
    }
  }
  return null;
}

function extractArrayLiteral(block, propName) {
  // finds propName: [ ... ] with safe bracket matching
  const p = block.indexOf(`${propName}`);
  if (p === -1) return null;
  const brStart = block.indexOf("[", p);
  if (brStart === -1) return null;

  let i = brStart;
  let depth = 0;
  let inStr = false,
    strCh = "";

  for (; i < block.length; i++) {
    const ch = block[i];
    if (!inStr && (ch === `"` || ch === `'`)) {
      inStr = true;
      strCh = ch;
      continue;
    }
    if (inStr) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === strCh) {
        inStr = false;
        strCh = "";
      }
      continue;
    }
    if (ch === "[") depth++;
    if (ch === "]") {
      depth--;
      if (depth === 0) return block.slice(brStart, i + 1);
    }
  }
  return null;
}

// =====================================================
// Small parsing helpers (pragmatic, not a full JS parser)
// =====================================================
function uniq(arr) {
  return Array.from(new Set(arr));
}

function countOccurrences(hay, needle) {
  const rx = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  const m = hay.match(rx);
  return m ? m.length : 0;
}

function extractBlock(regex) {
  const m = src.match(regex);
  return m ? m[0] : null;
}

function extractQuestionBank() {
  return extractBlock(/const\s+QUESTION_BANK\s*=\s*\{[\s\S]*?\n\s*};/m);
}

function extractRequiredSlots() {
  return extractBlock(/const\s+REQUIRED_SLOTS\s*=\s*\{[\s\S]*?\n\s*};/m);
}

function extractRunFollowupFlow() {
  // Find earliest occurrence of "runFollowupFlow" that likely starts a definition,
  // then brace-scan to capture its body.
  const patterns = [
    /async\s+function\s+runFollowupFlow\s*\(/g,
    /function\s+runFollowupFlow\s*\(/g,
    /(const|let|var)\s+runFollowupFlow\s*=\s*(async\s*)?\(/g,
    /exports\.runFollowupFlow\s*=\s*(async\s*)?function\s*\(/g,
    /exports\.runFollowupFlow\s*=\s*(async\s*)?\(/g,
    /module\.exports\.runFollowupFlow\s*=\s*(async\s*)?function\s*\(/g,
    /module\.exports\.runFollowupFlow\s*=\s*(async\s*)?\(/g,
    // object literal method: runFollowupFlow(...) { ... }
    /runFollowupFlow\s*\([^)]*\)\s*\{/g,
    // object literal prop: runFollowupFlow: (...) => { ... }
    /runFollowupFlow\s*:\s*(async\s*)?\([^)]*\)\s*=>\s*\{/g,
    // object literal prop: runFollowupFlow: async function (...) { ... }
    /runFollowupFlow\s*:\s*(async\s*)?function\s*\([^)]*\)\s*\{/g,
  ];

  let bestIdx = -1;
  let bestMatch = null;

  for (const rx of patterns) {
    rx.lastIndex = 0;
    const m = rx.exec(src);
    if (m && (bestIdx === -1 || m.index < bestIdx)) {
      bestIdx = m.index;
      bestMatch = m[0];
    }
  }
  if (bestIdx === -1) return null;

  // Find first "{" after the match start (start of body)
  const braceStart = src.indexOf("{", bestIdx);
  if (braceStart === -1) return null;

  // brace-safe scan (same as you had)
  let i = braceStart;
  let depth = 0;
  let inStr = false, strCh = "";
  let inLineComment = false, inBlockComment = false;

  for (; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];

    if (!inStr) {
      if (!inBlockComment && !inLineComment && ch === "/" && next === "/") { inLineComment = true; i++; continue; }
      if (!inBlockComment && !inLineComment && ch === "/" && next === "*") { inBlockComment = true; i++; continue; }
      if (inLineComment && ch === "\n") { inLineComment = false; continue; }
      if (inBlockComment && ch === "*" && next === "/") { inBlockComment = false; i++; continue; }
      if (inLineComment || inBlockComment) continue;
    }

    if (!inLineComment && !inBlockComment) {
      if (!inStr && (ch === `"` || ch === `'` || ch === "`")) { inStr = true; strCh = ch; continue; }
      if (inStr) {
        if (ch === "\\") { i++; continue; }
        if (ch === strCh) { inStr = false; strCh = ""; }
        continue;
      }
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(bestIdx, i + 1);
    }
  }

  return null;
}


// =====================================================
// NEW: runFollowupFlow switch/case coverage extractor
// (prevents false "FLOW missing" gaps when code uses switch(intent))
// =====================================================
function extractRunFollowupFlowCases(fnBlock) {
  if (!fnBlock) return [];
  const rx = /case\s*["']([a-z_]+)["']\s*:/g;
  const out = [];
  let m;
  while ((m = rx.exec(fnBlock))) out.push(m[1]);
  return uniq(out);
}

function extractFlowAnyWhere(fnBlock) {
  // 1) first try inside the function block
  if (fnBlock) {
    const m = fnBlock.match(/(const|let|var)\s+FLOW\s*=\s*\{[\s\S]*?\n\s*};/m);
    if (m) return m[0];
  }

  // 2) else try global (top-level)
  const m2 = src.match(/(const|let|var)\s+FLOW\s*=\s*\{[\s\S]*?\n\s*};/m);
  if (m2) return m2[0];

  return null;
}


function extractAllQuotedStrings(block) {
  if (!block) return [];
  const rx = /"([^"]+)"|'([^']+)'/g;
  const out = [];
  let m;
  while ((m = rx.exec(block))) out.push((m[1] || m[2]).trim());
  return out;
}

function parseQuestionBankKeys(qbBlock) {
  if (!qbBlock) return [];
  const rx = /^\s*([a-zA-Z0-9_]+)\s*:\s*\{/gm;
  const keys = [];
  let m;
  while ((m = rx.exec(qbBlock))) keys.push(m[1]);
  return uniq(keys);
}

function parseRequiredSlots(rsBlock) {
  // returns { intent: [keys...] }
  const out = {};
  if (!rsBlock) return out;

  const rx = /([a-z_]+)\s*:\s*\[([\s\S]*?)\]\s*,?/gm;
  let m;
  while ((m = rx.exec(rsBlock))) {
    const intent = m[1];
    const body = m[2];
    const keys = extractAllQuotedStrings(body);
    out[intent] = uniq(keys);
  }
  return out;
}

function parseFlow(flowBlock) {
  // returns { intent: { bucketName:[...] } }
  const out = {};
  if (!flowBlock) return out;

  // NOTE: "pragmatic": adequate because FLOW in your code is simple object literal
  // We only need buckets with arrays.
  const intentRx = /([a-z_]+)\s*:\s*\{([\s\S]*?)\n\s*\}\s*,?/gm;
  let m;
  while ((m = intentRx.exec(flowBlock))) {
    const intent = m[1];
    const body = m[2];

    const arrRx = /([a-zA-Z0-9_]+)\s*:\s*\[([\s\S]*?)\]\s*,?/gm;
    let mm;
    const buckets = {};
    while ((mm = arrRx.exec(body))) {
      const name = mm[1];
      const keys = uniq(extractAllQuotedStrings(mm[2]));
      buckets[name] = keys;
    }

    if (Object.keys(buckets).length) out[intent] = buckets;
  }
  return out;
}

function inBank(bankSet, k) {
  return bankSet.has(k);
}

// =====================================================
// LEX parsing (brace-safe) + keyword stats
// =====================================================
function extractLexIntentKeywordMap() {
  const lexBlock = findConstObjectBlock("LEX");
  if (!lexBlock) return {};

  const intentsObj = extractSubObject(lexBlock, "intents");
  if (!intentsObj) return {};

  // Match: intentName: [ ... ]
  const rx = /([a-z_]+)\s*:\s*\[([\s\S]*?)\]\s*,?/gm;
  const out = {};
  let m;
  while ((m = rx.exec(intentsObj))) {
    const intent = m[1];
    const body = m[2];
    out[intent] = uniq(extractAllQuotedStrings(body));
  }
  return out;
}

function extractLexPriority() {
  const lexBlock = findConstObjectBlock("LEX");
  if (!lexBlock) return [];
  const prioArr = extractArrayLiteral(lexBlock, "intentPriority");
  if (!prioArr) return [];
  return uniq(extractAllQuotedStrings(prioArr));
}

function extractLexIntents() {
  // Keep same output shape as your original: array of intent names
  const map = extractLexIntentKeywordMap();
  return Object.keys(map);
}

function buildLexStats(lexIntentKeywords) {
  const stats = {};
  let totalAll = 0;
  let uniqueSum = 0;
  for (const intent of Object.keys(lexIntentKeywords || {}).sort()) {
    const arr = lexIntentKeywords[intent] || [];
    const total = arr.length;
    const unique = new Set(arr).size;
    stats[intent] = { total, unique };
    totalAll += total;
    uniqueSum += unique;
  }
  return { stats, totalAll, uniqueSum };
}

// =====================================================
// Dead-end analysis
// =====================================================
function analyzeDeadEnds({ bankKeys, requiredSlots, flow, lexIntents, maxFollowups, runFollowupCases }) {
  const bankSet = new Set(bankKeys);

  const fallbackKeys = ["gen_when", "gen_warning", "gen_noise"].filter((k) => bankSet.has(k));
  const hasFallback = fallbackKeys.length > 0;

  const issues = {
    hardDeadEnds: [],
    softDeadEnds: [],
    gaps: [],
    missingInBank: [],
    max2Risk: [],
  };

  const casesSet = new Set(runFollowupCases || []);

  // coverage gaps vs LEX
  for (const intent of lexIntents) {
    if (!requiredSlots[intent]) issues.gaps.push(`LEX intent "${intent}" mist REQUIRED_SLOTS`);

    // Only report mapping gap if neither FLOW nor switch-case contains intent
   const hasFlowMapping = !!flow[intent];
   const hasCaseMapping = casesSet.has(intent);
   const hasSlotsMapping = Array.isArray(requiredSlots[intent]) && requiredSlots[intent].length > 0;

// If your runtime flow dynamically uses REQUIRED_SLOTS without explicit per-intent switch/case,
// then REQUIRED_SLOTS IS the mapping.
if (!hasFlowMapping && !hasCaseMapping && !hasSlotsMapping) {
  issues.gaps.push(`LEX intent "${intent}" mist mapping (geen REQUIRED_SLOTS, geen FLOW, geen case)`);
}

  }

  // missing keys referenced
  for (const [intent, keys] of Object.entries(requiredSlots)) {
    const missing = keys.filter((k) => !inBank(bankSet, k));
    if (missing.length) issues.missingInBank.push(`REQUIRED_SLOTS.${intent} mist in bank: ${missing.join(", ")}`);

    if (Number.isFinite(maxFollowups) && maxFollowups > 0 && keys.length > maxFollowups) {
      issues.max2Risk.push(
        `REQUIRED_SLOTS.${intent} heeft ${keys.length} slots, maar max ${maxFollowups} followups => intake kan onvolledig blijven (by design).`
      );
    }
  }

  for (const [intent, buckets] of Object.entries(flow)) {
    for (const [bucketName, keys] of Object.entries(buckets)) {
      const missing = keys.filter((k) => !inBank(bankSet, k));
      if (missing.length) issues.missingInBank.push(`FLOW.${intent}.${bucketName} mist in bank: ${missing.join(", ")}`);
    }
  }

  // dead-end simulation (static, "first question" scenario)
  const allIntents = uniq([
    ...Object.keys(requiredSlots),
    ...Object.keys(flow),
    ...lexIntents,
    ...(runFollowupCases || []),
  ]);

  for (const intent of allIntents) {
    const req = requiredSlots[intent] || [];
    const buckets = flow[intent] || null;

    if (!buckets) {
      const usable = req.filter((k) => bankSet.has(k));
      if (usable.length === 0) {
        if (hasFallback) issues.softDeadEnds.push(`Intent "${intent}": geen usable REQUIRED_SLOTS en geen FLOW => valt terug op fallback`);
        else issues.hardDeadEnds.push(`Intent "${intent}": geen usable REQUIRED_SLOTS en geen FLOW + geen fallback keys in bank`);
      }
      continue;
    }

    const defaultOrder = buckets.default || [];
    const usableDefault = uniq([...req, ...defaultOrder]).filter((k) => bankSet.has(k));
    if (usableDefault.length === 0) {
      if (hasFallback) issues.softDeadEnds.push(`Intent "${intent}" (default): combined=0 => fallback`);
      else issues.hardDeadEnds.push(`Intent "${intent}" (default): combined=0 en geen fallback keys in bank`);
    }

    for (const [bucketName, order] of Object.entries(buckets)) {
      if (bucketName === "default") continue;
      const usableSubtype = uniq([...req, ...(order || [])]).filter((k) => bankSet.has(k));
      if (usableSubtype.length === 0) {
        if (hasFallback) issues.softDeadEnds.push(`Intent "${intent}" (subtype "${bucketName}"): combined=0 => fallback`);
        else issues.hardDeadEnds.push(`Intent "${intent}" (subtype "${bucketName}"): combined=0 en geen fallback keys in bank`);
      }
    }
  }

  return { issues, hasFallback, fallbackKeys };
}

// =====================================================
// Main
// =====================================================
const qb = extractQuestionBank();
const rs = extractRequiredSlots();
const fn = extractRunFollowupFlow();

const flowBlock = extractFlowAnyWhere(fn);
const bankKeys = parseQuestionBankKeys(qb);
const requiredSlots = parseRequiredSlots(rs);
const flow = parseFlow(flowBlock);

// NEW: cases coverage (only compute once)
const runFollowupCases = extractRunFollowupFlowCases(fn);

// --- LEX (brace-safe) ---
const lexIntentKeywords = extractLexIntentKeywordMap();
const lexIntents = Object.keys(lexIntentKeywords);
const lexPriority = extractLexPriority();
const { stats: lexStats, totalAll: lexTotalAll, uniqueSum: lexUniqueSum } = buildLexStats(lexIntentKeywords);

// Count defs more robustly (covers async + const/let/var assignments too)
const runFollowupFlowDefCount =
  countOccurrences(src, "function runFollowupFlow") +
  countOccurrences(src, "async function runFollowupFlow") +
  countOccurrences(src, "const runFollowupFlow") +
  countOccurrences(src, "let runFollowupFlow") +
  countOccurrences(src, "var runFollowupFlow") +
  countOccurrences(src, "exports.runFollowupFlow") +
  countOccurrences(src, "module.exports.runFollowupFlow") +
  countOccurrences(src, "runFollowupFlow:"); // object literal props

const { issues, hasFallback, fallbackKeys } = analyzeDeadEnds({
  bankKeys,
  requiredSlots,
  flow,
  lexIntents,
  maxFollowups: ANALYZER_MAX_FOLLOWUPS,
  runFollowupCases,
});

// =====================================================
// Report
// =====================================================
console.log("==== BOT ANALYSE (DEAD-END SEEKER) ====");
console.log("File:", FILE);
console.log("");

console.log(
  "Analyzer MAX_FOLLOWUPS_PER_INTENT:",
  ANALYZER_MAX_FOLLOWUPS,
  ENV_MAX_FOLLOWUPS ? "(from env)" : INFERRED_MAX_FOLLOWUPS ? "(inferred from source)" : "(default)"
);
console.log("");

console.log("QUESTION_BANK keys:", bankKeys.length);
console.log("");

console.log(
  "runFollowupFlow definitions:",
  runFollowupFlowDefCount,
  runFollowupFlowDefCount > 1 ? " <-- DUPLICATE (BUG)" : ""
);
console.log("");

//Note: runFollowupFlow gebruikt geen switch/case; coverage wordt bepaald door REQUIRED_SLOTS/FLOW.//

console.log("runFollowupFlow cases:", runFollowupCases.length ? runFollowupCases.join(", ") : "NONE");
console.log("");

console.log("Fallback keys present:", hasFallback ? fallbackKeys.join(", ") : "NONE (hard dead-ends become possible)");
console.log("");

// ---- LEX status + hit counts ----
if (!lexIntents.length) {
  console.log("LEX intents: Not found / parse failed");
  console.log("");
} else {
  console.log("LEX intents:", lexIntents.join(", "));
  console.log("");

  if (lexPriority.length) {
    console.log("LEX intentPriority:", lexPriority.join(", "));
    console.log("");
  }

  console.log("LEX intents keyword counts:");
  for (const intent of Object.keys(lexStats).sort()) {
    const s = lexStats[intent];
    console.log(` - ${intent}: total=${s.total}, unique=${s.unique}`);
  }
  console.log("");
  console.log("LEX totals (sum per intent; unique is per intent, not global):");
  console.log("LEX total keywords:", lexTotalAll);
  console.log("LEX unique (per intent summed):", lexUniqueSum);
  console.log("");
}

if (issues.hardDeadEnds.length) {
  console.log("HARD DEAD-ENDS (no combined keys + no fallback):");
  for (const s of issues.hardDeadEnds) console.log(" -", s);
  console.log("");
} else {
  console.log("HARD DEAD-ENDS: none");
  console.log("");
}

if (issues.softDeadEnds.length) {
  console.log("SOFT DEAD-ENDS (combined=0 -> fallback generic question):");
  for (const s of issues.softDeadEnds) console.log(" -", s);
  console.log("");
} else {
  console.log("SOFT DEAD-ENDS: none");
  console.log("");
}

if (issues.gaps.length) {
  console.log("COVERAGE GAPS:");
  for (const s of uniq(issues.gaps)) console.log(" -", s);
  console.log("");
} else {
  console.log("COVERAGE GAPS: none");
  console.log("");
}

if (issues.missingInBank.length) {
  console.log("MISSING KEYS IN QUESTION_BANK (referenced by REQUIRED_SLOTS/FLOW):");
  for (const s of uniq(issues.missingInBank)) console.log(" -", s);
  console.log("");
} else {
  console.log("MISSING KEYS IN QUESTION_BANK: none");
  console.log("");
}

if (issues.max2Risk.length) {
  console.log("MAX FOLLOWUP RISK (not a bug, but explains incomplete intakes):");
  for (const s of uniq(issues.max2Risk)) console.log(" -", s);
  console.log("");
}

console.log("Done.");
