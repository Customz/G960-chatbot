"use strict";

const fs = require("fs");
const path = require("path");

const FILE = process.argv[2] || "index.js";
const src = fs.readFileSync(path.resolve(FILE), "utf8");

// ======================
// Balanced-block extractors (fixes regex truncation issues)
// ======================
function findIndexAfterRx(s, rx, from = 0) {
  const m = rx.exec(s.slice(from));
  if (!m) return -1;
  return from + m.index + m[0].length;
}

function extractBalancedFrom(s, openIdx, openCh = "{", closeCh = "}") {
  if (openIdx < 0 || openIdx >= s.length) return null;
  if (s[openIdx] !== openCh) {
    // find first openCh at/after openIdx
    openIdx = s.indexOf(openCh, openIdx);
    if (openIdx === -1) return null;
  }

  let i = openIdx;
  let depth = 0;
  let inStr = null; // "'" | '"' | "`"
  let esc = false;

  for (; i < s.length; i++) {
    const c = s[i];

    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === inStr) { inStr = null; continue; }
      continue;
    }

    if (c === "'" || c === '"' || c === "`") { inStr = c; continue; }

    if (c === openCh) depth++;
    else if (c === closeCh) {
      depth--;
      if (depth === 0) {
        return s.slice(openIdx, i + 1);
      }
    }
  }
  return null;
}

function extractConstObjectLiteral(name) {
  // finds const NAME = { ...balanced... };
  const rx = new RegExp(`\\bconst\\s+${name}\\s*=\\s*`, "m");
  const after = findIndexAfterRx(src, rx, 0);
  if (after === -1) return null;

  const openIdx = src.indexOf("{", after);
  if (openIdx === -1) return null;

  const obj = extractBalancedFrom(src, openIdx, "{", "}");
  if (!obj) return null;

  // try to include trailing semicolon (optional)
  const end = openIdx + obj.length;
  const semi = src.slice(end).match(/^\s*;\s*/);
  const tail = semi ? semi[0] : "";
  return `const ${name} = ${obj}${tail}`;
}

function extractConstArrayLiteral(name) {
  // finds const NAME = [ ...balanced... ];
  const rx = new RegExp(`\\bconst\\s+${name}\\s*=\\s*`, "m");
  const after = findIndexAfterRx(src, rx, 0);
  if (after === -1) return null;

  const openIdx = src.indexOf("[", after);
  if (openIdx === -1) return null;

  const arr = extractBalancedFrom(src, openIdx, "[", "]");
  if (!arr) return null;

  const end = openIdx + arr.length;
  const semi = src.slice(end).match(/^\s*;\s*/);
  const tail = semi ? semi[0] : "";
  return `const ${name} = ${arr}${tail}`;
}

function extractFunctionBlock(fnName) {
  // extracts full "function fnName(...) { ... }" block with brace-balance
  const rx = new RegExp(`\\bfunction\\s+${fnName}\\b[\\s\\S]*?\\{`, "m");
  const m = rx.exec(src);
  if (!m) return null;

  // m[0] ends at first "{"
  const openIdx = m.index + m[0].lastIndexOf("{");
  const body = extractBalancedFrom(src, openIdx, "{", "}");
  if (!body) return null;

  // include "function ... {" prefix
  const prefix = src.slice(m.index, openIdx);
  return prefix + body;
}

function extractConstObjectInsideBlock(block, constName) {
  // within a given block, finds const constName = { ...balanced... };
  if (!block) return null;
  const rx = new RegExp(`\\bconst\\s+${constName}\\s*=\\s*`, "m");
  const after = findIndexAfterRx(block, rx, 0);
  if (after === -1) return null;

  const openIdx = block.indexOf("{", after);
  if (openIdx === -1) return null;

  const obj = extractBalancedFrom(block, openIdx, "{", "}");
  if (!obj) return null;

  return `const ${constName} = ${obj};`;
}

// ---------- helpers ----------
function countArrayItems(block) {
  // counts quoted strings inside the first [...] in block
  const m = block.match(/\[[\s\S]*?\]/);
  if (!m) return { total: 0, unique: 0, items: [] };
  const arr = m[0];
  const items = [];
  const rx = /"([^"]+)"|'([^']+)'/g;
  let mm;
  while ((mm = rx.exec(arr))) items.push((mm[1] || mm[2]).trim());
  const unique = new Set(items);
  return { total: items.length, unique: unique.size, items };
}

function extractQuestionBank() {
  // Prefer balanced object extraction
  const qb = extractConstObjectLiteral("QUESTION_BANK");
  return qb ? qb : null;
}

function extractRequiredSlots() {
  // REQUIRED_SLOTS is an object literal in your code
  const rs = extractConstObjectLiteral("REQUIRED_SLOTS");
  return rs ? rs : null;
}

function extractLexObject() {
  const lex = extractConstObjectLiteral("LEX");
  return lex ? lex : null;
}

