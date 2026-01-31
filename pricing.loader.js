"use strict";

// pricing.loader.js
// Doel:
// - pricing.json is de ENIGE bron van waarheid
// - we mappen price/priceFrom/priceRange naar priceInclVat/priceFromInclVat
// - we ondersteunen ook je huidige JSON-structuur (checks/onderhoud/veiligheid/diagnose/etc.)

const raw = require("./pricing.json");

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function mapOption(o) {
  if (!o || typeof o !== "object") return null;

  const out = {
    key: o.key ?? undefined,
    label: o.label ?? "Optie",
  };

  // Support meerdere namen
  const price = num(o.price ?? o.priceInclVat);
  const priceFrom = num(o.priceFrom ?? o.priceFromInclVat);
  const range = Array.isArray(o.priceRange) ? o.priceRange : Array.isArray(o.priceRangeInclVat) ? o.priceRangeInclVat : null;

  if (price !== null) out.priceInclVat = price;
  if (priceFrom !== null) out.priceFromInclVat = priceFrom;

  if (range && range.length === 2) {
    const a = num(range[0]);
    const b = num(range[1]);
    if (a !== null && b !== null) out.priceRangeInclVat = [a, b];
  }

  // unit bewaren indien aanwezig (banden etc.)
  if (o.unit) out.unit = o.unit;

  return out;
}

function mapOptionsArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(mapOption).filter(Boolean);
}

function mapServiceNode(node) {
  // node kan zijn:
  // - { options: [...] }
  // - { items: [...] }
  // - { label, forfait:false }
  // - nested object per subservice (bv checks.wintercheck)
  if (!node || typeof node !== "object") return node;

  const out = { ...node };

  if (Array.isArray(node.options)) out.options = mapOptionsArray(node.options);
  if (Array.isArray(node.items)) out.options = mapOptionsArray(node.items); // normaliseer naar options voor bot
  if (Array.isArray(node.addons)) out.addons = mapOptionsArray(node.addons);

  // checks: subservices met options
  for (const [k, v] of Object.entries(node)) {
    if (!v || typeof v !== "object") continue;
    // als het een sub-node is met options/items/addons -> mappen
    if (v.options || v.items || v.addons) out[k] = mapServiceNode(v);
  }

  return out;
}

// Meta/disclaimer
const metaDisclaimer =
  raw?.meta?.disclaimer ||
  "Indicatie is adviserend; exacte prijs wordt altijd vooraf bevestigd.";

module.exports = {
  vatRate: raw?.vatRate ?? (raw?.vatIncluded ? 0.21 : 0.21), // fallback
  meta: { disclaimer: metaDisclaimer },

  // Optioneel: als je dit in json zet, nemen we het mee
  labor: raw?.labor ? { ...raw.labor } : (raw?.labor?.hourlyInclVat ? raw.labor : {}),
  parts: raw?.parts ? { ...raw.parts } : (raw?.parts?.markupFactor ? raw.parts : {}),

  pricing: raw, // handig voor debug (kan je later weghalen)

  services: mapServiceNode(raw?.services || {}),
};
