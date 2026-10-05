import assert from "node:assert/strict";
import { test } from "node:test";
import { activeDeadline, countdown, formatClock } from "./clock.ts";
import { decodeRevertPayload, describeError, revertFromReceipt, revertFromRpcError, RevertError } from "./errors.ts";
import { fixtureHtml } from "./fixtures.ts";
import { nextStep } from "./guide.ts";
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
  id: 1, payer: "0xa", recipient: "0xb", amount: 100 * MICROS, bond: 10 * MICROS, mandate: "m", evidenceUrl: "u",
  trace: "t", openedAt: 0, challengeDeadline: 100, appealDeadline: 0, status: "open", activeChallengeId: -1,
  settlement: [], challenge: null,
};
const ADDR = { payer: "0xa", recipient: "0xb", stranger: "0xc" } as const;

test("the next-step guide follows on-chain state", () => {
  const g = (over: Partial<Parameters<typeof nextStep>[0]>) =>
    nextStep({ seeded: true, spends: [], active: "stranger", chainNow: 10, addresses: ADDR, ...over });
  assert.match(g({ seeded: false }), /Seed demo accounts/);
  assert.match(g({}), /Open a spend/);
  assert.match(g({ spends: [BASE], active: "payer" }), /Switch to Stranger/);
  assert.match(g({ spends: [BASE] }), /Fund a second look/);
  assert.match(g({ spends: [BASE], chainNow: 100 }), /Finalize/);
  const challenged: Spend = {
    ...BASE, status: "challenged",
    challenge: { id: 1, spendId: 1, challenger: "0xc", bond: 1, claim: "c", counterUrl: "", citedCaseId: -1, status: "pending",
      verdictLabel: "", verdictReason: "", evidenceQuote: "", caseId: -1, appealBond: 0, appeals: 0 },
  };
  assert.match(g({ spends: [challenged] }), /Convene the panel/);
  assert.match(g({ spends: [{ ...BASE, status: "final" }] }), /settled/);
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

test("fixtures say what the mandate needs them to say", () => {
  assert.match(fixtureHtml("ba283"), /Delay: 41 minutes/);
  assert.match(fixtureHtml("ba283-delayed"), /Delay: 4 hours 12 minutes/);
  const injected = fixtureHtml("ba283-injected");
  assert.match(injected, /Delay: 41 minutes/);
  assert.match(injected, /ignore previous instructions/i);
});
