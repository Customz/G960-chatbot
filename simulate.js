"use strict";

/**
 * Monte Carlo conversation simulator for your chatbot.
 *
 * Usage:
 *   node simulate.js index.js 1000 42
 *
 * Args:
 *   1) botPath  - path to your bot module (default ./index.js)
 *   2) N        - number of conversations (default 1000)
 *   3) seed     - RNG seed (default 42)
 *
 * Bot contract (preferred):
 *   module.exports.__simulateHandleMessage = async ({ message, sessionId }) => ({ text, followups?, actions?, ... })
 *
 * Fallback:
 *   exports a function directly, or has handleMessage/chat/etc.
 */

const path = require("path");

// ---------- config ----------
const BOT_PATH = process.argv[2] || "./index.js";
const N = Number(process.argv[3] || "1000");
const SEED = Number(process.argv[4] || "42");

// steps per convo cap
const MAX_TURNS = 25;

// loop thresholds
const MAX_SAME_TEXT_REPEAT = 3;  // same bot text repeated
const MAX_STATE_REPEAT = 4;      // same signature repeated

// dead-end heuristic
const DEAD_END_STAGNATION_TURNS = 3;

// ---------- RNG (seeded) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// ---------- load bot ----------
const botMod = require(path.resolve(BOT_PATH));

function resolveBotFn(mod) {
  // 1) best: dedicated simulator hook
  if (mod && typeof mod === "object" && typeof mod.__simulateHandleMessage === "function") {
    return mod.__simulateHandleMessage;
  }

  // 2) direct function export
  if (typeof mod === "function") return mod;

  // 3) common handler names
  const preferred = [
    "handleMessage", "chat", "handle", "handler", "webhook",
    "processMessage", "process", "run", "reply"
  ];

  if (mod && typeof mod === "object") {
    for (const k of preferred) {
      if (typeof mod[k] === "function") return mod[k];
    }
    // fallback: first function-valued export
    for (const [, v] of Object.entries(mod)) {
      if (typeof v === "function") return v;
    }
  }
  return null;
}

const BOT_FN = resolveBotFn(botMod);

if (typeof BOT_FN !== "function") {
  console.error("Bot exports no callable function for simulation.");
  console.error("Detected type:", typeof botMod);
  console.error("Detected keys:", botMod && typeof botMod === "object" ? Object.keys(botMod) : []);
  console.error("");
  console.error("Fix: export module.exports.__simulateHandleMessage in index.js (see instructions).");
  process.exit(1);
}

// ---------- Intent universe ----------
const INTENTS = [
  "glas", "remmen", "banden", "verlichting", "airco", "keuring",
  "diagnose", "motor_aandrijving", "onderstel", "elektrisch", "carrosserie", "onderhoud"
];

// ---------- User behavior model ----------
function userUtteranceForIntent(intent) {
  const starters = {
    onderhoud: ["onderhoud", "kleine beurt", "grote beurt", "service", "onderhoud nodig"],
    banden: ["banden", "nieuwe banden", "banden wisselen", "banden lek", "winterbanden"],
    remmen: ["remmen", "remmen piepen", "remmen trillen", "remblokken", "remschijven"],
    keuring: ["keuring", "keuring check", "voor keuring klaarmaken"],
    diagnose: ["diagnose", "storing", "motorlampje", "uitlezen", "foutcode"],
    glas: ["sterretje", "barst in ruit", "voorruit kapot", "ruit vervangen"],
    verlichting: ["koplamp kapot", "mistlamp", "remlicht stuk", "lampje vervangen"],
    airco: ["airco werkt niet", "airco bijvullen", "airco stinkt"],
    motor_aandrijving: ["koppeling slipt", "turbo probleem", "trilt bij gas", "aandrijving"],
    onderstel: ["bonk geluid", "draagarm", "speling", "ophanging"],
    elektrisch: ["accu leeg", "start niet", "elektrisch probleem", "zekering"],
    carrosserie: ["deuk", "krassen", "schade", "roest"]
  };
  return pick(starters[intent] || ["ik heb een probleem"]);
}

