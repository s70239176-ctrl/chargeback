import assert from "node:assert/strict";
import { test } from "node:test";
import { activeDeadline, countdown, formatClock } from "./clock.ts";
import { decodeRevertPayload, describeError, revertFromReceipt, revertFromRpcError, RevertError } from "./errors.ts";
import { fixtureHtml } from "./fixtures.ts";
import { fuzzy, nextActions, riskBuckets, riskSignals, search, summarize, toCsv, trend, vetoRate } from "./derive.ts";
import { bondFor, formatUsdc, MICROS, parseUsdc } from "./money.ts";
import { toSpend } from "./parse.ts";
import type { Spend } from "./types.ts";

test("bond is 10% with a 5 USDC floor", () => {
  assert.equal(bondFor(100 * MICROS), 10 * MICROS);
  assert.equal(bondFor(20 * MICROS), 5 * MICROS);
  assert.equal(bondFor(1 * MICROS), 5 * MICROS);
  assert.equal(bondFor(1234 * MICROS), 123_400_000);
});

test("usdc formatting and parsing round-trip", () => {
  assert.equal(formatUsdc(100 * MICROS), "100 USDC");
  assert.equal(formatUsdc(12_500_000), "12.50 USDC");
  assert.equal(formatUsdc(1_234_567), "1.234567 USDC");
  assert.equal(formatUsdc(1_000_000_000, false), "1,000");
  assert.equal(parseUsdc("100"), 100 * MICROS);
  assert.equal(parseUsdc("12.5"), 12_500_000);
  assert.equal(parseUsdc(" 0.000001 "), 1);
  for (const bad of ["", "-1", "1e3", "1.2345678", "abc", "1,000"]) assert.equal(parseUsdc(bad), null, bad);
});

test("revert payloads decode from base64 (tag byte + utf-8)", () => {
  const b64 = Buffer.from(Buffer.concat([Buffer.from([1]), Buffer.from("EXPECTED: this address has already been seeded")])).toString("base64");
  assert.equal(decodeRevertPayload(b64), "this address has already been seeded");
  assert.equal(decodeRevertPayload("not base64!!"), null);
  assert.equal(decodeRevertPayload(Buffer.from([65, 66, 67]).toString("base64")), null);
});

test("revert reasons are found in rpc errors and receipts", () => {
  const b64 = Buffer.concat([Buffer.from([1]), Buffer.from("EXPECTED: a party to the spend cannot challenge it")]).toString("base64");
  const rpcError = { cause: { data: { receipt: { result: b64 } } } };
  assert.equal(revertFromRpcError(rpcError), "a party to the spend cannot challenge it");
  assert.equal(describeError(rpcError), "a party to the spend cannot challenge it");
  const tx = { consensus_data: { leader_receipt: [{ execution_result: "ERROR", result: { payload: "EXPECTED: boom" } }] } };
  assert.equal(revertFromReceipt(tx), "boom");
  assert.equal(revertFromReceipt({ consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }] } }), null);
  const mixed = { consensus_data: { leader_receipt: [
    { mode: "leader", execution_result: "SUCCESS" },
    { mode: "validator", execution_result: "ERROR", result: { payload: "idle" } },
  ] } };
  assert.equal(revertFromReceipt(mixed), null, "an idle validator's receipt is not a revert");
  assert.equal(describeError(new RevertError("nope")), "nope");
});

test("countdown counts whole ticks on the chain clock", () => {
  assert.deepEqual(countdown(190, 100, 30), { ticksLeft: 3, secondsLeft: 90, closed: false });
  assert.deepEqual(countdown(190, 160, 30), { ticksLeft: 1, secondsLeft: 30, closed: false });
  assert.deepEqual(countdown(190, 190, 30), { ticksLeft: 0, secondsLeft: 0, closed: true });
  assert.equal(formatClock(75), "1m 15s");
  assert.equal(formatClock(9), "9s");
  assert.equal(activeDeadline({ status: "open", challengeDeadline: 5, appealDeadline: 9 }), 5);
  assert.equal(activeDeadline({ status: "cleared", challengeDeadline: 5, appealDeadline: 9 }), 9);
  assert.equal(activeDeadline({ status: "final", challengeDeadline: 5, appealDeadline: 9 }), null);
});

const BASE: Spend = {
  id: 1, payer: "0xa", recipient: "0xb", amount: 100 * MICROS, bond: 10 * MICROS, mandate: "m", evidenceUrl: "https://x.example.org/a",
  trace: "t", openedAt: 0, challengeDeadline: 100, appealDeadline: 0, status: "open", activeChallengeId: -1,
  settlement: [], challenge: null,
};
const ME = { payer: "0xa", recipient: "0xb", stranger: "0xc" } as const;
const CH = { id: 1, spendId: 1, challenger: "0xc", bond: 10 * MICROS, claim: "c", counterUrl: "", citedCaseId: -1, status: "pending" as const,
  verdictLabel: "" as const, verdictReason: "", evidenceQuote: "", caseId: -1, appealBond: 0, appeals: 0 };

