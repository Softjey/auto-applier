#!/usr/bin/env node
// What number goes in the salary field of THIS vacancy's form.
//
// Before this script existed, the salary answer was a single qa[] string — the
// same figure on every form. That is wrong in both directions: it leaves money
// on the table when the employer published a band above the anchor, and it
// prices the user out when they published one below it. The number is a
// function of the vacancy, so it is computed per vacancy, here, and the
// arithmetic is printed so a reviewer can check what was submitted.
//
// Nothing personal lives in this file. Every figure — baseline, floor, the
// premium tier, the rounding steps — comes from `compensation.strategy` in
// profile.json, and every conversion from `compensation.derivation`. Change
// the policy there, never here.
//
// Usage:
//   salary-quote.mjs [band] [output] [--source="..."] [--tier=premium] [--json]
//
//   band     --min=N --max=N --currency=PLN --period=month|hour|year
//            --basis=b2b-net|uop-gross          (omit --min/--max: no band)
//   output   --as=month|hour|year --as-currency=PLN --as-basis=b2b-net|uop-gross
//   rate     --rate=N   PLN per 1 unit of a non-PLN currency (NBP table A mid)
//   tier     --tier=premium for Staff/Lead/Principal or a US-remote role
//
// Exit codes: 0 = quote it. 3 = the quote lands under the floor — do NOT submit,
// ask the user whether to apply at all (strategy rule `floor`).

import { loadProfile } from "./lib/qa-match.mjs";

const PERIODS = new Set(["month", "hour", "year"]);
const BASES = new Set(["b2b-net", "uop-gross"]);

function parseArgs(argv) {
  const out = { flags: new Set() };
  for (const arg of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (!m) fail(`unrecognised argument: ${arg}`);
    if (m[2] === undefined) out.flags.add(m[1]);
    else out[m[1]] = m[2];
  }
  return out;
}

function fail(message) {
  console.error(`salary-quote: ${message}`);
  process.exit(1);
}

const num = (raw, what) => {
  if (raw === undefined) return undefined;
  // Bands are copied straight off job pages: "40 000", "40,000", "40k",
  // "8 000 PLN netto" — unit words and thin spaces are dropped. Anything left
  // that is not ONE number is a mistake worth stopping for: a shell that
  // failed to split `--min=25000 --max=30000` would otherwise be read as a
  // single 2,500,030,000 band and quoted without a murmur.
  const bare = String(raw)
    .trim()
    .replace(/\b(pln|eur|usd|gbp|chf|net|netto|brutto|gross|zl|zł|month|hour|mies)\b/gi, "")
    .replace(/[\s ,_]/g, "");
  if (!/^\d+(?:\.\d+)?k?$/i.test(bare)) fail(`${what} must be one positive number, got: ${raw}`);
  const value = parseFloat(bare) * (/k$/i.test(bare) ? 1000 : 1);
  if (!Number.isFinite(value) || value <= 0) fail(`${what} is not a positive number: ${raw}`);
  return value;
};

// ---------------------------------------------------------------- conversion

// Everything is compared in ONE basis — the profile's anchor, PLN per month net
// on a B2B invoice — because "is this band above or below the baseline" is
// meaningless until an hourly UoP-gross band and a monthly B2B-net anchor are
// the same kind of number.
function makeConverter(profile, rate) {
  const d = profile.compensation?.derivation || {};
  const hours = d.hoursPerMonth || 168;
  const uopFactor = d.contractForm?.uopGrossFactor || 1.4;
  const anchorCurrency = profile.compensation?.defaultCurrency || "PLN";
  const lastRates = d.currency?.lastRates || {};

  const warned = new Set();
  const rateFor = (currency) => {
    if (currency === anchorCurrency) return 1;
    if (rate) return rate;
    const known = lastRates[currency];
    if (known) {
      if (!warned.has(currency))
          console.error(
          `salary-quote: no --rate given, falling back to profile.json's last ${currency} rate ` +
            `${known} (checked ${d.currency?.lastChecked || "?"}). Refresh it from ` +
            `${d.currency?.rateSource || "NBP"} before submitting.`,
        );
      warned.add(currency);
      return known;
    }
    fail(`no FX rate for ${currency}. Fetch the NBP table-A mid rate and pass --rate=<PLN per 1 ${currency}>.`);
  };

  const periodFactor = (period) => (period === "hour" ? hours : period === "year" ? 1 / 12 : 1);

  return {
    hours,
    anchorCurrency,
    toAnchor: (amount, u) =>
      amount * rateFor(u.currency) * periodFactor(u.period) * (u.basis === "uop-gross" ? 1 / uopFactor : 1),
    fromAnchor: (amount, u) =>
      (amount / rateFor(u.currency) / periodFactor(u.period)) * (u.basis === "uop-gross" ? uopFactor : 1),
  };
}

