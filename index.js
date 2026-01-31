"use strict";

const express = require("express");
const cors = require("cors");
const { Firestore, Timestamp } = require("@google-cloud/firestore");
const pricing = require("./pricing.loader");

const LOG_LEVEL = (process.env.LOG_LEVEL || "info").toLowerCase();
const MAX_MESSAGE_CHARS = Number(process.env.MAX_MESSAGE_CHARS || 800);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 30);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || (5 * 60 * 1000));
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 90);

// ====== Config ======
const ALLOWED_ORIGINS = [
  "https://www.garage-960.com",
  "https://garage-960.com",
];

// ====== Lexicon: voertuig categorie + rubrieken (intents) ======
const LEX = {
  oldtimerWords: [
    "oldtimer", "klassieker", "klassiek", "classic", "classic car", "youngtimer",
    "veteran", "veteranenvoertuig",
    "ancêtre", "ancetre", "ancien", "collectors", "collector",
    "historisch", "museumstaat"
  ],

  bedrijfsWords: [
    "bedrijfswagen", "bestelwagen", "bestel", "lichte vracht",
    "camper", "motorhome", "mobilhome",
    "takelwagen", "depannage", "bergingswagen", "flatbed",
    "bakwagen", "kipper", "kraanwagen", "koelwagen",
    "servicewagen", "werkbus", "leasebus",
    "pakketdienst", "koerier", "koeriersdienst",
    "dubbele cabine", "dubbelcabine",
    "laadruimte", "laadbak", "laadvloer",
    "laadklep", "lift", "hydraulische lift"
  ],

  bedrijfsWordsSoft: [
    "busje", "van", "bus"
  ],

  personenWords: [
    "personenauto", "personenwagen",
    "gezinswagen", "berline", "sedan", "hatchback",
    "break", "station", "stationwagen",
    "cabrio", "cabriolet", "roadster",
    "coupe", "coupé",
    "suv", "crossover", "mpv", "monovolume"
  ],

  bedrijfsModels: [
    "sprinter", "vito", "viano", "citan",
    "transit", "transit custom", "tourneo custom", "transit connect",
    "crafter", "lt",
    "transporter", "caravelle", "multivan", "california", "caddy",
    "t1", "t2", "t3", "t4", "t5", "t6", "t6.1",
    "ducato", "jumper", "boxer",
    "expert", "jumpy", "scudo",
    "talento",
    "movano", "vivaro", "combo",
    "master", "trafic", "kangoo",
    "nv200", "nv300", "nv400", "townstar",
    "berlingo", "partner", "doblo",
    "hiace", "proace", "proace city",
    "iveco daily", "daily",
    "canter", "atego",
    "pickup", "pick-up", "pick up",
    "l1", "l2", "l3", "l4", "h1", "h2", "h3"
  ],

  dualUseModels: [
    "berlingo", "partner", "doblo", "kangoo", "caddy",
    "tourneo", "combo", "proace city"
  ],

  personenModels: [
    "golf", "polo", "passat", "tiguan", "touran",
    "a1", "a3", "a4", "a6", "q3", "q5",
    "octavia", "superb", "fabia",
    "ibiza", "leon",
    "1 serie", "3 serie", "5 serie", "x1", "x3", "x5",
    "a-klasse", "b-klasse", "c-klasse", "e-klasse", "glc",
    "fiesta", "focus", "mondeo", "kuga",
    "corsa", "astra", "insignia", "mokka",
    "clio", "megane", "scenic", "captur",
    "208", "308", "3008", "508",
    "c3", "c4", "c5",
    "yaris", "corolla", "rav4",
    "civic", "cr-v",
    "i20", "i30", "tucson",
    "ceed", "sportage",
    "model 3", "model s", "model y"
  ],

  intents: {
    glas: [
      "ruit","ruiten","autoruit","auto ruit","glas","raam","ramen",
      "voorruit","achterruit","zijruit","kwart ruit","kwart-ruit","driehoek ruit","driehoek-ruit","ruitje","ruitglas",
      "portierraam","deurraam","raam in deur","achterruitraam",
      "steenslag","steen slag","steenslagje","sterretje","ster","ster in ruit","ster in voorruit",
      "barst","barsten","gebarsten","gebars","scheur","scheuren","crack",
      "kras","krassen","krasje","krasjes","putje","putjes","pit","pitjes",
      "chip","chipje","inslag","impact","spinnenweb","spiderweb",
      "glas gebroken","glasbreuk","gebroken ruit","ruit gebroken","ruit kapot",
      "ruitschade","ruitschade herstellen","ruit herstellen","ruit repareren",
      "ruit vervangen","voorruit vervangen","achterruit vervangen","zijruit vervangen",
      "sterretje vullen","vullen sterretje","hars vullen","harsinjectie","injectie hars",
      "ingeslagen ruit","ruit ingeslagen","ruit ingetikt","raam ingetikt","autoinbraak","diefstal",
      "glas ligt in auto","glasscherven","scherven",
      "ruitenwisser","ruitenwissers","wisser","wissers","wisserblad","wisserbladen","wisserarm",
      "wisser krast","ruitenwisser krast","wisserstrepen","streepvorming","wisser trekt strepen",
      "ruit lekt","water via ruit","water in auto via ruit","windgeruis ruit",
      "ruitrubber","raamrubber","afdichting ruit","kitrand ruit","ruit los","losse ruit",
      "beslagen ruit","condens ruit","vocht tussen glas",
      "camera in voorruit","regensensor","regen sensor","adas","hud",
      "verwarmde voorruit","voorruit verwarming","achterruit verwarming","antenne in ruit"
    ],

    remmen: [
      "rem","remmen","remprobleem","remkracht","remdruk",
      "remblokken","blokjes","remschijven","remklauw","remklauwen","remzuiger",
      "rempomp","hoofdremcilinder","abs pomp",
      "remleiding","remleidingen","remslang","remslangen",
      "remvloeistof","remolie","dot4","dot 4","dot5.1","dot 5.1",
      "ontluchten","remmen ontluchten","lucht in remmen",
      "handrem","parkeerrem","elektrische handrem","handremkabel","handremkabels",
      "abs","esp","asr","tractiecontrole","brake assist",
      "piept","piepen","schuurt","schuren","schrapen","metaal op metaal","ijzer op ijzer",
      "trilt bij remmen","trilling remmen","pedaal trilt","stuur trilt bij remmen",
      "pedaal zakt","pedaal zakt weg","sponsachtig","sponzig","lang pedaal","hard pedaal",
      "remt slecht","weinig remkracht","geen remdruk",
      "trekt bij remmen","trekt links bij remmen","trekt rechts bij remmen",
      "rem blijft hangen","rem loopt aan","rem loopt vast","vastzittende rem",
      "remmen heet","wiel warm","remmen roken","brandlucht",
      "remlampje","rem lampje","handremlampje","brake warning",
      "abs lampje","abs storing","esp lampje","esp storing"
    ],

    banden: [
      "band","banden","autoband","autobanden",
      "winterband","winter banden","zomerband","zomer banden",
      "allseason","all season","all-season","vier seizoenen","4season","allweather","all weather",
      "runflat","run flat","reservewiel","thuiskomer",
      "velg","velgen","wiel","wielen","bandenmaat","banden maat","profiel","profiel diepte","dot","dot code",
      "lekke band","band lek","platte band","band plat","loopt leeg","loopt langzaam leeg",
      "spijker in band","schroef in band","nagel in band",
      "ventiel lekt","ventielkern","tpms","bandenspanning","bandenspanning lampje","drukverlies","druk te laag",
      "cupping","zaagtand","onregelmatige slijtage","scheef afgesleten","flatspot",
      "bult","bubbel","band ei","slag in band",
      "droogtescheuren","scheur in band","cracks",
      "canvas zichtbaar","koord zichtbaar",
      "balanceren","uitbalanceren","balanceer","loodjes",
      "uitlijnen","uitlijning","sporing",
      "banden wisselen","wielen wisselen","wielwissel",
      "banden montage","banden monteren","banden vervangen","nieuwe banden","set banden",
      "banden opslag","bandenhotel",
      "banden plakken","plug","patch","vulcaniseren","reparatie band",
      "kromme velg","velg krom","stoeprandschade",
      "velg lekt","corrosie velg","oxidatie velg","scheur in velg",
      "wielbout","wielbouten","wielmoer","wielmoeren"
    ],

    verlichting: [
      "verlichting","licht","lamp","lampen",
      "koplamp","koplampen","voorlicht","dimlicht","grootlicht","stadslicht","standlicht",
      "mistlamp","mistlicht","dagrijlicht","drl",
      "knipperlicht","pinkers","richtingaanwijzer",
      "achterlicht","remlicht","derde remlicht","kentekenverlichting",
      "dashboardverlichting","instrumentverlichting","interieurverlichting",
      "xenon","bi-xenon","led","halogeen","h4","h7","h1","h11","d1s","d2s","d3s",
      "lampbewaking","check control","bulb failure","canbus","can-bus",
      "lamp kapot","lamp stuk","licht kapot","licht stuk",
      "koplamp kapot","koplamp stuk","koplamp werkt niet","licht werkt niet",
      "knipperlicht werkt niet","remlicht werkt niet",
      "flikkert","knippert","brandt zwak","zwak licht",
      "foutmelding lamp","lamp defect melding","lampmelding",
      "koplamp beslagen","condens in koplamp","water in koplamp","vocht in koplamp","koplamp lekt",
      "dof","doffe koplamp","koplamp dof","koplampen dof",
      "lens dof","doffe lens","koplamp lens","koplampglas","koplamp glas","vergeeld","geel geworden","oxidatie koplamp",
      "polijsten","polieren","schuren en polijsten","koplamp renovatie","uv coating","uv-coating","clearcoat",
      "koplamp afstellen","koplampen afstellen","lichtbeeld","schijnt te laag","schijnt te hoog",
      "zekering licht","relais licht","slechte massa","stekker licht","connector licht","kabelbreuk licht"
    ],

    airco: [
      "airco","airconditioning","a/c","ac","klimaat","climatronic","klimaatregeling",
      "airco service","aircoservice","airco onderhoud",
      "koelt niet","wordt niet koud","blaast warm","blaast lauw","geen koude lucht","koelt slecht",
      "stinkt","vieze geur","muffe geur",
      "ramen beslaan","ontwasemen slecht","water in passagiersvoetruimte","airco drain verstopt",
      "airco vullen","airco bijvullen","koudemiddel","aircogas","r134a","r1234yf",
      "druk te laag","druk weg","verliest gas",
      "lekkage airco","condensor","aircocondensor","compressor","aircocompressor",
      "filterdroger","expansieventiel","verdamper","aircoleiding","o-ring",
      "compressor koppelt niet","airco slaat niet aan","ac knop","a/c knop",
      "blower doet niks","kachelventilator doet niks","koelventilator slaat niet aan",
      "airco kapot","airco werkt niet","airco storing"
    ],

    keuring: [
      "keuring","autokeuring","technische keuring","keuringsstation","apk",
      "voor keuring","klaar voor keuring","keuringsklaar","keuringcheck",
      "afgekeurd","afkeur","herkeuring",
      "rode kaart","groene kaart","verboden tot verkeer","beperkte geldigheid",
      "code 1","code 2","code 3","code 4","code 5",
      "code1","code2","code3","code4","code5",
      "roetmeting","roettest","deeltjestest","emissie","co meting","uitlaatgas",
      "coc","gelijkvormigheidsattest","inschrijvingsbewijs","keuringsbewijs","car pass","carpass",
      "remmenbank","schokdempertest","bandenprofiel",
      "lichtbeeld slecht","koplamp afstellen",
      "sterretje voorruit","barst voorruit",
      "chassisnummer","vin nummer",
      "doorgeroest","roestgat",
      "trekhaak keuring","attest trekhaak"
    ],

    diagnose: [
      "diagnose","uitlezen","obd","obd2","computer uitlezen","ecu uitlezen",
      "foutcode","foutcodes","dtc","storing","storingen","foutmelding",
      "check engine","motorlamp","mil lamp","storingslampje","melding dashboard",
      "start niet","wil niet starten","startproblemen","lange start","koudstart","warmstart",
      "draait rond maar start niet","start wel maar valt uit","slaat meteen af",
      "startmotor","accu","batterij","dynamo","laadt niet","immobilizer","startonderbreker",
      "stotter","stottert","inhouden","hapert","schokt","schokken",
      "loopt slecht","loopt onregelmatig","stationair onrustig","onrustig stationair",
      "valt uit","slaat af","misfire","cilinder uitval","loopt op 3 cilinders",
      "geen vermogen","vermogensverlies","turbo weg","geen trekkracht","slap","noodloop","limp mode",
      "overboost","underboost","laaddruk","boost","luchtlek","inlaat lek","intercooler slang",
      "rook","zwarte rook","witte rook","blauwe rook","roet",
      "olieverbruik","olie verbruik","koelvloeistof verdwijnt","koelvloeistof verbruik",
      "oververhit","temperatuur loopt op","temperatuur stijgt","wordt te warm","kookt",
      "waterverlies","koelvloeistof","radiator","thermostaat","waterpomp","ventilator werkt niet",
      "egr","dpf","roetfilter","regeneratie","regenereert niet",
      "maf","luchtmassameter","map","map sensor","druk sensor","lambda","nox","nox sensor","sonde",
      "rammelt","tikt","tikken","bonkt","klopt","ratelt","fluit","giert","trilt","trillen"
    ],

    motor_aandrijving: [
      "distributieriem","distributie","timing belt","distributiekit",
      "waterpomp","spanrol","looprol",
      "koppeling","koppeling slipt","slipt","pakt hoog","koppelt slecht",
      "druklager","vliegwiel","dubbelmassa","dmf",
      "versnellingsbak","transmissie","automaat","dsg",
      "schakelt zwaar","schakelt niet","kraakt","springt uit versnelling","versnelling vliegt eruit",
      "bakolie lekt","bak lekt",
      "aandrijfas","homokineet","differentieel","cardan","tussenlager",
      "trilt bij optrekken","bonk bij schakelen"
    ],

    onderstel: [
      "onderstel","ophanging",
      "draagarm","fuseekogel","kogelgewricht",
      "wiellager","schokdemper","veren","veer gebroken",
      "stabilisator","koppelstang","bussen","rubbers",
      "speling","bonkt","klopt","rammelt",
      "zoemend","brommend","huilend",
      "trekt naar 1 kant","stuur trilt","stuur scheef",
      "stuurhuis","spoorstang","toplager"
    ],

    elektrisch: [
      "elektrisch","elektronica","module","regeleenheid","ecu",
      "accu leeg","accu plat","stroomlek","kortsluiting",
      "startrelais","dynamo","laadt niet",
      "zekering","zekeringen","relais",
      "massa","kabelbreuk","connector","stekker",
      "canbus",
      "centrale vergrendeling","raammotor",
      "dashboard dood","metercluster",
      "airbag lampje","airbag storing"
    ],

    carrosserie: [
      "carrosserie","plaatwerk","spuitwerk","lakwerk","spotrepair","schadeherstel","offerte",
      "deuk","deuken","parkeerschade","blikschade",
      "kras","krassen","krasje","schuurschade","schuurplek","lakschade",
      "roest","roestplek","roestplekken","roestvorming","roestgat","roestgaten","doorgeroest","dorpel rot",
      "bumper","bumpers","spatbord","deur","portier","motorkap","dak","achterklep",
      "dorpel","wielrand","wielkast"
    ],

    onderhoud: [
      "onderhoud","service","beurt","kleine beurt","klein onderhoud","grote beurt","groot onderhoud",
      "onderhoudsbeurt","periodiek onderhoud","jaaronderhoud","interval","onderhoudsinterval",
      "oliewissel","olie wissel","olie verversen","motorolie","oliefilter","olie filter","olie + filter","olie+filter",
      "luchtfilter","interieurfilter","pollenfilter","cabinefilter",
      "brandstoffilter","dieselfilter","benzinefilter",
      "bougies","gloeibougies",
      "multiriem","poly-v riem","v-riem","hulpriem",
      "distributie","distributieriem","distributiekit",
      "koelvloeistof verversen","antivries vervangen",
      "remvloeistof verversen","remvloeistof vervangen",
      "versnellingsbakolie verversen","bakolie verversen",
      "servo olie verversen",
      "service reset","reset service","service interval","onderhoudslampje reset"
    ]
  },

  intentPriority: [
    "glas",
    "remmen",
    "banden",
    "verlichting",
    "airco",
    "keuring",
    "diagnose",
    "motor_aandrijving",
    "onderstel",
    "elektrisch",
    "carrosserie",
    "onderhoud"
  ]
};

