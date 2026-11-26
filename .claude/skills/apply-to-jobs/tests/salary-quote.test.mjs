import { afterAll, describe, it } from "vitest";
import assert from "node:assert/strict";
import { makeDataDir } from "./helpers.mjs";

const data = makeDataDir();
afterAll(() => data.cleanup());

const quote = (...args) => {
  const r = data.run("salary-quote.mjs", ...args, "--json");
  assert.ok(r.status === 0 || r.status === 3, r.stderr);
  return { code: r.status, ...JSON.parse(r.stdout) };
};
const monthPln = ["--currency=PLN", "--period=month", "--basis=b2b-net"];

describe("salary-quote rules", () => {
  it("no band quotes the baseline", () => {
    const q = quote(...monthPln);
    assert.equal(q.rule ?? q.decision?.rule, "no-band");
    assert.match(JSON.stringify(q), /30000/);
  });

  it("no band on the premium tier quotes the premium figure", () => {
    const r = data.run("salary-quote.mjs", ...monthPln, "--tier=premium");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Quote\s+33,000 PLN\/month net B2B/);
  });

  it("a band at or below the baseline asks for its top", () => {
    const r = data.run("salary-quote.mjs", "--min=26000", "--max=29000", ...monthPln);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /band-at-or-below-baseline/);
    assert.match(r.stdout, /Quote\s+29,000 PLN\/month/);
  });

  it("a band above the baseline asks for its upper third", () => {
    const r = data.run("salary-quote.mjs", "--min=31000", "--max=34000", ...monthPln);
    assert.match(r.stdout, /band-above-baseline/);
    assert.match(r.stdout, /Quote\s+34,000 PLN\/month/);
  });

  it("an upper third under the baseline is raised to the baseline", () => {
    const r = data.run("salary-quote.mjs", "--min=25200", "--max=30200", ...monthPln);
    assert.match(r.stdout, /so ask for the baseline/);
    assert.match(r.stdout, /Quote\s+30,000 PLN\/month/);
  });

  it("an open-ended band never lowers the quote", () => {
    const r = data.run("salary-quote.mjs", "--min=20000", ...monthPln);
    assert.match(r.stdout, /open-ended-band/);
    assert.match(r.stdout, /Quote\s+30,000 PLN\/month/);
  });

  it("a single figure above the baseline is quoted as is", () => {
    const r = data.run("salary-quote.mjs", "--min=32000", "--max=32000", ...monthPln);
    assert.match(r.stdout, /band-above-baseline-single-value/);
    assert.match(r.stdout, /Quote\s+32,000 PLN\/month/);
  });

  it("a band whose top is under the floor exits 3", () => {
    const r = data.run("salary-quote.mjs", "--min=18000", "--max=22000", ...monthPln);
    assert.equal(r.status, 3);
    assert.match(r.stdout, /BELOW FLOOR/);
  });
});

describe("salary-quote units", () => {
  it("an hourly band is quoted per hour and converted to a month", () => {
    const r = data.run("salary-quote.mjs", "--min=150", "--max=200", "--currency=PLN", "--period=hour", "--basis=b2b-net");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Quote\s+190 PLN\/hour net B2B/);
    assert.match(r.stdout, /= 32,000 PLN\/month/);
  });

  it("a foreign band without --rate falls back to the profile rate and says so", () => {
    const r = data.run("salary-quote.mjs", "--min=90000", "--max=110000", "--currency=EUR", "--period=year", "--basis=b2b-net");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /falling back to profile\.json's last EUR rate 4\.5/);
    assert.match(r.stdout, /Quote\s+107,000 EUR\/year net B2B/);
  });

  it("an explicit --rate is used instead of the profile rate", () => {
    const r = data.run("salary-quote.mjs", "--min=90000", "--max=110000", "--currency=EUR", "--period=year", "--basis=b2b-net", "--rate=4");
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stderr, /falling back/);
  });

  it("a UoP gross band keeps its basis in the quote", () => {
    const r = data.run("salary-quote.mjs", "--min=28000", "--max=36000", "--currency=PLN", "--period=month", "--basis=uop-gross");
    assert.match(r.stdout, /Quote\s+35,000 PLN\/month gross UoP/);
  });

  it("numbers copied off a job page are read", () => {
    const r = data.run("salary-quote.mjs", "--min=31 000 PLN", "--max=34k", ...monthPln);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Band\s+31,000-34,000/);
  });

  it("two numbers glued into one argument are refused", () => {
    const r = data.run("salary-quote.mjs", "--min=25000 --max=30000", ...monthPln);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /must be one positive number/);
  });

  it("an unknown tier is refused", () => {
    assert.equal(data.run("salary-quote.mjs", ...monthPln, "--tier=gold").status, 1);
  });
});