function roundingStep(unit, strategy, anchorCurrency) {
  const r = strategy.rounding || {};
  const home = unit.currency === anchorCurrency;
  if (unit.period === "hour") return home ? r.hourlyPln || 5 : r.hourlyForeign || 1;
  if (unit.period === "year") return r.annualForeign || 1000;
  return home ? r.monthlyPln || 500 : r.monthlyForeign || 100;
}

const fmt = (n) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(2));
const unitLabel = (u) => `${u.currency}/${u.period} ${u.basis === "uop-gross" ? "gross UoP" : "net B2B"}`;

// ---------------------------------------------------------------- the rules

function decide({ band, tier, strategy, conv }) {
  const baseline = tier === "premium" ? strategy.premium?.quote ?? strategy.baseline : strategy.baseline;

  if (!band) {
    return {
      rule: "no-band",
      why:
        tier === "premium"
          ? `no band published; Staff/Lead/US-remote tier -> ${fmt(baseline)} in the anchor basis`
          : `no band published anywhere -> the baseline ${fmt(baseline)}`,
      anchor: baseline,
    };
  }

  const topAnchor = band.max === undefined ? undefined : conv.toAnchor(band.max, band.unit);

  if (band.max === undefined) {
    // "from 20 000" is a floor the employer named, not a band. It can raise the
    // quote, never lower it.
    const minAnchor = conv.toAnchor(band.min, band.unit);
    return {
      rule: "open-ended-band",
      why: `only a lower bound published -> max(baseline ${fmt(baseline)}, that bound) in the anchor basis`,
      anchor: Math.max(baseline, minAnchor),
    };
  }

  if (topAnchor <= strategy.baseline) {
    // Rule 2: the top of the band, exactly. Not the bottom, not the middle.
    return {
      rule: "band-at-or-below-baseline",
      why: `band top is at or below the baseline (${fmt(strategy.baseline)}) -> ask for the top of the band`,
      anchor: topAnchor,
      capAnchor: topAnchor,
      exact: { value: band.max, unit: band.unit },
    };
  }

  if (band.min === undefined || band.min >= band.max) {
    return {
      rule: "band-above-baseline-single-value",
      why: "a single figure above the baseline -> quote it",
      anchor: topAnchor,
      capAnchor: topAnchor,
      exact: { value: band.max, unit: band.unit },
    };
  }

  // Rule 3: upper third. min + 5/6 x span is its midpoint — high in the band,
  // but not pinned to the ceiling, which reads as "will not negotiate".
  //
  // Floored at the baseline. The upper third of a band that only just clears
  // the baseline lands *below* it — a 25,200-30,200 band computes 29,367, which
  // asks for less than the user is worth when the employer already said 30,200
  // is available. If they allow the baseline, ask for the baseline. The cap
  // still applies, so this can never exceed what they published.
  const point = band.min + (5 / 6) * (band.max - band.min);
  const upperThird = conv.toAnchor(point, band.unit);
  const flooredAtBaseline = Math.max(upperThird, baseline);
  return {
    rule: "band-above-baseline",
    why:
      flooredAtBaseline > upperThird
        ? `band top is above the baseline -> upper third (${fmt(upperThird)}) is below the baseline, so ask for the baseline ${fmt(baseline)}`
        : `band top is above the baseline -> upper third: ${fmt(band.min)} + 5/6 x ${fmt(band.max - band.min)}`,
    anchor: flooredAtBaseline,
    capAnchor: topAnchor,
  };
}

// ---------------------------------------------------------------- main