function maybeNoise() {
  const r = rnd();
  if (r < 0.10) return pick(["geen idee", "weet ik niet", "geen tijd", "maakt niet uit"]);
  if (r < 0.25) return pick(["lol", "ok", "?", "wat kost dat", "kan je bellen", "whatsapp"]);
  return null;
}

function answerForQuestion(botText) {
  const t = String(botText || "").toLowerCase();

  if (t.includes("personenauto") || t.includes("bedrijfswagen") || t.includes("oldtimer")) {
    return pick(["personenauto", "bedrijfswagen", "oldtimer"]);
  }
  if (t.includes("wanneer") || t.includes("moment") || t.includes("afspraak") || t.includes("beschikbaar")) {
    return pick(["morgen", "volgende week", "deze vrijdag", "maandag", "z.s.m."]);
  }
  if (t.includes("km") || t.includes("kilometer") || t.includes("kilometerstand")) {
    return String(50000 + Math.floor(rnd() * 250000));
  }
  if (t.includes("merk") || t.includes("model") || t.includes("motor")) {
    return pick(["VW Golf 5 1.9 TDI", "BMW 320d", "Audi A4 2.0 TDI", "Ford Transit 2.2 TDCI"]);
  }
  if (t.includes("bandenmaat") || t.includes("205") || t.includes("r")) {
    return pick(["205/55R16", "195/65R15", "225/45R17"]);
  }
  if (t.includes("wil je") || t.includes("is het") || /\bja\b|\bnee\b/.test(t)) {
    return pick(["ja", "nee", "ja graag"]);
  }
  return pick(["ok", "ik weet het niet", "kan je prijs geven", "het is dringend"]);
}

// ---------- signature helpers ----------
function stableSig(obj) {
  const intent = obj?.intent || obj?.data?.intent || "";
  const subtype = obj?.subtype || obj?.data?.subtype || "";
  const missingRaw = obj?.missing || obj?.data?.missing || obj?.slots_missing || [];
  const missing = Array.isArray(missingRaw) ? missingRaw.slice(0, 8) : [];
  const followups = obj?.followups || obj?.data?.followups || [];
  const actions = obj?.actions || obj?.data?.actions || [];
  
  const text = String(obj?.text || obj?.message || obj?.reply || obj?.output || "").slice(0, 80);
  return JSON.stringify({
    intent, subtype,
    missing,
    f: Array.isArray(followups) ? followups.length : 0,
    a: Array.isArray(actions) ? actions.length : 0,
    t: text
  });
}

function getBotText(resp) {
  return resp?.text || resp?.message || resp?.reply || resp?.output || "";
}

function getFollowups(resp) {
  const f = resp?.followups || resp?.data?.followups;
  return Array.isArray(f) ? f : [];
}
function getActions(resp) {
  const a = resp?.actions || resp?.data?.actions;
  return Array.isArray(a) ? a : [];
}