// ====== Smart follow-up engine (max 2 questions) ======
function normalizeYesNo(s) {
  const t = (s || "").toLowerCase();
  if (/(^|\b)(ja|jawel|yes|y|ok|zeker)\b/.test(t)) return "ja";
  if (/(^|\b)(nee|no|n|niet)\b/.test(t)) return "nee";
  return null;
}

function pickQuestion(bank, keyOrder, ctx) {
  for (const k of keyOrder) {
    if (!ctx.answered || ctx.answered[k] == null) return bank[k] || null;
  }
  return null;
}

function registerAnswer(ctx, qKey, userText) {
  if (!ctx) ctx = {};
  if (!ctx.answered) ctx.answered = {};

  const raw = (userText || "").trim();
  const yn = normalizeYesNo(raw);

  ctx.answered[qKey] = yn || raw;

  if (ctx.pendingQKey) delete ctx.pendingQKey;
  return ctx;
}

/**
 * Diagnose subtype mapping -> SUBTYPES DIE JE FLOW OOK KENT
 */
function detectDiagSubtype(text) {
  const t = norm(text || "");
  if (!t) return { subtype: null, confidence: 0, hits: [] };

  const tokens = t.split(/\s+/).filter(Boolean);
  const tokenSet = new Set(tokens);

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hasWord = (w) => {
    if (!w) return false;
    if (tokenSet.has(w)) return true;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${esc(w)}([^\\p{L}\\p{N}]|$)`, "iu");
    return re.test(t);
  };
  const hasAny = (arr) => arr.some((x) => (x.includes(" ") ? t.includes(x) : hasWord(x)));

  const K = {
    startprobleem: [
      "start niet","wil niet starten","slaat niet aan","startproblemen","start probleem",
      "draait rond maar start niet","start wel maar valt uit","slaat meteen af",
      "lange start","koudstart","warmstart",
      "klik","klikt","klikt alleen","tikt","startmotor","startrelais",
      "immobilizer","startonderbreker","sleutel herkent niet",
      "accu leeg","accu plat","batterij leeg","laadt niet","dynamo"
    ],
    onregelmatig: [
      "stotter","stottert","inhouden","hapert","schokt","schokken",
      "loopt slecht","loopt onregelmatig","onrustig stationair","stationair onrustig",
      "misfire","cilinder uitval","loopt op 3 cilinders","trilt stationair",
      "bokt","inhouding","inhouden bij gas"
    ],
    vermogen_turbo: [
      "geen vermogen","vermogensverlies","geen trekkracht","slap","traag",
      "noodloop","limp mode",
      "turbo","turbo weg","overboost","underboost","laaddruk","boost",
      "vacuüm lek","vacuum lek","onderdruk","drukslang","intercooler slang",
      "luchtlek","inlaat lek"
    ],
    lampje_code: [
      "motorlamp","check engine","mil lamp","storingslampje","lampje brandt",
      "foutcode","foutcodes","dtc","storing","storingen","foutmelding",
      "melding dashboard","service engine","engine light"
    ]
  };

  const scoreBank = (bank) => {
    let s = 0;
    const hits = [];
    for (const raw of bank) {
      const w = String(raw).trim();
      if (!w) continue;
      const matched = w.includes(" ") ? t.includes(w) : hasWord(w);
      if (matched) {
        hits.push(w);
        s += w.includes(" ") ? 3 : 1;
      }
    }
    return { s, hits };
  };

  const S = {
    startprobleem: scoreBank(K.startprobleem),
    vermogen_turbo: scoreBank(K.vermogen_turbo),
    onregelmatig: scoreBank(K.onregelmatig),
    lampje_code: scoreBank(K.lampje_code)
  };

  const order = ["startprobleem", "vermogen_turbo", "onregelmatig", "lampje_code"];
  const sorted = order
    .map((k) => ({ k, s: S[k].s }))
    .sort((a, b) => (b.s - a.s) || (order.indexOf(a.k) - order.indexOf(b.k)));

  const top = sorted[0];
  const second = sorted[1];

  if (!top || top.s <= 0) return { subtype: null, confidence: 0, hits: [] };

  const len = t.length;
  const shortPenalty = len < 10 ? 0.18 : len < 18 ? 0.10 : 0;
  const rawConf = (top.s - (second?.s || 0)) / Math.max(4, top.s);
  const confidence = Math.max(0, Math.min(1, rawConf - shortPenalty));

  if (top.k === "lampje_code") {
    if (S.startprobleem.s > 0)  return { subtype: "startprobleem", confidence: Math.max(confidence, 0.60), hits: [...S.lampje_code.hits, ...S.startprobleem.hits] };
    if (S.vermogen_turbo.s > 0) return { subtype: "vermogen_turbo", confidence: Math.max(confidence, 0.60), hits: [...S.lampje_code.hits, ...S.vermogen_turbo.hits] };
    if (S.onregelmatig.s > 0)  return { subtype: "onregelmatig", confidence: Math.max(confidence, 0.60), hits: [...S.lampje_code.hits, ...S.onregelmatig.hits] };
  }

  return { subtype: top.k, confidence, hits: S[top.k].hits };
}

// =========================
// QUESTION_BANK
// =========================
const QUESTION_BANK = {
  vehicle_brand_model: { key: "vehicle_brand_model", text: "Merk + model? (bv. Golf 6)" },
  vehicle_engine:      { key: "vehicle_engine", text: "Welke motor? (bv. 1.6 TDI / 2.0 HDI / benzine). Weet je het niet: stuur foto." },
  vehicle_year:        { key: "vehicle_year", text: "Bouwjaar of eerste inschrijving?" },
  vehicle_km:          { key: "vehicle_km", text: "Km-stand ongeveer?" },

  contact_when:        { key: "contact_when", text: "Wanneer kan je langskomen? (dag + tijd)" },
  contact_urgency:     { key: "contact_urgency", text: "Is dit dringend of veiligheidskritiek? (ja/nee)" },
  contact_whatsapp_ok: { key: "contact_whatsapp_ok", text: "Zal ik een WhatsApp-bericht voor je voorbereiden? (ja/nee)" },

  gen_when:       { key: "gen_when", text: "Wanneer treedt het probleem op? (koud/warm/constant/bij belasting)" },
  gen_noise:      { key: "gen_noise", text: "Hoor je geluid of voel je trilling? (ja/nee + kort)" },
  gen_warning:    { key: "gen_warning", text: "Brandt er een lampje/melding op het dashboard? (ja/nee + welk)" },
  symptom_where:  { key: "symptom_where", text: "Waar zit het probleem: voor/achter, links/rechts, welk wiel of kant?" },

  oh_type:         { key: "oh_type", text: "Welke beurt: klein, groot, olie+filter, of iets specifiek (bv. distributie)?" },
  oh_interval:     { key: "oh_interval", text: "Weet je het onderhoudsinterval? (vast/longlife/geen idee)" },
  oh_last_service: { key: "oh_last_service", text: "Wanneer was het laatste onderhoud ongeveer?" },

  tyre_task:      { key: "tyre_task", text: "Wat wil je: wissel, nieuwe banden, lek/plat, uitlijnen, balanceren?" },
  tyre_size:      { key: "tyre_size", text: "Bandenmaat? (bv. 205/55R16 of foto)" },
  tyre_pressure:  { key: "tyre_pressure", text: "Is het bandenspanningslampje aan? (ja/nee)" },
  tyre_location:  { key: "tyre_location", text: "Welke band/wiel is het probleem?" },

  keur_status:    { key: "keur_status", text: "Preventief of afgekeurd/herkeuring?" },
  keur_point:     { key: "keur_point", text: "Welk punt of code staat op het keuringsblad? (of foto)" },
  keur_deadline:  { key: "keur_deadline", text: "Tegen wanneer moet hij opnieuw gekeurd zijn?" },

  vl_symptom:           { key: "vl_symptom", text: "Wat is het probleem: lamp kapot, flikkert, foutmelding, doffe lens?" },
  vl_side:              { key: "vl_side", text: "Welke kant: links/rechts/beide?" },
  vl_koplens_condition: { key: "vl_koplens_condition", text: "Lens: enkel dof/geel of ook barsten/vocht?" },
  vl_type:              { key: "vl_type", text: "Welk licht: dimlicht, grootlicht, remlicht, knipperlicht, DRL?" },

  glas_where:     { key: "glas_where", text: "Welke ruit: voorruit/zijruit/achterruit?" },
  glas_damage:    { key: "glas_damage", text: "Sterretje of barst? (grootte ± cm)" },
  glas_adas:      { key: "glas_adas", text: "Heeft de voorruit camera/regensensor (ADAS)?" },

  car_where:      { key: "car_where", text: "Waar zit de schade precies? (deel + links/rechts)" },
  car_type:       { key: "car_type", text: "Wat is het: deuk, kras, roest, parkeerschade?" },
  car_size:       { key: "car_size", text: "Grootte: muntstuk / handpalm / A4 / groter?" },
  car_movable:    { key: "car_movable", text: "Kan het paneel nog bewegen of is het structureel?" },

  ac_symptom:     { key: "ac_symptom", text: "Koelt niet, stinkt, lawaai of valt uit?" },
  ac_lastfill:    { key: "ac_lastfill", text: "Wanneer laatst gevuld/geserviced? (jaar of geen idee)" },
  ac_fans:        { key: "ac_fans", text: "Slaan de ventilatoren aan bij airco? (ja/nee)" },

  diag_start_turns:{ key: "diag_start_turns", text: "Startmotor draait rond of enkel klik?" },
  diag_start_temp: { key: "diag_start_temp", text: "Vooral koudstart of warmstart?" },
  diag_when:       { key: "diag_when", text: "Wanneer treedt het probleem op? (accelereren/snelheid/toeren)" },
  diag_smoke:      { key: "diag_smoke", text: "Rook? (zwart/wit/blauw/geen)" },
  diag_mil:        { key: "diag_mil", text: "Brandt het motorlampje?" },
  diag_which:      { key: "diag_which", text: "Welke melding of foutcode? (of foto)" },
  diag_drive:      { key: "diag_drive", text: "Rijdt hij nog normaal of duidelijk vermogensverlies?" },

  brake_feel:     { key: "brake_feel", text: "Hoe voelt het pedaal: hard/zacht/zakt weg?" },
  brake_heat:     { key: "brake_heat", text: "Wordt een wiel/rem warm of ruik je brandlucht?" },
  brake_pull:     { key: "brake_pull", text: "Trekt de wagen bij remmen naar links/rechts?" },

  sus_noise_type: { key: "sus_noise_type", text: "Wat hoor je: bonken, kraken, tikken?" },
  sus_speed:      { key: "sus_speed", text: "Bij welke snelheid of situatie hoor je dit?" },

  elec_start:     { key: "elec_start", text: "Probleem bij starten, laden of tijdens rijden?" },
  elec_battery:   { key: "elec_battery", text: "Accu recent vervangen of leeg geweest?" },

  drv_clutch:     { key: "drv_clutch", text: "Slipt de koppeling of schakelt hij slecht?" },
  drv_noise:      { key: "drv_noise", text: "Geluid uit bak/aandrijving? (janken/bonken)" },

  contact_location:    { key: "contact_location", text: "Waar staat de wagen nu? (Bree/omgeving of exact dorp)" },
  contact_driveable:   { key: "contact_driveable", text: "Is hij nog rijdbaar of moet hij gesleept worden? (rijdbaar/slepen)" },
  contact_photos_ok:   { key: "contact_photos_ok", text: "Kan je 1-2 foto’s sturen? (dashboard + probleemzone) (ja/nee)" },

  oh_oil_leak:         { key: "oh_oil_leak", text: "Zie je olielek of verbruik? (ja/nee)" },
  oh_service_light:    { key: "oh_service_light", text: "Brandt er een service/onderhoud melding? (ja/nee)" },
  oh_usage:            { key: "oh_usage", text: "Gebruik: veel korte ritten, snelweg, of gemengd?" },

  tyre_tread:          { key: "tyre_tread", text: "Hoeveel profiel ongeveer? (mm of ‘bijna kaal/ok’)" },
  tyre_vibration_speed:{ key: "tyre_vibration_speed", text: "Trilling: vanaf welke snelheid? (bv. 90-120)" },
  tyre_recent_change:  { key: "tyre_recent_change", text: "Recent banden/velgen gewisseld of geraakt? (ja/nee)" },

  brake_noise:         { key: "brake_noise", text: "Hoor je piepen/schuren/bonken bij remmen? (welk)" },
  brake_warning_light: { key: "brake_warning_light", text: "Rem/ABS/ESP lampje aan? (welk)" },
  brake_recent_work:   { key: "brake_recent_work", text: "Recent iets aan remmen gedaan? (ja/nee + wat)" },

  vl_moisture:         { key: "vl_moisture", text: "Zit er vocht/condens in de lampunit? (ja/nee)" },
  vl_after_change:     { key: "vl_after_change", text: "Begon het na lamp vervangen/werk? (ja/nee)" },
  vl_bulb_type:        { key: "vl_bulb_type", text: "Halogeen/xenon/LED (of ‘geen idee’)?" },

  elec_dash_dead:      { key: "elec_dash_dead", text: "Valt dashboard/radio/verlichting volledig uit? (ja/nee)" },
  elec_charge_light:   { key: "elec_charge_light", text: "Accu/laadlampje aan tijdens rijden? (ja/nee)" },
  elec_aftermarket:    { key: "elec_aftermarket", text: "Aftermarket dingen: radio, alarmsysteem, trekhaak, versterker? (ja/nee)" },

  drv_vibration:       { key: "drv_vibration", text: "Trilt hij bij optrekken of in een bepaalde versnelling? (welke)" },
  drv_shift_issue:     { key: "drv_shift_issue", text: "Gaat hij moeilijk in versnelling of kraakt hij? (ja/nee)" },
  drv_leak:            { key: "drv_leak", text: "Zie je olie onder motor/bak/assen? (ja/nee)" },

  diag_powerloss:      { key: "diag_powerloss", text: "Is het vooral vermogensverlies, stotteren, of afslaan? (kies 1)" },
  diag_idle:           { key: "diag_idle", text: "Stationair: schommelt hij of loopt hij mooi? (schommelt/mooi)" },
  diag_recent_work:    { key: "diag_recent_work", text: "Is er recent iets vervangen/gesleuteld? (ja/nee + wat)" },

  keur_emissions:      { key: "keur_emissions", text: "Gaat het over emissies/rookmeting? (ja/nee)" },
  keur_mods:           { key: "keur_mods", text: "Zijn er aanpassingen: verlaging, uitlaat, tint, LED, ...? (ja/nee)" }
};

// =========================
// REQUIRED_SLOTS (as-is)
// =========================
const REQUIRED_SLOTS = {
  diagnose: [
    "vehicle_brand_model","vehicle_engine",
    "diag_when","diag_mil",
    "contact_driveable","contact_when"
  ],
  onderhoud: [
    "vehicle_brand_model","vehicle_engine","vehicle_year","vehicle_km",
    "oh_type","oh_last_service","oh_interval",
    "contact_when"
  ],
  banden: [
    "vehicle_brand_model","vehicle_engine",
    "tyre_task","tyre_size","tyre_location",
    "contact_urgency","contact_when"
  ],
  remmen: [
    "vehicle_brand_model","vehicle_engine",
    "brake_feel","brake_warning_light","brake_pull",
    "contact_urgency","contact_when"
  ],
  keuring: [
    "vehicle_brand_model","vehicle_engine","vehicle_year","vehicle_km",
    "keur_status","keur_point","keur_deadline",
    "contact_when"
  ],
  airco: [
    "vehicle_brand_model","vehicle_engine",
    "ac_symptom","ac_fans","ac_lastfill",
    "contact_when"
  ],
  verlichting: [
    "vehicle_brand_model","vehicle_engine",
    "vl_type","vl_side","vl_moisture",
    "contact_when"
  ],
  glas: [
    "vehicle_brand_model","vehicle_engine",
    "glas_where","glas_damage","glas_adas",
    "contact_when"
  ],
  carrosserie: [
    "vehicle_brand_model",
    "car_where","car_type","car_size","car_movable",
    "contact_when"
  ],
  onderstel: [
    "vehicle_brand_model","vehicle_engine",
    "sus_noise_type","sus_speed","symptom_where",
    "contact_when"
  ],
  elektrisch: [
    "vehicle_brand_model","vehicle_engine",
    "elec_start","elec_charge_light",
    "contact_when"
  ],
  motor_aandrijving: [
    "vehicle_brand_model","vehicle_engine",
    "drv_clutch","drv_shift_issue","drv_vibration",
    "contact_when"
  ]
};

// =========================
// runFollowupFlow (UPDATED: per-intent caps + default cap=6 + safe flow fallback)
// =========================
function runFollowupFlow(intent, subtype, ctx) {
  if (!ctx) ctx = {};
  if (!ctx.askedCount) ctx.askedCount = {};
  if (!ctx.answered) ctx.answered = {};
  if (!ctx._askedKeys) ctx._askedKeys = {};

  const intentChanged = (ctx._lastIntent !== intent);
  const subtypeChanged = (intent === "diagnose" && ctx._lastSubtype !== subtype);

  if (intentChanged || subtypeChanged) {
    ctx.askedCount[intent] = 0;
    ctx._askedKeys[intent] = {};
  }

  ctx._lastIntent = intent;
  ctx._lastSubtype = subtype;

  const DEFAULT_MAX_FOLLOWUPS = Number(process.env.MAX_FOLLOWUPS_PER_INTENT || 6);
  const MAX_FOLLOWUPS_BY_INTENT = { airco: 0 };

  const maxForIntent =
    Object.prototype.hasOwnProperty.call(MAX_FOLLOWUPS_BY_INTENT, intent)
      ? Number(MAX_FOLLOWUPS_BY_INTENT[intent])
      : DEFAULT_MAX_FOLLOWUPS;

  const alreadyAsked = Number(ctx.askedCount[intent] || 0);
  if (alreadyAsked >= maxForIntent) return { done: true };

  const FLOW = {
    diagnose: {
      startprobleem: ["diag_start_turns", "diag_start_temp", "diag_recent_work"],
      onregelmatig:  ["diag_idle", "diag_mil", "diag_recent_work"],
      vermogen_turbo:["diag_when", "diag_smoke", "diag_powerloss"],
      lampje_code:   ["diag_which", "diag_mil", "diag_drive"],
      default:       ["diag_when", "diag_mil", "diag_powerloss"]
    },
    onderhoud: { default: ["oh_type", "oh_last_service", "oh_interval", "oh_oil_leak", "oh_service_light", "oh_usage"] },
    banden:    { default: ["tyre_task", "tyre_location", "tyre_size", "tyre_pressure", "tyre_tread", "tyre_recent_change", "tyre_vibration_speed"] },
    remmen:    { default: ["brake_feel", "brake_warning_light", "brake_noise", "brake_pull", "brake_heat", "brake_recent_work"] },
    keuring:   { default: ["keur_status", "keur_point", "keur_deadline", "keur_emissions", "keur_mods"] },
    verlichting:{ default:["vl_type", "vl_side", "vl_symptom", "vl_moisture", "vl_after_change", "vl_bulb_type", "vl_koplens_condition"] },
    glas:      { default: ["glas_where", "glas_damage", "glas_adas", "contact_photos_ok"] },
    carrosserie:{ default:["car_where", "car_type", "car_size", "car_movable", "contact_photos_ok"] },
    onderstel: { default: ["sus_noise_type", "sus_speed", "symptom_where"] },
    elektrisch:{ default: ["elec_start", "elec_charge_light", "elec_dash_dead", "elec_battery", "elec_aftermarket"] },
    motor_aandrijving:{ default:["drv_clutch", "drv_shift_issue", "drv_vibration", "drv_noise", "drv_leak"] }
  };

  const inBank = (k) => !!(k && QUESTION_BANK && QUESTION_BANK[k] && QUESTION_BANK[k].text);

  const hasAnswered = (k) => {
    if (!k) return false;
    if (!Object.prototype.hasOwnProperty.call(ctx.answered, k)) return false;
    const v = ctx.answered[k];
    return v !== null && v !== undefined && String(v).trim().length > 0;
  };

  const req = (REQUIRED_SLOTS && REQUIRED_SLOTS[intent]) ? REQUIRED_SLOTS[intent] : [];
  const missingBase = req.filter(k => !hasAnswered(k)).filter(inBank);

  const intentFlow = FLOW[intent] || null;
  const orderRaw = intentFlow
    ? ((intent === "diagnose")
        ? (intentFlow[subtype] || intentFlow.default || [])
        : (intentFlow.default || []))
    : [];

  const order = orderRaw.filter(inBank);

  const combined = [];
  for (const k of missingBase) combined.push(k);
  for (const k of order) if (!combined.includes(k)) combined.push(k);

  const isContactKey = (k) => typeof k === "string" && k.startsWith("contact_");
  const reorderDeprioritizeContact = (keys) => {
    const tech = [];
    const contact = [];
    for (const k of keys) (isContactKey(k) ? contact : tech).push(k);
    return tech.concat(contact);
  };
  const combinedOrdered = reorderDeprioritizeContact(combined);

  const askedSet = ctx._askedKeys[intent] || (ctx._askedKeys[intent] = {});
  const pickNextKey = (keys) => {
    for (const k of keys) {
      if (!k) continue;
      if (!inBank(k)) continue;
      if (hasAnswered(k)) continue;
      if (askedSet[k]) continue;
      return k;
    }
    return null;
  };

  const fallbackKeys = ["gen_when", "gen_warning", "gen_noise"].filter(inBank);
  const keysToUse = combinedOrdered.length ? combinedOrdered : fallbackKeys;

  let candidate = null;
  if (typeof pickQuestion === "function") {
    const q = pickQuestion(QUESTION_BANK, keysToUse, ctx);
    if (q && q.key) candidate = q.key;
  }

  const finalKey =
    (candidate && inBank(candidate) && !askedSet[candidate] && !hasAnswered(candidate))
      ? candidate
      : pickNextKey(keysToUse);

  if (!finalKey) return { done: true };

  askedSet[finalKey] = true;
  ctx.askedCount[intent] = alreadyAsked + 1;

  return { done: false, question: QUESTION_BANK[finalKey] };
}

// ====== App / DB ======
const app = express();
app.use(express.json({ limit: "1mb" }));

app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked"), false);
    },
    methods: ["GET","POST","OPTIONS"],
    allowedHeaders: ["Content-Type","Authorization","X-Requested-With"],
    maxAge: 86400
  })
);

// ====== Basic rate limit (in-memory; best-effort) ======
const _rl = new Map();
function rateLimitKey(req) {
  const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
    .toString()
    .split(",")[0]
    .trim();
  const sid = (req.body?.sessionId || "").toString().trim();
  return `${ip}::${sid || "noSid"}`;
}
function rateLimit(req, res, next) {
  const key = rateLimitKey(req);
  const now = Date.now();
  const e = _rl.get(key) || { n: 0, start: now };
  if (now - e.start > RATE_LIMIT_WINDOW_MS) { e.n = 0; e.start = now; }
  e.n += 1;
  _rl.set(key, e);
  if (e.n > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: "Rate limit" });
  }
  return next();
}

const db = new Firestore();
const SESSIONS = db.collection("chat_sessions");

// ====== Helpers ======
function shouldEarlyExit(sessionObj) {
  const intent = sessionObj?.state?.intent;
  if (!intent) return false;

  const asked = sessionObj?.state?.ctx?.askedCount?.[intent] || 0;
  if (asked < MAX_FOLLOWUPS_PER_INTENT) return false;

  const missing = computeMissing(sessionObj);
  return missing.length > 0;
}


function hashReply(s) {
  const t = safeText(s);
  let h = 0;
  for (let i = 0; i < t.length; i++) h = ((h << 5) - h) + t.charCodeAt(i);
  return String(h >>> 0);
}

function buildUltraShortFailsafe() {
  return (
    "Kies 1:\n" +
    "• onderhoud • diagnose • remmen • banden • keuring • verlichting • airco • ruit\n\n" +
    "Daarna: personenauto/bedrijfswagen/oldtimer + merk/model (optioneel)."
  );
}

function nowIso() {
  return new Date().toISOString();
}

function safeText(x) {
  return (x || "").toString().trim();
}

function euro(n) {
  const v = Math.round(Number(n) || 0);
  return `€${v}`;
}

function norm(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[\u2019’]/g, "'")
    .replace(/[^a-z0-9\s\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(textNorm, arr) {
  return arr.some((k) => textNorm.includes(k));
}

function looksLikeVehicleMention(text) {
  return /\b(iveco|daily|sprinter|vito|transit|ducato|jumper|boxer|crafter|lt|transporter|caddy|t1|t2|t3|t4|t5|t6|master|trafic|vivaro|movano|kangoo|berlingo|partner|doblo|hiace)\b/i.test(text);
}

function detectCategory(text) {
  const t = norm(text);

  if (hasAny(t, LEX.oldtimerWords)) return "oldtimer";
  if (hasAny(t, LEX.bedrijfsWords)) return "bedrijfswagen";
  if (hasAny(t, LEX.personenWords)) return "personenauto";
  if (hasAny(t, LEX.bedrijfsModels)) return "bedrijfswagen";
  if (hasAny(t, LEX.personenModels)) return "personenauto";
  return null;
}

// =====================
// INTENT MAP (single source of truth)
// =====================
const INTENT_MAP = {
  "onderhoud": "onderhoud",
  "service": "onderhoud",
  "beurt": "onderhoud",
  "klein onderhoud": "onderhoud",
  "groot onderhoud": "onderhoud",
  "oliewissel": "onderhoud",
  "olie wisselen": "onderhoud",
  "olie verversen": "onderhoud",
  "olie + filter": "onderhoud",
  "oliefilter": "onderhoud",
  "luchtfilter": "onderhoud",
  "brandstoffilter": "onderhoud",
  "dieselfilter": "onderhoud",
  "interieurfilter": "onderhoud",
  "pollenfilter": "onderhoud",
  "bougies": "onderhoud",
  "gloeibougies": "onderhoud",
  "vloeistoffen": "onderhoud",
  "remvloeistof": "onderhoud",
  "koelvloeistof": "onderhoud",
  "coolant": "onderhoud",
  "antivries": "onderhoud",
  "riem": "onderhoud",
  "distributieriem": "onderhoud",
  "distributie": "onderhoud",
  "multiriem": "onderhoud",
  "v-snaar": "onderhoud",
  "vakantiecheck": "onderhoud",
  "zomercheck": "onderhoud",
  "wintercheck": "onderhoud",

  "diagnose": "diagnose",
  "uitlezen": "diagnose",
  "uitgelezen": "diagnose",
  "obd": "diagnose",
  "obd2": "diagnose",
  "computer diagnose": "diagnose",
  "computer uitlezen": "diagnose",
  "ecu": "diagnose",
  "ecu uitlezen": "diagnose",
  "foutcode": "diagnose",
  "foutcodes": "diagnose",
  "dtc": "diagnose",
  "storing": "diagnose",
  "storingen": "diagnose",
  "foutmelding": "diagnose",
  "melding": "diagnose",
  "check engine": "diagnose",
  "motorlamp": "diagnose",
  "storingslamp": "diagnose",
  "storingslampje": "diagnose",
  "mil": "diagnose",
  "start niet": "diagnose",
  "wil niet starten": "diagnose",
  "startproblemen": "diagnose",
  "slaat af": "diagnose",
  "valt uit": "diagnose",
  "stottert": "diagnose",
  "hapert": "diagnose",
  "inhouden": "diagnose",
  "geen vermogen": "diagnose",
  "vermogensverlies": "diagnose",
  "noodloop": "diagnose",
  "limp": "diagnose",
  "rook": "diagnose",
  "rookt": "diagnose",
  "oververhit": "diagnose",
  "temperatuur loopt op": "diagnose",
  "turbo": "diagnose",
  "egr": "diagnose",
  "dpf": "diagnose",
  "roetfilter": "diagnose",
  "uitlaat": "diagnose",
  "uitlaat lek": "diagnose",
  "uitlaat is lek": "diagnose",
  "uitlaat geluid": "diagnose",
  "uitlaat rammelt": "diagnose",

  "remmen": "remmen",
  "rem": "remmen",
  "remblokken": "remmen",
  "remblok": "remmen",
  "remschijven": "remmen",
  "remschijf": "remmen",
  "remklauw": "remmen",
  "remklauwen": "remmen",
  "handrem": "remmen",
  "handremkabel": "remmen",
  "rempedaal": "remmen",
  "remt slecht": "remmen",
  "piepen": "remmen",
  "piept": "remmen",
  "schuren": "remmen",
  "trillen bij remmen": "remmen",
  "abs": "remmen",
  "abs lampje": "remmen",
  "remleiding": "remmen",
  "remleidingen": "remmen",

  "banden": "banden",
  "band": "banden",
  "band vervangen": "banden",
  "banden vervangen": "banden",
  "band wisselen": "banden",
  "banden wisselen": "banden",
  "wissel": "banden",
  "wisselen": "banden",
  "zomerbanden": "banden",
  "winterbanden": "banden",
  "all season": "banden",
  "allseason": "banden",
  "balanceren": "banden",
  "uitlijnen": "banden",
  "spoor": "banden",
  "sporing": "banden",
  "lekke band": "banden",
  "band lek": "banden",
  "plakken": "banden",
  "prop": "banden",
  "plug": "banden",
  "ventiel": "banden",
  "tpms": "banden",
  "bandenspanning": "banden",
  "trilt op snelheid": "banden",

  "keuring": "keuring",
  "keuringcheck": "keuring",
  "keuring check": "keuring",
  "apk": "keuring",
  "controle": "keuring",
  "voor keuring": "keuring",
  "keuring klaar maken": "keuring",
  "keuringsproof": "keuring",
  "herkeuring": "keuring",
  "rood kaart": "keuring",
  "afkeur": "keuring",
  "afgekeurd": "keuring",

  "airco": "airco",
  "airconditioning": "airco",
  "ac": "airco",
  "a/c": "airco",
  "koelt niet": "airco",
  "airco koelt niet": "airco",
  "airco stinkt": "airco",
  "airco bijvullen": "airco",
  "airco vullen": "airco",
  "airco service": "airco",
  "airco onderhoud": "airco",
  "lek airco": "airco",
  "airco lek": "airco",
  "compressor": "airco",
  "condensor": "airco",
  "droger": "airco",

  "verlichting": "verlichting",
  "licht": "verlichting",
  "lichten": "verlichting",
  "koplamp": "verlichting",
  "koplampen": "verlichting",
  "koplamp kapot": "verlichting",
  "lamp": "verlichting",
  "lampje": "verlichting",
  "lamp vervangen": "verlichting",
  "lampje vervangen": "verlichting",
  "dimlicht": "verlichting",
  "grootlicht": "verlichting",
  "mistlamp": "verlichting",
  "mistlampen": "verlichting",
  "knipperlicht": "verlichting",
  "pinkers": "verlichting",
  "remlicht": "verlichting",
  "achterlicht": "verlichting",
  "achterlichten": "verlichting",
  "dagrijlicht": "verlichting",
  "xenon": "verlichting",
  "led": "verlichting",
  "koplamp polijsten": "verlichting",
  "koplampen polijsten": "verlichting",
  "lens polijsten": "verlichting",
  "lamp brandt niet": "verlichting",

  "glas": "glas",
  "ruit": "glas",
  "ruiten": "glas",
  "raam": "glas",
  "ramen": "glas",
  "voorruit": "glas",
  "achterruit": "glas",
  "zijruit": "glas",
  "sterretje": "glas",
  "sterretje in ruit": "glas",
  "barst": "glas",
  "barst in ruit": "glas",
  "barst in raam": "glas",
  "ruit kapot": "glas",
  "raam kapot": "glas",
  "steeninslag": "glas",
  "steenslag": "glas",
  "ruitschade": "glas",
  "ruit vervangen": "glas",
  "ruitenwissers": "glas",
  "ruitenwisser": "glas",
  "wisser": "glas",

  "motor": "motor_aandrijving",
  "aandrijving": "motor_aandrijving",
  "koppeling": "motor_aandrijving",
  "koppeling slipt": "motor_aandrijving",
  "slipt": "motor_aandrijving",
  "versnellingsbak": "motor_aandrijving",
  "bak": "motor_aandrijving",
  "schakelt slecht": "motor_aandrijving",
  "differentieel": "motor_aandrijving",
  "aandrijfas": "motor_aandrijving",
  "aandrijfassen": "motor_aandrijving",
  "homokineet": "motor_aandrijving",
  "cardan": "motor_aandrijving",

  "onderstel": "onderstel",
  "ophanging": "onderstel",
  "draagarm": "onderstel",
  "draagarmen": "onderstel",
  "fuseekogel": "onderstel",
  "kogel": "onderstel",
  "stabilisator": "onderstel",
  "stabilisatorstang": "onderstel",
  "stuurhuis": "onderstel",
  "spoorstang": "onderstel",
  "spoorstangen": "onderstel",
  "veer": "onderstel",
  "veren": "onderstel",
  "schokdemper": "onderstel",
  "schokdempers": "onderstel",
  "lager": "onderstel",
  "wiellager": "onderstel",
  "trilt": "onderstel",
  "bonkt": "onderstel",
  "klopt": "onderstel",
  "rammelt": "onderstel",
  "stuurt scheef": "onderstel",
  "speling": "onderstel",

  "elektrisch": "elektrisch",
  "elektra": "elektrisch",
  "accu": "elektrisch",
  "batterij": "elektrisch",
  "accu leeg": "elektrisch",
  "accu plat": "elektrisch",
  "laadt niet": "elektrisch",
  "dynamo": "elektrisch",
  "startmotor": "elektrisch",
  "startrelais": "elektrisch",
  "zekering": "elektrisch",
  "zekeringen": "elektrisch",
  "kortsluiting": "elektrisch",
  "stroom": "elektrisch",
  "stroomlek": "elektrisch",
  "massa": "elektrisch",
  "kabelbreuk": "elektrisch",
  "connector": "elektrisch",
  "stekker": "elektrisch",
  "canbus": "elektrisch",
  "immobilizer": "elektrisch",
  "startonderbreker": "elektrisch",
  "centrale vergrendeling": "elektrisch",
  "raammotor": "elektrisch",
  "dashboard dood": "elektrisch",
  "metercluster": "elektrisch",
  "airbag lampje": "elektrisch",
  "airbag storing": "elektrisch",

  "carrosserie": "carrosserie",
  "plaatwerk": "carrosserie",
  "spuitwerk": "carrosserie",
  "lakwerk": "carrosserie",
  "spotrepair": "carrosserie",
  "schadeherstel": "carrosserie",
  "deuk": "carrosserie",
  "deuken": "carrosserie",
  "kras": "carrosserie",
  "krassen": "carrosserie",
  "schuurschade": "carrosserie",
  "parkeerschade": "carrosserie",
  "blikschade": "carrosserie",
  "roest": "carrosserie",
  "roestplek": "carrosserie",
  "roestplekken": "carrosserie",
  "roestvorming": "carrosserie",
  "roestgat": "carrosserie",
  "roestgaten": "carrosserie",
  "doorgeroest": "carrosserie",
  "bumper": "carrosserie",
  "bumpers": "carrosserie",
  "paneel": "carrosserie",
  "panelen": "carrosserie",
  "spatbord": "carrosserie",
  "scherm": "carrosserie",
  "deur": "carrosserie",
  "portier": "carrosserie",
  "motorkap": "carrosserie",
  "achterklep": "carrosserie",
  "koffer": "carrosserie",
  "dorpel": "carrosserie",
  "wielkast": "carrosserie",
  "wielrand": "carrosserie"
};

// --- Detect intent with scoring + priority (production-grade + intentMap fast-path) ---
function detectIntent(text) {
  const t = norm(text || "");
  if (!t) return { intent: "unknown", confidence: 0, scores: {}, matches: {} };

  const scores = {};
  const matches = {};

  const tokens = t.split(/\s+/).filter(Boolean);
  const tokenSet = new Set(tokens);

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const hasWord = (w) => {
    if (!w) return false;
    if (tokenSet.has(w)) return true;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${esc(w)}([^\\p{L}\\p{N}]|$)`, "iu");
    return re.test(t);
  };

  const isHardNegated = (phraseOrWord) => {
    const s = (phraseOrWord || "").toString().trim();
    if (!s) return false;

    const neg = new Set(["geen", "niet", "nooit", "zonder"]);
    const parts = s.split(/\s+/).filter(Boolean);
    const head = parts[0];
    if (!head) return false;

    for (let i = 0; i < tokens.length; i++) {
      if (!neg.has(tokens[i])) continue;
      for (let j = i + 1; j <= Math.min(i + 3, tokens.length - 1); j++) {
        if (tokens[j] === head) return true;
      }
    }
    return false;
  };

  // PASS 1: quick match on INTENT_MAP (phrases first)
  const QUICKMAP_BLOCKLIST = new Set([
    "wissel", "wisselen", "bijvullen", "melding", "meldingen",
    "problemen", "probleem", "kapot", "stuk", "werkt niet"
  ]);
  const NEGATION_SENSITIVE_INTENTS = new Set(["onderhoud", "banden", "remmen", "keuring"]);
  const QUICK_PHRASE_CONF = 0.93;
  const QUICK_WORD_CONF = 0.89;

  if (INTENT_MAP && typeof INTENT_MAP === "object") {
    const keys = Object.keys(INTENT_MAP);

    const phrases = keys
      .filter((k) => k && k.includes(" ") && !QUICKMAP_BLOCKLIST.has(k))
      .sort((a, b) => b.length - a.length);

    for (const pRaw of phrases) {
      const p = (pRaw || "").toString().trim();
      if (!p) continue;

      if (t.includes(p)) {
        const it = INTENT_MAP[pRaw];
        if (NEGATION_SENSITIVE_INTENTS.has(it) && isHardNegated(p)) continue;

        return {
          intent: it,
          confidence: QUICK_PHRASE_CONF,
          scores: { [it]: 999 },
          matches: { [it]: [p] }
        };
      }
    }

    const singles = keys.filter((k) => k && !k.includes(" ") && !QUICKMAP_BLOCKLIST.has(k));
    for (const wRaw of singles) {
      const w = (wRaw || "").toString().trim();
      if (!w) continue;

      if (hasWord(w)) {
        const it = INTENT_MAP[wRaw];
        if (NEGATION_SENSITIVE_INTENTS.has(it) && isHardNegated(w)) continue;

        return {
          intent: it,
          confidence: QUICK_WORD_CONF,
          scores: { [it]: 999 },
          matches: { [it]: [w] }
        };
      }
    }
  }

  // PASS 2: LEX scoring + priority
  for (const [intent, words] of Object.entries(LEX.intents)) {
    let s = 0;
    const hit = [];
    const uniq = new Set();

    for (const raw of words) {
      const w = (raw || "").toString().trim();
      if (!w) continue;

      const isPhrase = w.includes(" ");
      let matched = false;

      if (isPhrase) {
        if (t.includes(w)) {
          matched = true;
          s += 3;
          hit.push(w);
          uniq.add(w);
        }
      } else {
        if (hasWord(w)) {
          matched = true;
        }
        if (matched) {
          s += 1;
          hit.push(w);
          uniq.add(w);
        }
      }
    }

    if (s > 0) {
      const distinct = uniq.size;
      if (distinct >= 3) s += 1;
      if (distinct >= 5) s += 1;

      scores[intent] = s;
      matches[intent] = hit;
    }
  }

  const intentsFound = Object.keys(scores);
  if (intentsFound.length === 0) {
    return { intent: "unknown", confidence: 0, scores: {}, matches: {} };
  }

  intentsFound.sort((a, b) => {
    const diff = scores[b] - scores[a];
    if (diff !== 0) return diff;

    const pa = LEX.intentPriority.indexOf(a);
    const pb = LEX.intentPriority.indexOf(b);
    return (pa === -1 ? 999 : pa) - (pb === -1 ? 999 : pb);
  });

  const top = intentsFound[0];
  const topScore = scores[top];
  const second = intentsFound[1];
  const secondScore = second ? scores[second] : 0;

  const len = t.length;
  const shortPenalty = len < 10 ? 0.15 : len < 18 ? 0.08 : 0;

  const rawConf = (topScore - secondScore) / Math.max(4, topScore);
  const confidence = Math.max(0, Math.min(1, rawConf - shortPenalty));

  return { intent: top, confidence, scores, matches };
}