function main() {
  const args = parseArgs(process.argv.slice(2));
  const profile = loadProfile();
  const strategy = profile.compensation?.strategy;
  if (!strategy?.baseline || !strategy?.floor) {
    fail("profile.json has no compensation.strategy with a baseline and a floor — run the profile-interview skill.");
  }

  const rate = num(args.rate, "--rate");
  const conv = makeConverter(profile, rate);

  const bandUnit = {
    currency: (args.currency || conv.anchorCurrency).toUpperCase(),
    period: args.period || "month",
    basis: args.basis || "b2b-net",
  };
  if (!PERIODS.has(bandUnit.period)) fail(`--period must be one of ${[...PERIODS].join(", ")}`);
  if (!BASES.has(bandUnit.basis)) fail(`--basis must be one of ${[...BASES].join(", ")}`);

  const target = {
    currency: (args["as-currency"] || bandUnit.currency).toUpperCase(),
    period: args.as || bandUnit.period,
    basis: args["as-basis"] || bandUnit.basis,
  };
  if (!PERIODS.has(target.period)) fail(`--as must be one of ${[...PERIODS].join(", ")}`);
  if (!BASES.has(target.basis)) fail(`--as-basis must be one of ${[...BASES].join(", ")}`);

  const min = num(args.min, "--min");
  const max = num(args.max, "--max");
  const band =
    min === undefined && max === undefined
      ? null
      : {
          min,
          max,
          unit: bandUnit,
        };
  if (band && min !== undefined && max !== undefined && min > max) fail("--min is above --max");

  const tier = args.tier === "premium" ? "premium" : "default";
  if (args.tier && !["premium", "default"].includes(args.tier)) fail("--tier must be premium or default");

  const decision = decide({ band, tier, strategy, conv });

  // One helper for the submitted number and for every equivalent shown beside
  // it, so a form asking for the hourly rate never gets a differently-rounded
  // version of the same decision.
  const quoteIn = (unit) => {
    const sameUnit = (a, b) => a.currency === b.currency && a.period === b.period && a.basis === b.basis;
    if (decision.exact && sameUnit(unit, decision.exact.unit)) return decision.exact.value;
    const step = roundingStep(unit, strategy, conv.anchorCurrency);
    let value = Math.round(conv.fromAnchor(decision.anchor, unit) / step) * step;
    // Rounding must never carry the quote above a band the employer published.
    if (decision.capAnchor !== undefined) {
      const cap = conv.fromAnchor(decision.capAnchor, unit);
      if (value > cap) value = Math.floor(cap / step) * step;
    }
    return Math.round(value * 100) / 100;
  };

  const quote = quoteIn(target);
  const quoteAnchor = conv.toAnchor(quote, target);
  const belowFloor = quoteAnchor < strategy.floor;
  const floorInTarget = conv.fromAnchor(strategy.floor, target);

  const source = args.source || (band ? "unspecified — fill this in" : "no band found");
  const bandText = band
    ? `${band.min !== undefined ? fmt(band.min) : "?"}-${band.max !== undefined ? fmt(band.max) : "open"} ${unitLabel(bandUnit)}`
    : "none published";

  const note = belowFloor
    ? `Desired salary: NOT SUBMITTED — the band (${bandText}) prices below the ${fmt(strategy.floor)} floor. Source: ${source}.`
    : `Desired salary: ${fmt(quote)} ${unitLabel(target)} (${decision.rule}; band: ${bandText}; source: ${source}).`;

  const equivalents = ["month", "hour"]
    .filter((p) => p !== target.period)
    .map((p) => ({ period: p, amount: quoteIn({ ...target, period: p }) }));

  if (args.flags.has("json")) {
    console.log(
      JSON.stringify(
        { rule: decision.rule, why: decision.why, band: band && { min: band.min, max: band.max, unit: bandUnit },
          tier, quote, unit: target, quoteInAnchorBasis: Math.round(quoteAnchor), equivalents,
          floor: strategy.floor, belowFloor, source, note },
        null, 1,
      ),
    );
  } else {
    console.log(`Rule    ${decision.rule}`);
    console.log(`        ${decision.why}`);
    console.log(`Band    ${bandText}`);
    console.log(`Source  ${source}`);
    console.log(`Quote   ${fmt(quote)} ${unitLabel(target)}`);
    for (const eq of equivalents) console.log(`        = ${fmt(eq.amount)} ${target.currency}/${eq.period}`);
    if (target.currency !== conv.anchorCurrency || target.basis !== "b2b-net" || target.period !== "month")
      console.log(`        = ${fmt(quoteIn({ currency: conv.anchorCurrency, period: "month", basis: "b2b-net" }))} ${conv.anchorCurrency}/month net B2B (anchor basis)`);
    console.log(`Note    ${note}`);
    if (belowFloor) {
      console.log("");
      console.log(`!! BELOW FLOOR — ${fmt(Math.round(quoteAnchor))} is under the ${fmt(strategy.floor)} floor`);
      console.log(`   Do NOT submit. Ask the user whether to apply to this vacancy at all.`);
      console.log(`   If they say yes, quote the floor: ${fmt(Math.round(floorInTarget))} ${unitLabel(target)}.`);
    }
  }

  process.exit(belowFloor ? 3 : 0);
}

main();