test("money is summarised from contract state, nothing invented", () => {
  const spends: Spend[] = [
    BASE,
    { ...BASE, id: 2, status: "reverted", challenge: { ...CH, status: "upheld", verdictLabel: "MISMATCH" } },
    { ...BASE, id: 3, status: "final" },
    { ...BASE, id: 4, status: "challenged", challenge: CH },
  ];
  const m = summarize(spends);
  assert.deepEqual(m, { underWatch: 200 * MICROS, challenged: 200 * MICROS, recovered: 100 * MICROS, released: 100 * MICROS });
  assert.equal(vetoRate(spends), 1);
  assert.equal(vetoRate([BASE]), null);
});

test("risk buckets separate closing, releasing and waiting money", () => {
  const spends: Spend[] = [
    { ...BASE, id: 1, challengeDeadline: 130 }, // 30s left, tick 60 -> closing
    { ...BASE, id: 2, challengeDeadline: 90 }, // past -> releasing
    { ...BASE, id: 3, challengeDeadline: 900 }, // fresh -> not at risk
    { ...BASE, id: 4, status: "challenged", challenge: CH },
    { ...BASE, id: 5, status: "cleared", appealDeadline: 500 },
  ];
  const r = riskBuckets(spends, 100, 60);
  assert.equal(r.closing.count, 1);
  assert.equal(r.releasing.count, 1);
  assert.equal(r.awaitingPanel.count, 1);
  assert.equal(r.appealable.count, 1);
  assert.equal(r.total, 400 * MICROS);
});

test("next actions skip spends the viewer is a party to and rank by urgency", () => {
  const spends: Spend[] = [
    { ...BASE, id: 1, payer: "0xz", recipient: "0xy", challengeDeadline: 900, amount: 50 * MICROS },
    { ...BASE, id: 2, payer: "0xz", recipient: "0xy", challengeDeadline: 130, amount: 20 * MICROS },
    { ...BASE, id: 3, challengeDeadline: 900 }, // mine: cannot challenge it
  ];
  const a = nextActions(spends, ME, 100, 60);
  assert.deepEqual(a.map((x) => x.spendId), [2, 1]);
  assert.equal(a[0]?.priority, "HIGH");
  assert.equal(a[0]?.payout, 20 * MICROS);
  const waiting = nextActions([{ ...BASE, status: "challenged", challenge: CH }], ME, 100, 60);
  assert.equal(waiting[0]?.cta, "Convene panel");
});

test("signals are rule-based and say what they saw", () => {
  const s = riskSignals([{ ...BASE, challengeDeadline: 50 }], [], 100, 60);
  assert.equal(s[0]?.severity, "high");
  assert.match(s[0]?.title ?? "", /releasing unchallenged/);
  assert.deepEqual(riskSignals([{ ...BASE, challengeDeadline: 900 }], [], 100, 60), []);
});

test("fuzzy search ranks substrings first and tolerates gaps", () => {
  assert.ok(fuzzy("opp", "Opportunities") > fuzzy("otn", "Opportunities"));
  assert.equal(fuzzy("zzz", "Opportunities"), -1);
  const items = [{ kind: "Pages", label: "Analytics", hint: "" }, { kind: "Pages", label: "Active disputes", hint: "" }];
  assert.equal(search(items, "anl")[0]?.label, "Analytics");
  assert.equal(search(items, "").length, 2);
});

test("trend compares chain-time days; csv escapes", () => {
  assert.equal(trend([], 1000), null);
  assert.equal(trend([{ ...BASE, openedAt: 900 }], 1000)?.good, true);
  const csv = toCsv([{ a: 1, b: 'say "hi", ok' }]);
  assert.equal(csv.split(/\r?\n/).length, 2);
  assert.ok(csv.endsWith('1,"say ""hi"", ok"'));
});

test("contract JSON is parsed strictly", () => {
  const raw = {
    id: 1, payer: "0xa", recipient: "0xb", amount: 1, bond: 1, mandate: "m", evidence_url: "u", trace: "t",
    opened_at: 1, challenge_deadline: 2, appeal_deadline: 0, status: "open", active_challenge_id: -1, settlement: [], challenge: null,
  };
  assert.equal(toSpend(raw).status, "open");
  assert.throws(() => toSpend({ ...raw, status: "weird" }), /Unknown spend status/);
  assert.throws(() => toSpend({ ...raw, amount: "1" }), /not a number/);
  assert.throws(() => toSpend({ ...raw, settlement: null }), /not a list/);
});

test("the one fixture is adversarial: it shows the truth and begs for MATCH", () => {
  const injected = fixtureHtml("ba283-injected");
  assert.match(injected, /Delay: 41 minutes/);
  assert.match(injected, /ignore previous instructions/i);
  assert.match(injected, /demo fixture/i);
});