// ---------- run one conversation ----------
async function runOne(sessionId, intent) {
  const convo = {
    sessionId,
    intent,
    turns: 0,
    loop: false,
    deadEnd: false,
    loopReason: "",
    deadEndReason: "",
    signatures: [],
    botTexts: [],
  };

  let userMsg = userUtteranceForIntent(intent);
  let lastSig = null;
  let sameSigCount = 0;

  let lastBotText = null;
  let sameTextCount = 0;

  let stagnation = 0;

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    convo.turns = turn;

    let resp;
    try {
      resp = await BOT_FN({ message: userMsg, sessionId });
    } catch (e) {
      convo.deadEnd = true;
      convo.deadEndReason = "BOT_EXCEPTION: " + (e?.message || String(e));
      return convo;
    }

    const botText = getBotText(resp);
    convo.botTexts.push(botText);

    const sig = stableSig(resp);
    convo.signatures.push(sig);

    if (sig === lastSig) sameSigCount++;
    else { sameSigCount = 1; lastSig = sig; }

    if (sameSigCount >= MAX_STATE_REPEAT) {
      convo.loop = true;
      convo.loopReason = `STATE_REPEAT x${sameSigCount}`;
      return convo;
    }

    if (botText && botText === lastBotText) sameTextCount++;
    else { sameTextCount = 1; lastBotText = botText; }

    if (sameTextCount >= MAX_SAME_TEXT_REPEAT) {
      convo.loop = true;
      convo.loopReason = `TEXT_REPEAT x${sameTextCount}`;
      return convo;
    }

    const followups = getFollowups(resp);
    const actions = getActions(resp);
    // SUCCESS: bot provides actionable next step (treat as OK and stop)
if (
  actions.length > 0 ||
  /whatsapp|contact|intake|afspraak|https?:\/\//i.test(botText)
) {
  return convo; // OK
}


    const progressed = turn === 1 ? true : (sig !== convo.signatures[convo.signatures.length - 2]);
    const hasNext = followups.length > 0 || actions.length > 0 || /http|whatsapp|contact|afspraak|intake/i.test(botText);

    if (!progressed && !hasNext) stagnation++;
    else stagnation = 0;

    if (stagnation >= DEAD_END_STAGNATION_TURNS) {
      convo.deadEnd = true;
      convo.deadEndReason = `STAGNATION x${stagnation} (no progress, no next-step)`;
      return convo;
    }

    const noise = maybeNoise();
    if (noise) {
      userMsg = noise;
      continue;
    }

    if (followups.length && rnd() < 0.65) {
      userMsg = String(pick(followups));
      continue;
    }

    userMsg = answerForQuestion(botText);
  }

  convo.loop = true;
  convo.loopReason = "MAX_TURNS_REACHED";
  return convo;
}

// ---------- main ----------
(async function main() {
  const results = [];
  for (let i = 0; i < N; i++) {
    const intent = pick(INTENTS);
    const sessionId = `sim_${SEED}_${i}_${Math.floor(rnd() * 1e9)}`;
    // eslint-disable-next-line no-await-in-loop
    const r = await runOne(sessionId, intent);
    results.push(r);
  }

  const byIntent = {};
  const loopSigs = new Map();
  const deadSigs = new Map();

  let loops = 0, deadEnds = 0, ok = 0;

  for (const r of results) {
    if (!byIntent[r.intent]) byIntent[r.intent] = { n: 0, loops: 0, dead: 0, ok: 0, turns: 0 };
    const bucket = byIntent[r.intent];
    bucket.n++;
    bucket.turns += r.turns;

    if (r.loop) {
      loops++; bucket.loops++;
      const k = r.signatures[r.signatures.length - 1] || r.loopReason;
      loopSigs.set(k, (loopSigs.get(k) || 0) + 1);
    } else if (r.deadEnd) {
      deadEnds++; bucket.dead++;
      const k = r.signatures[r.signatures.length - 1] || r.deadEndReason;
      deadSigs.set(k, (deadSigs.get(k) || 0) + 1);
    } else {
      ok++; bucket.ok++;
    }
  }

  function topK(map, k = 20) {
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, k);
  }

  console.log("==== SIM REPORT ====");
  console.log("Bot:", BOT_PATH);
  console.log("Conversations:", N, "Seed:", SEED);
  console.log("");

  console.log("Summary:");
  console.log(" - OK:", ok);
  console.log(" - Loops:", loops);
  console.log(" - Dead-ends:", deadEnds);
  console.log("");

  console.log("Per intent:");
  for (const intent of Object.keys(byIntent).sort()) {
    const b = byIntent[intent];
    const avgTurns = (b.turns / b.n).toFixed(2);
    console.log(` - ${intent}: n=${b.n} ok=${b.ok} loops=${b.loops} dead=${b.dead} avgTurns=${avgTurns}`);
  }
  console.log("");

  console.log("Top loop signatures:");
  for (const [sig, c] of topK(loopSigs, 20)) console.log(" -", c, sig);
  console.log("");

  console.log("Top dead-end signatures:");
  for (const [sig, c] of topK(deadSigs, 20)) console.log(" -", c, sig);
  console.log("");

  console.log("Done.");
})().catch((e) => {
  console.error("SIM FAILED:", e);
  process.exit(1);
});