function extractLexIntentsObjectBody() {
  // Extract LEX, then pull out intents: { ... } as balanced object
  const lexBlock = extractLexObject();
  if (!lexBlock) return null;

  // locate "intents:" inside LEX block
  const idx = lexBlock.search(/\bintents\s*:\s*\{/m);
  if (idx === -1) return null;

  const openIdx = lexBlock.indexOf("{", idx);
  const intentsObj = extractBalancedFrom(lexBlock, openIdx, "{", "}");
  if (!intentsObj) return null;

  return intentsObj; // just "{ ... }"
}

function extractIntentMapInsideIsDirect() {
  // FIX: old regex stopped at the first '}' inside the function.
  const fnBlock = extractFunctionBlock("isDirectIntentCommand");
  if (!fnBlock) return null;

  // intentMap is declared inside this function
  const intentMapBlock = extractConstObjectInsideBlock(fnBlock, "intentMap");
  return intentMapBlock ? intentMapBlock : null;
}

function extractTags() {
  // counts explicit respond(... { tag: "..." })
  const tags = [];
  const rx = /tag:\s*"([^"]+)"/g;
  let m;
  while ((m = rx.exec(src))) tags.push(m[1]);
  return { total: tags.length, unique: new Set(tags).size, tags: Array.from(new Set(tags)).sort() };
}

// ---------- QUESTION_BANK keys ----------
const qb = extractQuestionBank();
let qbKeys = [];
if (qb) {
  // keys at object top-level: key: { ... }
  const obj = qb.slice(qb.indexOf("{"));
  const rx = /^\s*([a-zA-Z0-9_]+)\s*:\s*\{/gm;
  let m;
  while ((m = rx.exec(obj))) qbKeys.push(m[1]);
}
qbKeys = Array.from(new Set(qbKeys));

// ---------- REQUIRED_SLOTS keys ----------
const rs = extractRequiredSlots();
let reqKeys = [];
if (rs) {
  const obj = rs.slice(rs.indexOf("{"));
  const rx = /"([^"]+)"/g;
  let m;
  while ((m = rx.exec(obj))) reqKeys.push(m[1]);
}
reqKeys = Array.from(new Set(reqKeys));

// ---------- LEX intent keywords ----------
const lexIntentsObj = extractLexIntentsObjectBody();
const intentKeywordStats = {};
if (lexIntentsObj) {
  // find each: intentName: [ ... ],
  const rx = /([a-z_]+)\s*:\s*\[[\s\S]*?\]\s*,?/gm;
  let m;
  while ((m = rx.exec(lexIntentsObj))) {
    const intent = m[1];
    const block = m[0];
    const { total, unique } = countArrayItems(block);
    intentKeywordStats[intent] = { total, unique };
  }
}

// ---------- intentMap (direct command) ----------
const im = extractIntentMapInsideIsDirect();
let intentMapKeys = [];
if (im) {
  const obj = im.slice(im.indexOf("{"));
  const rx = /"([^"]+)"\s*:\s*"([^"]+)"/g;
  let m;
  while ((m = rx.exec(obj))) intentMapKeys.push(m[1]);
}
intentMapKeys = Array.from(new Set(intentMapKeys));

// ---------- tags ----------
const tags = extractTags();

// ---------- reporting ----------
const qbSet = new Set(qbKeys);
const reqInBank = reqKeys.filter(k => qbSet.has(k));
const reqMissingInBank = reqKeys.filter(k => !qbSet.has(k));

console.log("==== BOT ANALYSE ====");
console.log("File:", FILE);
console.log("");

console.log("QUESTION_BANK keys:", qbKeys.length);
console.log(qbKeys.sort().join(", "));
console.log("");

console.log("REQUIRED_SLOTS unique keys:", reqKeys.length);
console.log("Required slots IN question bank:", reqInBank.length);
console.log("Required slots MISSING in bank:", reqMissingInBank.length);
if (reqMissingInBank.length) {
  console.log("Missing keys:", reqMissingInBank.sort().join(", "));
}
console.log("");

console.log("DIRECT INTENT MAP keys (isDirectIntentCommand):", intentMapKeys.length);
console.log("");

if (Object.keys(intentKeywordStats).length) {
  let totalAll = 0;
  let totalUniqueSum = 0;
  console.log("LEX intents keyword counts:");
  for (const k of Object.keys(intentKeywordStats).sort()) {
    const s = intentKeywordStats[k];
    console.log(`- ${k}: total=${s.total}, unique=${s.unique}`);
    totalAll += s.total;
    totalUniqueSum += s.unique;
  }
  console.log("");
  console.log("LEX totals (sum per intent; unique is per-intent, not global):");
  console.log("LEX total keywords:", totalAll);
  console.log("LEX unique (per intent summed):", totalUniqueSum);
  console.log("");
} else {
  console.log("LEX intents not found (pattern mismatch).");
}

console.log("Respond tags:", tags.total, "(unique:", tags.unique + ")");
if (tags.unique) console.log("Tags:", tags.tags.join(", "));
console.log("");

console.log("Approx unique reply templates >= unique tags + handlers without tags.");
console.log("Done.");