// --- Format options helper (single disclaimer, consistent output) ---
function formatOptions(title, options) {
  const disclaimer =
    "Indicatie is adviserend; exacte prijs wordt altijd vooraf bevestigd.";

  if (!Array.isArray(options) || options.length === 0) {
    return `${title} (incl. btw): geen opties geconfigureerd.\n\n${disclaimer}`;
  }

  const lines = options.map((o) => {
    const label = o?.label || "Optie";

    if (typeof o?.priceInclVat === "number") {
      return `• ${label}: ${euro(o.priceInclVat)}`;
    }
    if (typeof o?.priceFromInclVat === "number") {
      return `• ${label}: v.a. ${euro(o.priceFromInclVat)}`;
    }

    if (Array.isArray(o?.priceRangeInclVat) && o.priceRangeInclVat.length === 2) {
      const [a, b] = o.priceRangeInclVat;
      if (typeof a === "number" && typeof b === "number") {
        return `• ${label}: ${euro(a)}–${euro(b)}`;
      }
    }

    return `• ${label}: prijs op aanvraag`;
  });

  const _disclaimer =
    (typeof disclaimer === "string" && disclaimer.trim())
      ? disclaimer
      : "Indicatie is adviserend; exacte prijs wordt altijd vooraf bevestigd.";

  return `${title} (incl. btw):\n${lines.join("\n")}\n\n${_disclaimer}`;
}

// ====== Friendly failsafe (unknown intent) ======
function buildFailsafePrompt() {
  return (
    "Ik wil je correct helpen, maar ik begrijp je vraag nog niet helemaal.\n" +
    "(G960 chat is nog in ontwikkeling.)\n\n" +
    "Typ het liefst zo in één regel:\n" +
    "• dienst: onderhoud / diagnose / remmen / banden / keuring / verlichting / airco / ruit\n" +
    "• voertuig: personenauto / bedrijfswagen / oldtimer\n" +
    "• merk + model (optioneel)\n\n" +
    "Voorbeelden:\n" +
    "• diagnose + personenauto + Golf 6 1.6 TDI — stottert bij 2000 rpm\n" +
    "• ruit + bedrijfswagen + Iveco Daily — barst in voorruit\n" +
    "• onderhoud + personenauto + Clio — kleine beurt\n\n" +
    "Als je snel wil starten: typ bv. 'diagnose personenauto' of 'onderhoud bedrijfswagen'."
  );
}

// ====== Firestore session IO ======
async function getSession(sessionId) {
  const sid = safeText(sessionId);
  const ref = SESSIONS.doc(sid);
  const snap = await ref.get();

  if (!snap.exists) {
    return {
      sessionId: sid,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      state: {
        intent: null,
        intentLocked: false,
        intentConfidence: 0,
        category: null,
      },
      history: [],
    };
  }

  const data = snap.data() || {};
  return {
    sessionId: sid,
    createdAt: data.createdAt || nowIso(),
    updatedAt: data.updatedAt || nowIso(),
    state: {
      intent: data.state?.intent ?? null,
      intentLocked: data.state?.intentLocked ?? false,
      intentConfidence: data.state?.intentConfidence ?? 0,
      category: data.state?.category ?? null,
      subtype: data.state?.subtype ?? null,
      subtypeLocked: data.state?.subtypeLocked ?? false,
      subtypeConfidence: data.state?.subtypeConfidence ?? 0,
      ctx: (data.state?.ctx && typeof data.state.ctx === "object") ? data.state.ctx : {}
    },
    history: Array.isArray(data.history) ? data.history : [],
  };
}

async function saveSession(session) {
  session.updatedAt = nowIso();
  session.expiresAt = Timestamp.fromDate(new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000));
  await SESSIONS.doc(session.sessionId).set(session, { merge: true });
}

// ====== Routes ======
app.get("/health", (req, res) => res.status(200).send("ok"));


const chatHandler = async (req, res) => {
  try {
    const text = safeText(req.body?.message).slice(0, MAX_MESSAGE_CHARS);
    const sid  = safeText(req.body?.sessionId);

    if (LOG_LEVEL === "debug") {
      console.log("=================================");
      console.log("[CHAT IN]", { sid, msgLen: (text || "").length });
    }

    if (!text) return res.status(400).json({ error: "Missing message" });
    if (!sid)  return res.status(400).json({ error: "Missing sessionId" });

    const session = await getSession(sid);

    // ---------- Hard defaults ----------
    session.state ||= {};
    session.history ||= [];

    if (typeof session.state.intent === "undefined") session.state.intent = null;
    if (typeof session.state.intentLocked === "undefined") session.state.intentLocked = false;
    if (typeof session.state.intentConfidence === "undefined") session.state.intentConfidence = 0;

    if (typeof session.state.category === "undefined") session.state.category = null;

    if (typeof session.state.subtype === "undefined") session.state.subtype = null;
    if (typeof session.state.subtypeLocked === "undefined") session.state.subtypeLocked = false;
    if (typeof session.state.subtypeConfidence === "undefined") session.state.subtypeConfidence = 0;

    // ---------- Follow-up context ----------
    session.state.ctx ||= {};
    session.state.ctx.answered ||= {};
    session.state.ctx.askedCount ||= {};
    session.state.ctx.pendingQKey ||= null;
    session.state.ctx._askedKeys ||= {};

    // ---------- Helpers ----------
    const WHATSAPP_PHONE = "32496088295";
    const baseContactUrl = "https://www.garage-960.com/contact/";

    function waLink(prefill) {
      const msg = encodeURIComponent(prefill || "");
      return `https://wa.me/${WHATSAPP_PHONE}?text=${msg}`;
    }

    function normalizeOptions(list) {
      if (!Array.isArray(list)) return [];
      return list.map((o) => {
        const label = o?.label || "Optie";

        const priceInclVat =
          typeof o?.priceInclVat === "number" ? o.priceInclVat :
          typeof o?.price === "number" ? o.price :
          undefined;

        const priceFromInclVat =
          typeof o?.priceFromInclVat === "number" ? o.priceFromInclVat :
          typeof o?.priceFrom === "number" ? o.priceFrom :
          undefined;

        const priceRange =
          Array.isArray(o?.priceRange) && o.priceRange.length === 2 ? o.priceRange :
          Array.isArray(o?.priceRangeInclVat) && o.priceRangeInclVat.length === 2 ? o.priceRangeInclVat :
          null;

        if (priceRange && typeof priceFromInclVat !== "number") {
          return { label, priceFromInclVat: Number(priceRange[0]) || undefined };
        }
        if (typeof priceInclVat === "number") return { label, priceInclVat };
        if (typeof priceFromInclVat === "number") return { label, priceFromInclVat };
        return { label };
      });
    }

    function getServiceList(intent, category) {
      const s = pricing?.services?.[intent];
      if (!s) return [];

      if (intent === "onderhoud") {
        const cfg = pricing?.services?.onderhoud?.[category || ""];
        const base = cfg?.options || cfg?.items || [];
        const addons = cfg?.addons || [];
        return normalizeOptions([...base, ...addons]);
      }

      if (intent === "checks") {
        const opts = s?.options || s?.items || [];
        if ((!opts || opts.length === 0) && typeof s === "object") {
          const flat = [];
          for (const k of Object.keys(s)) {
            const node = s[k];
            if (node?.options) flat.push(...node.options);
          }
          return normalizeOptions(flat);
        }
        return normalizeOptions(opts);
      }

      return normalizeOptions(s?.options || s?.items || []);
    }

    function formatAnsweredQA(ctx) {
      const answered = ctx?.answered && typeof ctx.answered === "object" ? ctx.answered : null;
      if (!answered) return "";
      const entries = Object.entries(answered)
        .map(([k, v]) => [String(k || "").trim(), safeText(v).trim()])
        .filter(([k, v]) => k && v);

      if (!entries.length) return "";

      const label = (k) => {
        const map = {
          vehicle_brand_model: "Merk/model",
          vehicle_engine: "Motor",
          vehicle_year: "Bouwjaar",
          vehicle_km: "Km-stand",
          symptom_where: "Waar zit het probleem",
          contact_when: "Wanneer (planning)",
          contact_urgency: "Urgentie",
          contact_location: "Locatie/omgeving",
          vl_koplens_condition: "Koplamp lens toestand",
          vl_side: "Welke kant (L/R)",
          vl_symptom: "Wat precies met verlichting"
        };
        return map[k] || k;
      };

      let out = "\nAntwoorden (chat):\n";
      for (const [k, v] of entries) {
        out += `- ${label(k)}: ${v}\n`;
      }
      return out;
    }

    function extractMetaFromText(raw) {
      const t = safeText(raw);
      const out = {};

      const kmMatch = t.match(/\b(\d{1,3}(?:[ .]\d{3})+|\d{4,6})\s*(km|kilometer)\b/i);
      if (kmMatch) out.km = kmMatch[1].replace(/[ .]/g, "");

      const yearMatch = t.match(/\b(19[7-9]\d|20[0-2]\d)\b/);
      if (yearMatch) out.year = yearMatch[1];

      const vinMatch = t.match(/\b([A-HJ-NPR-Z0-9]{17})\b/i);
      if (vinMatch) out.vin = vinMatch[1].toUpperCase();

      const plateMatch = t.match(/\b([0-9]-[A-Z]{3}-[0-9]{3}|[A-Z]{1,3}-[0-9]{3}-[A-Z]{1,3})\b/i);
      if (plateMatch) out.plate = plateMatch[1].toUpperCase();

      return out;
    }

    function lastUserMessages(history, n = 2) {
      if (!Array.isArray(history)) return [];
      const msgs = history
        .filter(h => h && h.role === "user" && typeof h.text === "string")
        .map(h => h.text);
      return msgs.slice(-n);
    }

    function getWhatsAppPrefill(extraLine) {
      const cat = session.state.category ? `\nCategorie: ${session.state.category}` : "";
      const st  = session.state.subtype  ? `\nSubtype: ${session.state.subtype}` : "";
      const qa  = formatAnsweredQA(session.state.ctx);

      const recent = lastUserMessages(session.history, 2);
      const meta = extractMetaFromText(recent.join("  "));
      const metaLines = [
        meta.plate ? `Nummerplaat: ${meta.plate}` : null,
        meta.vin ? `VIN: ${meta.vin}` : null,
        meta.year ? `Bouwjaar: ${meta.year}` : null,
        meta.km ? `Km: ${meta.km}` : null
      ].filter(Boolean);

      const recentBlock = recent.length
        ? `\nLaatste berichten:\n- ${recent.map(r => safeText(r).replace(/\s+/g, " ").trim()).join("\n- ")}\n`
        : "";

      const metaBlock = metaLines.length ? `\nVoertuig-info (herkend):\n- ${metaLines.join("\n- ")}\n` : "";

      let prefill =
`Hallo Garage 960,
Ik wil hulp voor: ${session.state.intent || "onbekend"}${cat}${st}
${recentBlock}${metaBlock}${qa ? qa : ""}${extraLine ? ("\n" + extraLine + "\n") : ""}
Kunnen jullie een richtprijs + snelste volgende stap geven?
`;

      if (prefill.length > 1200) prefill = prefill.slice(0, 1190) + "…";
      return prefill;
    }

    function buildPhraseMatcher(intentMap) {
      const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const keys = Object.keys(intentMap || {})
        .map(k => norm(k))
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);

      const GENERIC_SINGLE = new Set([
        "motor","bak","deur","koffer","roest","wisser","wissel","wisselen",
        "controle","check","melding",
        "lamp","lampje","licht",
        "band","banden","rem","remmen",
        "ruit","ruiten","raam","ramen",
        "service","beurt"
      ]);

      return function matchIntentFromText(raw) {
        const t = norm(raw);
        if (!t) return null;

        let bestIntent = null;
        let bestScore = -1;

        for (const k of keys) {
          const isSingle = !k.includes(" ");
          if (isSingle && GENERIC_SINGLE.has(k)) continue;

          const rx = new RegExp(`(^|\\b)${escapeRx(k)}(\\b|$)`, "i");
          const idx = t.search(rx);
          if (idx !== -1) {
            const score = (k.length * 10) + idx;
            if (score > bestScore) {
              bestScore = score;
              bestIntent = intentMap[k] || intentMap[norm(k)] || null;
            }
          }
        }

        if (!bestIntent) {
          const short = t.split(/\s+/).filter(Boolean).length <= 2;
          if (short) {
            const directSingles = new Map([
              ["onderhoud","onderhoud"],
              ["diagnose","diagnose"],
              ["remmen","remmen"],
              ["banden","banden"],
              ["keuring","keuring"],
              ["airco","airco"],
              ["verlichting","verlichting"],
              ["glas","glas"],
              ["carrosserie","carrosserie"],
              ["onderstel","onderstel"],
              ["elektrisch","elektrisch"],
              ["elektra","elektrisch"]
            ]);
            for (const [w, intent] of directSingles.entries()) {
              if (t === w) return intent;
            }
          }
        }

        return bestIntent;
      };
    }

    function wantsSwitch(raw, currentIntent) {
      const t = norm(raw);

      const explicit =
        t.includes("reset") ||
        t.includes("opnieuw") ||
        t.includes("nieuw gesprek") ||
        t.includes("nieuwe vraag") ||
        t.includes("ander onderwerp") ||
        t.includes("ander probleem") ||
        t.includes("andere vraag") ||
        t.includes("andere dienst") ||
        t.includes("toch iets anders") ||
        t.includes("vergeet dit") ||
        t.includes("laat maar") ||
        t.includes("stop") ||
        t === "wissel" ||
        t === "switch";

      if (explicit) return true;

      const directIntents = {
        ["onderhoud"]: "onderhoud",
        ["service"]: "onderhoud",
        ["beurt"]: "onderhoud",
        ["diagnose"]: "diagnose",
        ["uitlezen"]: "diagnose",
        ["remmen"]: "remmen",
        ["banden"]: "banden",
        ["keuring"]: "keuring",
        ["keuringcheck"]: "keuring",
        ["airco"]: "airco",
        ["verlichting"]: "verlichting",
        ["glas"]: "glas",
        ["ruit"]: "glas",
        ["carrosserie"]: "carrosserie",
        ["onderstel"]: "onderstel",
        ["elektrisch"]: "elektrisch",
        ["elektra"]: "elektrisch"
      };

      const match = buildPhraseMatcher(directIntents);
      const mentioned = match(raw);

      if (mentioned && mentioned !== currentIntent) return true;
      return false;
    }

    // subtype detection (your existing logic, kept)
    function detectSubtype(intent, rawText) {
      const t = norm(rawText || "");
      const hasAnyLocal = (arr) => arr.some((k) => t.includes(k));
      if (!intent) return { subtype: null, confidence: 0 };

      // NOTE: jouw switch/cases staan bewust niet ingevuld in je snippet.
      // Laat dit zoals je het had in je echte codebase.
      if (intent === "diagnose") {
        const st = detectDiagSubtype(rawText);
        return { subtype: st.subtype, confidence: st.confidence };
      }

      // Placeholder: behoud default
      return { subtype: null, confidence: 0 };
    }

    function isLowInfo(raw) {
      const s = safeText(raw);
      const t = norm(s);
      if (!t) return true;

      if (t.length <= 2) return true;
      if (/^(.)\1{2,}$/.test(t)) return true;
      if (/^[a-z]{1,3}$/.test(t)) return true;
      if (/^[0-9]{1,3}$/.test(t)) return true;

      if (["ok","oke","ja","nee","thanks","thx","top"].includes(t)) return true;
      return false;
    }

    function isDirectIntentCommand(raw) {
      const match = buildPhraseMatcher(INTENT_MAP);
      return match(raw);
    }

    function shouldSwitchIntent(currentIntent, intentRes, raw) {
      if (intentRes.intent === "unknown") return false;

      const direct = isDirectIntentCommand(raw);
      if (direct && direct !== currentIntent) return true;
      if (wantsSwitch(raw, currentIntent)) return true;

      const top = intentRes.intent;
      const topScore = (intentRes.scores && intentRes.scores[top]) ? intentRes.scores[top] : 0;
      const candidates = Object.keys(intentRes.scores || {});
      candidates.sort((a, b) => (intentRes.scores[b] || 0) - (intentRes.scores[a] || 0));
      const second = candidates[1];
      const secondScore = second ? (intentRes.scores[second] || 0) : 0;

      const strong =
        (intentRes.confidence >= 0.55 && topScore >= 2) ||
        (topScore >= 4) ||
        (topScore - secondScore >= 2);

      if (!strong) return false;
      if (session.state.intentLocked) return true;
      return true;
    }

    // ---------- Persist user message ----------
    session.history.push({ role: "user", text, at: nowIso() });

    // ---------- Category update ----------
    const cat = detectCategory(text);
    if (cat) session.state.category = cat;

    const intentRes = detectIntent(text);
    const currentIntent = session.state.intent || null;

    // Explicit reset / switch
    if (wantsSwitch(text, currentIntent)) {
      session.state.intentLocked = false;
      session.state.intentConfidence = 0;
      session.state.intent = null;
      session.state.subtypeLocked = false;
      session.state.subtypeConfidence = 0;
      session.state.subtype = null;
    }

    // Pending follow-up answer handling
    if (session.state.ctx && session.state.ctx.pendingQKey) {
      const direct = isDirectIntentCommand(text);
      const switched = direct && direct !== currentIntent;
      if (!switched) {
        session.state.ctx = registerAnswer(session.state.ctx, session.state.ctx.pendingQKey, text);
      }
      session.state.ctx.pendingQKey = null;
    }

    // Soft intent update
    const directIntent = isDirectIntentCommand(text);

    if (directIntent) {
      if (session.state.intent !== directIntent) {
        session.state.intent = directIntent;
        session.state.intentConfidence = 1;
        session.state.intentLocked = false;
        session.state.subtype = null;
        session.state.subtypeConfidence = 0;
        session.state.subtypeLocked = false;
      }
    } else if (intentRes.intent !== "unknown") {
      if (!session.state.intent) {
        session.state.intent = intentRes.intent;
        session.state.intentConfidence = intentRes.confidence;
      } else if (intentRes.intent !== session.state.intent) {
        if (shouldSwitchIntent(session.state.intent, intentRes, text)) {
          session.state.intent = intentRes.intent;
          session.state.intentConfidence = intentRes.confidence;
          session.state.intentLocked = false;
          session.state.subtype = null;
          session.state.subtypeConfidence = 0;
          session.state.subtypeLocked = false;
        }
      } else {
        session.state.intentConfidence = intentRes.confidence;
      }
    } else {
      if (!session.state.intent && !isLowInfo(text)) {
        session.state.intent = null;
        session.state.intentConfidence = 0;
      }
    }

    // Subtype handling (soft)
    if (session.state.intent) {
      const st = detectSubtype(session.state.intent, text);
      if (st?.subtype) {
        if (!session.state.intentLocked) {
          if ((st.confidence || 0) >= 0.45) {
            session.state.subtype = st.subtype;
            session.state.subtypeConfidence = st.confidence || 0;
          }
          session.state.subtypeLocked = false;
        } else if (!session.state.subtypeLocked) {
          session.state.subtype = st.subtype;
          session.state.subtypeConfidence = st.confidence || 0;
          if ((st.confidence || 0) >= 0.65) session.state.subtypeLocked = true;
        }
      }
    }

    // ---------- Follow-up helpers (single implementation) ----------
    function maybeAskFollowup(sessionObj) {
  const intentNow = sessionObj?.state?.intent;
  if (!intentNow) return null;

  // 🔒 HARD GATE: bij onderhoud eerst categorie fixen, geen followups
  if (intentNow === "onderhoud" && !sessionObj?.state?.category) return null;

  // (optioneel) ook voor keuring als je eerst voertuigtype wil
  // if (intentNow === "keuring" && !sessionObj?.state?.category) return null;

  sessionObj.state.ctx ||= {};
  sessionObj.state.ctx.askedCount ||= {};
  sessionObj.state.ctx.answered ||= {};
  sessionObj.state.ctx._askedKeys ||= {};

  if (sessionObj.state.ctx.pendingQKey) return null;

  const flow = runFollowupFlow(intentNow, sessionObj.state.subtype, sessionObj.state.ctx);
  if (!flow || flow.done || !flow.question?.key || !flow.question?.text) return null;

  sessionObj.state.ctx.pendingQKey = flow.question.key;
  return flow.question.text;
}


    // Central response helper (single place for logging + followup + metrics)
// Place this right where your current BUILD/respond() block is.

const BUILD = process.env.BUILD_TAG || "2026-01-25_v1";

function computeMissing(sessionObj) {
  const intentNow = sessionObj?.state?.intent;
  if (!intentNow) return [];

  const req = (REQUIRED_SLOTS && REQUIRED_SLOTS[intentNow]) ? REQUIRED_SLOTS[intentNow] : [];
  const answered = sessionObj?.state?.ctx?.answered || {};

  const hasAnswered = (k) => {
    if (!k) return false;
    if (!Object.prototype.hasOwnProperty.call(answered, k)) return false;
    const v = answered[k];
    return v !== null && v !== undefined && String(v).trim().length > 0;
  };

  return req.filter((k) => !hasAnswered(k));
}

function respond(resObj, sessionObj, payload) {
  // safety
  payload ||= {};
  if (typeof payload.reply !== "string") payload.reply = String(payload.reply || "");

  // ---- Debug logging (as you had) ----
  try {
    if (LOG_LEVEL === "debug") {
      console.log(JSON.stringify({
        tag: payload?.tag || null,
        build: BUILD,
        sid,
        intent: sessionObj?.state?.intent || null,
        subtype: sessionObj?.state?.subtype || null,
        intentLocked: !!sessionObj?.state?.intentLocked,
        subtypeLocked: !!sessionObj?.state?.subtypeLocked
      }));
    }
  } catch (_) {}
 // ---- Early WhatsApp exit when max followups reached ----
if (!payload.noFollowup && shouldEarlyExit(sessionObj)) {
  const missing = computeMissing(sessionObj);
  const s = sessionObj.state;

  const summary =
    `Ik heb al genoeg info om verder te gaan.\n\n` +
    `✔ Dienst: ${s.intent}\n` +
    (s.category ? `✔ Type: ${s.category}\n` : "") +
    (s.subtype ? `✔ Detail: ${s.subtype}\n` : "") +
    (missing.length ? `✖ Nog nodig: ${missing.join(", ")}\n\n` : "\n") +
    `Stuur dit even via WhatsApp, dan pakken we het meteen correct op.`;

  payload.reply += "\n\n" + summary;

  payload.actions = [
    {
      type: "link",
      label: "WhatsApp – intake afronden",
      url: waLink(getWhatsAppPrefill(
        `Dienst: ${s.intent}\n` +
        `Type: ${s.category || "?"}\n` +
        `Detail: ${s.subtype || "?"}\n` +
        `Ontbrekend: ${missing.join(", ")}`
      ))
    }
  ];

  payload.noFollowup = true;
}

  // ---- Add ONE follow-up question per turn unless explicitly disabled ----
  if (!payload.noFollowup && payload.reply.length > 0) {
    const q = maybeAskFollowup(sessionObj);
    if (q) {
      payload.reply += "\n\n" + q;

      // keep stored bot message consistent (last bot entry)
      const last = Array.isArray(sessionObj?.history)
        ? sessionObj.history[sessionObj.history.length - 1]
        : null;

      if (last && last.role === "bot" && typeof last.text === "string") {
        last.text = payload.reply;
      }
    }
  }

  // ---- Metrics payload (FORCED, always present) ----
  payload.build = BUILD;

  payload.intent = sessionObj?.state?.intent || null;
  payload.intentConfidence = Number(sessionObj?.state?.intentConfidence || 0);

  payload.subtype = sessionObj?.state?.subtype || null;
  payload.subtypeConfidence = Number(sessionObj?.state?.subtypeConfidence || 0);

  payload.category = sessionObj?.state?.category || null;

  payload.missing = computeMissing(sessionObj);
  payload.pending = sessionObj?.state?.ctx?.pendingQKey || null;

  payload.intentLocked = !!sessionObj?.state?.intentLocked;
  payload.subtypeLocked = !!sessionObj?.state?.subtypeLocked;

  // optional: useful for analytics/debugging (keep if you want)
  payload.askedCount = sessionObj?.state?.ctx?.askedCount || {};
  payload.answeredKeys = Object.keys(sessionObj?.state?.ctx?.answered || {});

  return resObj.status(200).json(payload);
}


function computeMissing(sessionObj) {
  const intentNow = sessionObj?.state?.intent;
  if (!intentNow) return [];

  const req = REQUIRED_SLOTS[intentNow] || [];
  const answered = sessionObj?.state?.ctx?.answered || {};

  const hasAnswered = (k) => {
    if (!Object.prototype.hasOwnProperty.call(answered, k)) return false;
    const v = answered[k];
    return v !== null && v !== undefined && String(v).trim().length > 0;
  };

  return req.filter(k => !hasAnswered(k));
}

    // ---------- Hard failsafe: no intent ----------
    if (!session.state.intent) {
  session.state.ctx ||= {};
  session.state.ctx.failsafeCount = Number(session.state.ctx.failsafeCount || 0);

  // kies welke failsafe we sturen
  let reply = buildFailsafePrompt();
  const newHash = hashReply(reply);
  const lastHash = session.state.ctx.lastBotHash || null;

  // detect “same reply loop”
  const sameAsLast = lastHash && lastHash === newHash;
  if (sameAsLast) session.state.ctx.failsafeCount += 1;
  else session.state.ctx.failsafeCount = 1;

  // na 2× dezelfde: korter en dwingender
  if (session.state.ctx.failsafeCount >= 2) {
    reply = buildUltraShortFailsafe();
  }

  session.state.ctx.lastBotHash = hashReply(reply);

  const actions = [
    { type: "link", label: "WhatsApp (start intake)", url: waLink(getWhatsAppPrefill("Ik wil starten. Dienst: [kies]. Categorie: [kies]. Klacht: [kort].")) },
    { type: "link", label: "Contact / intake", url: baseContactUrl }
  ];

  session.history.push({ role: "bot", text: reply, at: nowIso() });
  await saveSession(session);
  return respond(res, session, { reply, actions, noFollowup: true, tag: "failsafe" });
}


    // ---------- INTENT HANDLERS ----------
    const intent = session.state.intent;
    let reply = "";
    let actions = [];

    // 1) ONDERHOUD
    if (intent === "onderhoud") {
    if (!session.state.category) {
    const hint = session.state.subtype ? ` (ik hoor: ${session.state.subtype})` : "";
    reply =
      `Oké, onderhoud${hint}. Is het een personenauto, bedrijfswagen (bus/bestel) of oldtimer? ` +
      `Dan krijg je meteen de onderhoudprijzen (incl. btw).`;

    session.history.push({ role: "bot", text: reply, at: nowIso() });
    await saveSession(session);
    return respond(res, session, { reply, noFollowup: true, tag: "onderhoud_ask_category" });
  }



      const list = getServiceList("onderhoud", session.state.category);
      reply = formatOptions(`Onderhoud (${session.state.category})`, list);
      if (reply) session.state.intentLocked = true;

      actions = [
        { type: "link", label: "WhatsApp (onderhoud)", url: waLink(getWhatsAppPrefill()) },
        { type: "link", label: "Contact / intake", url: baseContactUrl }
      ];

      session.history.push({ role: "bot", text: reply, at: nowIso() });
      await saveSession(session);
      return respond(res, session, { reply, actions });
    }

    // 2) VERLICHTING
    if (intent === "verlichting") {
      const list = getServiceList("verlichting");
      const priceBlock = list.length ? formatOptions("Verlichting", list) : "";
      if (priceBlock) session.state.intentLocked = true;

      const st = session.state.subtype;

      if (st === "koplens_polijsten") {
        reply =
          (priceBlock ? priceBlock + "\n\n" : "") +
          "Helder: dit gaat over een doffe/vergeelde koplamp-lens (polijsten/renovatie), niet over een kapotte lamp.\n" +
          "Snelle vragen om meteen juiste aanpak + indicatie te geven:\n" +
          "• Links, rechts of beide?\n" +
          "• Is het enkel dof/geel of ook barstjes/vocht in de lamp?\n" +
          "• Merk/model + bouwjaar?";
        actions = [
          { type: "link", label: "WhatsApp (koplamp polijsten)", url: waLink(getWhatsAppPrefill("Koplamp-lens dof/geel → polijsten/renovatie. Links/rechts/beide: [invullen].")) },
          { type: "link", label: "Contact / intake", url: baseContactUrl }
        ];
        if (!session.state.ctx.pendingQKey) session.state.ctx.pendingQKey = "vl_koplens_condition";
        session.history.push({ role: "bot", text: reply, at: nowIso() });
        await saveSession(session);
        return respond(res, session, { reply, actions, noFollowup: true, tag: "verlichting_koplens_polijsten" });
      }

      if (st === "vocht") {
        reply =
          (priceBlock ? priceBlock + "\n\n" : "") +
          "Oké: vocht/condens in de koplamp.\n" +
          "Even scherpstellen:\n" +
          "• Trekt het weg na rijden (condens) of blijft er water staan?\n" +
          "• Eén zijde of beide?\n" +
          "• Merk/model + bouwjaar?\n" +
          "Dan kan ik zeggen of drogen/herafdichten volstaat of dat er vervangen nodig is.";
        actions = [
          { type: "link", label: "WhatsApp (koplamp vocht)", url: waLink(getWhatsAppPrefill("Koplamp condens/vocht. Wegtrekkend of blijvend water? Links/rechts: [invullen].")) },
          { type: "link", label: "Contact / intake", url: baseContactUrl }
        ];
        if (!session.state.ctx.pendingQKey) session.state.ctx.pendingQKey = "vl_symptom";
        session.history.push({ role: "bot", text: reply, at: nowIso() });
        await saveSession(session);
        return respond(res, session, { reply, actions, noFollowup: true, tag: "verlichting_vocht" });
      }

      if (st === "afstellen") {
        reply =
          (priceBlock ? priceBlock + "\n\n" : "") +
          "Oké: koplamp afstellen/lichtbeeld.\n" +
          "Even: links/rechts of beide, en is het na lamp/LED/xenon montage of spontaan?\n" +
          "Met merk/model + bouwjaar kan ik meteen de snelste route + indicatie geven.";
        actions = [
          { type: "link", label: "WhatsApp (afstellen)", url: waLink(getWhatsAppPrefill("Koplamp afstellen/lichtbeeld. Links/rechts/beide: [invullen].")) },
          { type: "link", label: "Contact / intake", url: baseContactUrl }
        ];
        session.history.push({ role: "bot", text: reply, at: nowIso() });
        await saveSession(session);
        return respond(res, session, { reply, actions, tag: "verlichting_afstellen" });
      }

      if (st === "elektronica" || st === "intermitterend") {
        reply =
          (priceBlock ? priceBlock + "\n\n" : "") +
          "Oké: elektrisch probleem (valt uit/flikkert/foutmelding).\n" +
          "Voor de snelste diagnose: welke lampfunctie (dim/groot/knipper/rem), links/rechts, en zit er LED/Xenon in?\n" +
          "Met merk/model + bouwjaar kan ik meteen de kans (lamp/zekering/massa/connector/canbus) inschatten.";
        actions = [
          { type: "link", label: "WhatsApp (elektrisch)", url: waLink(getWhatsAppPrefill("Verlichting elektrisch (flikkert/valt uit/foutmelding). Functie + links/rechts + LED/Xenon: [invullen].")) },
          { type: "link", label: "Contact / intake", url: baseContactUrl }
        ];
        session.history.push({ role: "bot", text: reply, at: nowIso() });
        await saveSession(session);
        return respond(res, session, { reply, actions, tag: "verlichting_elektrisch" });
      }

      const q =
        "Welke zijde (links/rechts) en wat precies: dimlicht/grootlicht/knipper/remlicht? " +
        "Met merk/model + bouwjaar kan ik het meteen scherp zetten.";
      reply = (priceBlock ? priceBlock + "\n\n" : "") + q;

      actions = [
        { type: "link", label: "WhatsApp (verlichting)", url: waLink(getWhatsAppPrefill()) },
        { type: "link", label: "Contact / intake", url: baseContactUrl }
      ];

      session.history.push({ role: "bot", text: reply, at: nowIso() });
      await saveSession(session);
      return respond(res, session, { reply, actions, tag: "verlichting_default" });
    }

    // 2b) ELEKTRISCH
    if (intent === "elektrisch") {
      reply =
        "Oké, elektrisch. Wat werkt niet of welk lampje brandt er precies? " +
        "Zeg ook merk/model + bouwjaar + (indien relevant) of het plots was of na werken/batterij wissel.";

      actions = [
        { type: "link", label: "WhatsApp (elektrisch)", url: waLink(getWhatsAppPrefill("Elektrisch probleem: wat werkt niet / welk lampje / wanneer gestart?")) },
        { type: "link", label: "Contact / intake", url: baseContactUrl }
      ];

      session.history.push({ role: "bot", text: reply, at: nowIso() });
      await saveSession(session);
      return respond(res, session, { reply, actions, tag: "elektrisch" });
    }

    // 2c) CARROSSERIE
    if (intent === "carrosserie") {
      const st = session.state.subtype || "";
      const heading =
        st === "roest" ? "Oké, roest." :
        st === "deuk" ? "Oké, deuk/parkeerschade." :
        st === "kras_lak" ? "Oké, kras/lakschade." :
        st === "panelen_bumper" ? "Oké, bumper/paneel/onderdeel." :
        "Oké, carrosserie.";

      reply =
        heading + "\n" +
        "Stuur via WhatsApp 2–3 duidelijke foto's (totaal + close-up) en zeg:\n" +
        "• welk onderdeel (deur/dorpel/wielkast/bumper)\n" +
        "• is het roest door tot gaten of oppervlakkig\n" +
        "• merk/model + bouwjaar\n\n" +
        "Dan kan ik direct zeggen: herstelbaar, aanpak, en of het bij ons past of best doorverwezen wordt.";

      actions = [
        { type: "link", label: "WhatsApp (carrosserie)", url: waLink(getWhatsAppPrefill("Carrosserie: foto's (totaal + close-up) + onderdeel + roest door/gaten?")) },
        { type: "link", label: "Contact / intake", url: baseContactUrl }
      ];

      session.history.push({ role: "bot", text: reply, at: nowIso() });
      await saveSession(session);
      return respond(res, session, { reply, actions, tag: "carrosserie" });
    }

    // 3) BANDEN
    if (intent === "banden") {
      const list = getServiceList("banden");
      const priceBlock = list.length ? formatOptions("Banden", list) : "";
      if (priceBlock) session.state.intentLocked = true;

      reply =
        (priceBlock ? priceBlock + "\n\n" : "") +
        "Wat is de bandenmaat (bv. 205/55R16) en gaat het om lek/plat, wissel, trilling of nieuwe banden?";

      actions = [
        { type: "link", label: "WhatsApp (banden)", url: waLink(getWhatsAppPrefill()) },
        { type: "link", label: "Contact / intake", url: baseContactUrl }
      ];

      session.history.push({ role: "bot", text: reply, at: nowIso() });
      await saveSession(session);
      return respond(res, session, { reply, actions });
    }

    // 4) DIAGNOSE
    if (intent === "diagnose") {
      const list = getServiceList("diagnose");
      const priceBlock = list.length ? formatOptions("Diagnose / uitlezen", list) : "";
      if (priceBlock) session.state.intentLocked = true;

      const subtypeLine = session.state.subtype ? `Ik hoor: ${session.state.subtype}.\n` : "";
      reply =
        (priceBlock ? priceBlock + "\n\n" : "") +
        subtypeLine +
        "Om het meteen juist te krijgen: merk/model/motor + wat doet hij precies + wanneer (koud/warm/onder belasting).";

      actions = [
        { type: "link", label: "WhatsApp (diagnose)", url: waLink(getWhatsAppPrefill()) },
        { type: "link", label: "Contact / intake", url: baseContactUrl }
      ];

      session.history.push({ role: "bot", text: reply, at: nowIso() });
      await saveSession(session);
      return respond(res, session, { reply, actions });
    }

    // 5) CHECKS / KEURING
    if (intent === "keuring" || intent === "checks") {
      const list = getServiceList("checks");
      const priceBlock = list.length ? formatOptions("Keuring / checks", list) : "";
      if (priceBlock) session.state.intentLocked = true;

      reply =
        (priceBlock ? priceBlock + "\n\n" : "") +
        "Is het voor keuring (basis/uitgebreid) en wat wil je zeker laten nakijken? " +
        "(remmen/uitlaat/roet/ophanging/verlichting)";

      actions = [
        { type: "link", label: "WhatsApp (keuring)", url: waLink(getWhatsAppPrefill()) },
        { type: "link", label: "Contact / intake", url: baseContactUrl }
      ];

      session.history.push({ role: "bot", text: reply, at: nowIso() });
      await saveSession(session);
      return respond(res, session, { reply, actions });
    }

    // 6) AIRCO
    if (intent === "airco") {
      const list = getServiceList("airco");
      const priceBlock = list.length ? formatOptions("Airco", list) : "";
      if (priceBlock) session.state.intentLocked = true;

      reply =
        (priceBlock ? priceBlock + "\n\n" : "") +
        "Koelt hij niet, stinkt hij, of maakt hij lawaai? " +
        "Zeg merk/model + bouwjaar en wanneer hij voor het laatst gevuld is (als je dat weet).";

      actions = [
        { type: "link", label: "WhatsApp (airco)", url: waLink(getWhatsAppPrefill()) },
        { type: "link", label: "Contact / intake", url: baseContactUrl }
      ];

      session.history.push({ role: "bot", text: reply, at: nowIso() });
      await saveSession(session);
      return respond(res, session, { reply, actions });
    }

    // 7) GLAS
    if (intent === "glas") {
      const list = getServiceList("glas");
      const priceBlock = list.length ? formatOptions("Ruit / glas", list) : "";
      if (priceBlock) session.state.intentLocked = true;

      const st = session.state.subtype || "";

      const isHerstellen = st.startsWith("herstellen");
      const isVervangen = st.startsWith("vervangen");
      const isAfdichting = st.startsWith("afdichting");
      const isWissers = st.startsWith("wissers");
      const isAdas = (st === "adas_speciaal");

      let q = "Gaat het om voorruit, zijruit of achterruit? En is het steenslag/sterretje, een barst/scheur, of iets anders (lekkage/windgeruis)?";

      if (isAdas) {
        q = "Dit klinkt als een (ADAS/speciale) voorruit. Welke auto (merk/model/bouwjaar) en welke opties (camera/regen sensor/HUD/verwarmd)? Dan maak ik dit meteen offertematig correct.";
      } else if (isVervangen) {
        q = "Klinkt als barst/scheur/breuk: voorruit/zijruit/achterruit? Loopt de barst door het zichtveld? (En: merk/model + bouwjaar.)";
      } else if (isHerstellen) {
        q = "Klinkt als steenslag/sterretje: voorruit of zijruit? Hoe groot is het ongeveer (kleiner dan €2 / €2-€5 / groter)?";
      } else if (isAfdichting) {
        q = "Oké: lekkage/windgeruis rond ruit. Is het na ruitvervanging geweest of plots? En waar (boven/onder/links/rechts)?";
      } else if (isWissers) {
        q = "Oké: wissers/strepen/krassen. Zijn de wissers nieuw of oud, en krast het echt (zand/steentje) of zijn het strepen?";
      }

      reply = (priceBlock ? priceBlock + "\n\n" : "") + q;

      actions = [
        { type: "link", label: "WhatsApp (ruit/glas)", url: waLink(getWhatsAppPrefill("Ruit/glas: voor/zij/achter + type schade (ster/barst/lekkage) + merk/model/bouwjaar.")) },
        { type: "link", label: "Contact / intake", url: baseContactUrl }
      ];

      session.history.push({ role: "bot", text: reply, at: nowIso() });
      await saveSession(session);
      return respond(res, session, { reply, actions, tag: "glas" });
    }

    // 8) REMMEN
    if (intent === "remmen") {
      const list = getServiceList("remmen");
      const hasList = Array.isArray(list) && list.length > 0;
      const header = hasList ? formatOptions("Remmen", list) + "\n\n" : "";

      const st = session.state.subtype;
      const t = norm(text);

      const answeredPosition = (t.includes("voor") || t.includes("achter"));
      const mentionsParts = (t.includes("remblokken") || t.includes("blokken") || t.includes("remschijven") || t.includes("schijven"));
      const mentionsReplace = (t.includes("vervangen") || t.includes("nieuwe") || t.includes("set"));

      if (st === "veiligheid_kritiek") {
        reply =
          header +
          "Dit is rem-veiligheid kritiek. Rij hier niet mee door.\n" +
          "Stuur direct via WhatsApp: merk/model + bouwjaar + wat er precies gebeurt (pedaal zakt/geen remkracht/lekkage).\n" +
          "Dan plannen we prioriteit of slepen indien nodig.";
        actions = [
          { type: "link", label: "WhatsApp (spoed remmen)", url: waLink(getWhatsAppPrefill("SPOED remprobleem (veiligheid). Beschrijf symptoom + locatie.")) },
          { type: "link", label: "Contact / intake", url: baseContactUrl }
        ];
        session.history.push({ role: "bot", text: reply, at: nowIso() });
        await saveSession(session);
        return respond(res, session, { reply, actions, tag: "remmen_veiligheid" });
      }

      if (answeredPosition || mentionsParts || mentionsReplace) {
        reply =
          header +
          "Duidelijk. Om je meteen de juiste route + richtprijs te geven:\n" +
          "• Piept het continu of enkel bij licht remmen?\n" +
          "• Voel je trilling in stuur/pedaal?\n" +
          "• Merk/model + bouwjaar + motor?\n" +
          "Als je wil, stuur 1 foto van de schijf/blok (als zichtbaar) via WhatsApp.";
        actions = [
          { type: "link", label: "WhatsApp (remmen)", url: waLink(getWhatsAppPrefill("Remmen: voor/achter + blokken/schijven. Extra: continu of licht remmen? Trilling?")) },
          { type: "link", label: "Contact / intake", url: baseContactUrl }
        ];
        session.history.push({ role: "bot", text: reply, at: nowIso() });
        await saveSession(session);
        return respond(res, session, { reply, actions, tag: "remmen_followup" });
      }

      if (st === "slijtage_geluid") {
        reply =
          header +
          "Oké: piepen/schuren/metaal-op-metaal klinkt als slijtage.\n" +
          "Is het voor of achter? En hoor je het ook zonder te remmen (aanlopen)?\n" +
          "Met merk/model + bouwjaar geef ik meteen richtprijs + snelste optie.";
        actions = [
          { type: "link", label: "WhatsApp (piepen/schuren)", url: waLink(getWhatsAppPrefill("Remmen piepen/schuren. Voor/achter + loopt aan ja/nee.")) },
          { type: "link", label: "Contact / intake", url: baseContactUrl }
        ];
        session.history.push({ role: "bot", text: reply, at: nowIso() });
        await saveSession(session);
        return respond(res, session, { reply, actions, tag: "remmen_slijtage" });
      }

      if (st === "hydrauliek") {
        reply =
          header +
          "Oké: sponsig/wegzakkend pedaal wijst op hydrauliek (lucht/lek/hoofdremcilinder).\n" +
          "Is het plots begonnen of geleidelijk? En is het remvloeistofpeil oké?\n" +
          "Met merk/model + bouwjaar kan ik de snelste diagnose-route + indicatie geven.";
        actions = [
          { type: "link", label: "WhatsApp (pedaal/hydrauliek)", url: waLink(getWhatsAppPrefill("Rempedaal sponsig/wegzakkend. Plots/geleidelijk + peil oké?")) },
          { type: "link", label: "Contact / intake", url: baseContactUrl }
        ];
        session.history.push({ role: "bot", text: reply, at: nowIso() });
        await saveSession(session);
        return respond(res, session, { reply, actions, tag: "remmen_hydrauliek" });
      }

      if (st === "lampje_systeem") {
        reply =
          header +
          "Oké: ABS/ESP/rem-lampje = systeem/elektronisch.\n" +
          "Welke lampjes branden precies (ABS/ESP/rode rem)?\n" +
          "Met merk/model + bouwjaar kan ik meteen de juiste uitlees/diagnose-route + indicatie geven.";
        actions = [
          { type: "link", label: "WhatsApp (lampje/ABS/ESP)", url: waLink(getWhatsAppPrefill("Rem/ABS/ESP lampje. Welke lampjes branden exact?")) },
          { type: "link", label: "Contact / intake", url: baseContactUrl }
        ];
        session.history.push({ role: "bot", text: reply, at: nowIso() });
        await saveSession(session);
        return respond(res, session, { reply, actions, tag: "remmen_lampje" });
      }

      if (st === "trilling") {
        reply =
          header +
          "Oké: trilling bij remmen wijst vaak op kromme schijven of speling.\n" +
          "Is de trilling vooral in stuur of in pedaal? En bij welke snelheid?\n" +
          "Met merk/model + bouwjaar kan ik meteen de snelste route + indicatie geven.";
        actions = [
          { type: "link", label: "WhatsApp (trilling)", url: waLink(getWhatsAppPrefill("Trilling bij remmen. Stuur of pedaal? Snelheid?")) },
          { type: "link", label: "Contact / intake", url: baseContactUrl }
        ];
        session.history.push({ role: "bot", text: reply, at: nowIso() });
        await saveSession(session);
        return respond(res, session, { reply, actions, tag: "remmen_trilling" });
      }

      if (st === "trekken") {
        reply =
          header +
          "Oké: trekt/scheef remmen kan klauw, leiding, band of ophanging zijn.\n" +
          "Trekken naar links of rechts? En gebeurt het altijd of pas na warm rijden?\n" +
          "Met merk/model + bouwjaar kan ik de snelste diagnose-route + indicatie geven.";
        actions = [
          { type: "link", label: "WhatsApp (trekken)", url: waLink(getWhatsAppPrefill("Trekken/scheef remmen. Richting + warm/koud?")) },
          { type: "link", label: "Contact / intake", url: baseContactUrl }
        ];
        session.history.push({ role: "bot", text: reply, at: nowIso() });
        await saveSession(session);
        return respond(res, session, { reply, actions, tag: "remmen_trekken" });
      }

      reply =
        header +
        "Is het voor of achter, en gaat het om piepen/schuren, trillen, of wil je blokken/schijven vervangen?\n" +
        "Met merk/model + bouwjaar kan ik je meteen een richtprijs of route geven (inspectie/offerte).";

      actions = [
        { type: "link", label: "WhatsApp (remmen)", url: waLink(getWhatsAppPrefill("Ik wil graag richtprijs voor remmen (blokken/schijven) + planning.")) },
        { type: "link", label: "Contact / intake", url: baseContactUrl }
      ];

      session.history.push({ role: "bot", text: reply, at: nowIso() });
      await saveSession(session);
      return respond(res, session, { reply, actions });
    }

    // ---------- Final fallback ----------
    reply = buildFailsafePrompt();
    actions = [
      { type: "link", label: "WhatsApp", url: waLink(getWhatsAppPrefill()) },
      { type: "link", label: "Contact / intake", url: baseContactUrl }
    ];

    session.history.push({ role: "bot", text: reply, at: nowIso() });
    await saveSession(session);
    return respond(res, session, { reply, actions });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal error" });
  }
}; // <-- sluit app.post(...) / handler af

// Cloud Run: must listen on PORT
const port = process.env.PORT || 8080;

if (require.main === module) {
  app.listen(port, () => console.log("Listening on", port));
}


// ---- Simulator hook (no-op in prod) ----
// Zorg dat je hier de échte handler aanroept die ook je endpoint gebruikt.
module.exports.__simulateHandleMessage = async function __simulateHandleMessage(payload) {
  // payload: { message, sessionId }
  // TODO: vervang handleMessageInternal door jouw echte functie.
  return await handleMessageInternal(payload);
};

module.exports.__simulateHandleMessage = async ({ message, sessionId }) => {
  const req = { body: { message, sessionId }, headers: {}, ip: "simulator" };

  let jsonOut;
  const res = {
    status() { return this; },
    json(obj) { jsonOut = obj; return obj; },
    send(obj) { jsonOut = obj; return obj; }
  };

  await chatHandler(req, res);

  // Zorg dat simulator altijd object terugkrijgt
  if (jsonOut && typeof jsonOut === "object") return jsonOut;
  return { text: typeof jsonOut === "string" ? jsonOut : String(jsonOut || "") };
};
