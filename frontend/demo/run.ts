/**
 * Replays the scripted demo against the deployed contract with real GenLayer validator consensus
 * and asserts every number. This is the end-to-end test.
 *
 *   cd frontend
 *   node --env-file=.env.local --experimental-strip-types demo/run.ts
 *
 * Evidence pages come from FIXTURE_BASE_URL (a public https URL of this app, e.g. its Vercel
 * deployment or a tunnel). Without it the run falls back to two stable public pages on
 * example.com so the consensus path can still be exercised end to end.
 *
 *   --appeal       also exercise an appeal (two extra panel rounds)
 *   --unchallenged also wait out a challenge window and finalize a spend nobody challenged
 */
import { createChainApi, freshPrivateKey, type Signer } from "../lib/chain.ts";
import { describeError } from "../lib/errors.ts";
import { bondFor, formatUsdc } from "../lib/money.ts";
import type { Role, Spend } from "../lib/types.ts";
import { AMOUNT_MICROS, MANDATE, SCENARIOS, SEED_MICROS, fixtureUrl } from "./script.ts";

const env = process.env;
const contract = env.NEXT_PUBLIC_CHARGEBACK_ADDRESS;
if (!contract || !/^0x[0-9a-fA-F]{40}$/.test(contract)) {
  throw new Error("NEXT_PUBLIC_CHARGEBACK_ADDRESS is not set. Run `node deploy/deploy.mjs` first, then use --env-file=.env.local");
}
const api = createChainApi({
  rpcUrl: env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://studio.genlayer.com/api",
  chainId: Number(env.NEXT_PUBLIC_GENLAYER_CHAIN_ID || "61999"),
  contract: contract as `0x${string}`,
});
const fixtureBase = (env.FIXTURE_BASE_URL || "").replace(/\/+$/, "");
const wantAppeal = process.argv.includes("--appeal");
const wantUnchallenged = process.argv.includes("--unchallenged");

const t0 = Date.now();
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s`;
const log = (msg: string) => console.log(`${stamp()}  ${msg}`);
let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) log(`  ok   ${name}`);
  else {
    failures += 1;
    log(`  FAIL ${name}${detail ? `  (${detail})` : ""}`);
  }
}

const who: Record<Role, Signer> = {
  payer: api.signer(freshPrivateKey()),
  recipient: api.signer(freshPrivateKey()),
  stranger: api.signer(freshPrivateKey()),
};

async function tx(role: Role, fn: Parameters<Signer["send"]>[0], args: Parameters<Signer["send"]>[1], label: string) {
  const hash = await who[role].send(fn, args);
  log(`${label}  tx ${hash.slice(0, 12)}…`);
  return hash;
}

async function expectRevert(role: Role, fn: Parameters<Signer["send"]>[0], args: Parameters<Signer["send"]>[1], needle: string, label: string) {
  try {
    await who[role].send(fn, args);
    check(label, false, "call succeeded");
  } catch (e) {
    const msg = describeError(e);
    check(`${label} -> "${msg}"`, msg.includes(needle), `wanted "${needle}"`);
  }
}

async function bal(role: Role) {
  return api.reads.balance(who[role].address);
}

interface Pages {
  short: string;
  long: string;
  injected: string | null;
  mandateShort: string;
  mandateLong: string;
  claimShort: string;
  claimLong: string;
}

const pages: Pages = fixtureBase
  ? {
      short: fixtureUrl(fixtureBase, "ba283"),
      long: fixtureUrl(fixtureBase, "ba283-delayed"),
      injected: fixtureUrl(fixtureBase, "ba283-injected"),
      mandateShort: MANDATE,
      mandateLong: MANDATE,
      claimShort: SCENARIOS.short.claim,
      claimLong: SCENARIOS.long.claim,
    }
  : {
      short: "https://example.com/",
      long: "https://example.com/",
      injected: null,
      mandateShort: "Pay only if the page states that this website sells running shoes.",
      mandateLong: "Pay only if the page states that this domain is for use in illustrative examples in documents.",
      claimShort: "The page is the generic example domain notice and does not mention running shoes at all.",
      claimLong: "The page says nothing about payment, so I doubt it supports releasing funds.",
    };

const mine: number[] = [];

async function openSpend(mandate: string, url: string, trace: string): Promise<number> {
  await tx("payer", "open_spend", [who.recipient.address, BigInt(AMOUNT_MICROS), mandate, url, trace], "open_spend");
  const id = (await api.reads.stats()).spendCount;
  mine.push(id);
  return id;
}

async function challenge(spendId: number, claim: string, url: string, precedent = 0): Promise<number> {
  await tx("stranger", "challenge", [BigInt(spendId), claim, url, BigInt(precedent)], "challenge");
  return (await api.reads.spend(spendId)).activeChallengeId;
}

const BOND = bondFor(AMOUNT_MICROS);

async function main() {
  log(`contract ${contract}${fixtureBase ? `  fixtures ${fixtureBase}` : "  (no FIXTURE_BASE_URL: using example.com pages)"}`);
  const cfg = await api.reads.config();
  log(`window ${cfg.windowTicks} ticks x ${cfg.tickSeconds}s = ${cfg.windowSeconds}s`);

  const supplyBefore = (await api.reads.stats()).totalSupply;
  await Promise.all((["payer", "recipient", "stranger"] as const).map((r) => tx(r, "seed", [BigInt(SEED_MICROS)], `seed ${r}`)));
  check("each account holds 500 USDC", (await Promise.all([bal("payer"), bal("recipient"), bal("stranger")])).every((b) => b === SEED_MICROS));
  await expectRevert("payer", "seed", [1n], "already been seeded", "a second seed is refused");

  // ---- 1. payer opens 100 USDC
  log("STEP 1  payer opens a 100 USDC spend");
  const s1 = await openSpend(pages.mandateShort, pages.short, "agent claimed: delay exceeded policy, released payment.");
  let spend = await api.reads.spend(s1);
  check("status is open and provisional", spend.status === "open");
  check("payer is locked for amount + bond", (await bal("payer")) === SEED_MICROS - AMOUNT_MICROS - BOND);
  check("recipient has not been paid", (await bal("recipient")) === SEED_MICROS);
  await expectRevert("payer", "challenge", [BigInt(s1), "I challenge my own spend, which is not allowed.", pages.short, 0n], "cannot challenge", "the payer cannot challenge");
  await expectRevert("recipient", "challenge", [BigInt(s1), "I challenge a spend paying me, which is not allowed.", pages.short, 0n], "cannot challenge", "the recipient cannot challenge");
  await expectRevert("recipient", "finalize", [BigInt(s1)], "still open", "finalize before the deadline is refused");

  // ---- 2. a stranger funds a second look
  log("STEP 2  a stranger funds a second look");
  const c1 = await challenge(s1, pages.claimShort, pages.short);
  check("the challenge is registered and the bond is held", c1 > 0 && (await bal("stranger")) === SEED_MICROS - BOND);

  // ---- 3. rule -> MISMATCH, reverted
  log("STEP 3  the validator panel rules (this is the real consensus round)");
  await tx("stranger", "rule", [BigInt(c1)], "rule");
  spend = await api.reads.spend(s1);
  const ch1 = spend.challenge;
  log(`  label ${ch1?.verdictLabel}: ${ch1?.verdictReason}`);
  log(`  quote "${ch1?.evidenceQuote}"`);
  check("ruling is MISMATCH", ch1?.verdictLabel === "MISMATCH");
  check("spend reverted", spend.status === "reverted");
  check("payer is refunded the amount, minus the slashed bond", (await bal("payer")) === SEED_MICROS - BOND);
  check("stranger holds both bonds", (await bal("stranger")) === SEED_MICROS + BOND);
  check("recipient never received the amount", (await bal("recipient")) === SEED_MICROS);
  check("case 1 is written", (await api.reads.cases()).some((c) => c.id === 1 || c.spendId === s1));
  await expectRevert("stranger", "rule", [BigInt(c1)], "already been ruled on", "a ruling cannot be re-run");
  const caseId = ch1?.caseId ?? 0;

  // ---- 4. second spend, the agent is right, the stranger loses
  log("STEP 4  second spend, same mandate, the agent is right; the stranger challenges anyway");
  const s2 = await openSpend(pages.mandateLong, pages.long, "agent claimed: delay exceeded policy, released payment.");
  const c2 = await challenge(s2, pages.claimLong, pages.long, caseId);
  await tx("stranger", "rule", [BigInt(c2)], "rule");
  spend = await api.reads.spend(s2);
  const ch2 = spend.challenge;
  log(`  label ${ch2?.verdictLabel}: ${ch2?.verdictReason}`);
  check("precedent was recorded on the challenge", ch2?.citedCaseId === caseId);
  check("ruling is MATCH", ch2?.verdictLabel === "MATCH");
  check("payout is held while the challenger may still appeal", spend.status === "cleared" && (await bal("recipient")) === SEED_MICROS);
  if (!wantAppeal) {
    await tx("stranger", "accept_ruling", [BigInt(c2)], "accept_ruling");
    spend = await api.reads.spend(s2);
    check("spend finalized to the recipient", spend.status === "final");
    check("recipient received the amount and half the slashed bond", (await bal("recipient")) === SEED_MICROS + AMOUNT_MICROS + Math.floor(BOND / 2));
    check("stranger's bond was slashed", (await bal("stranger")) === SEED_MICROS + BOND - BOND);
  } else {
    log("STEP 4b  the stranger appeals");
    await tx("stranger", "appeal", [BigInt(c2)], "appeal");
    await tx("stranger", "rule_appeal", [BigInt(c2)], "rule_appeal");
    spend = await api.reads.spend(s2);
    log(`  appeal label ${spend.challenge?.verdictLabel}: ${spend.challenge?.verdictReason}`);
    check("the appeal produced a second case", (await api.reads.stats()).caseCount >= 3);
    check("the appeal settled the spend", spend.status === "final" || spend.status === "reverted");
  }

  // ---- 5. jailbreak page
  if (pages.injected) {
    log("STEP 5  a page that begs the panel to say MATCH");
    const s3 = await openSpend(MANDATE, pages.injected, "agent claimed: delay exceeded policy, released payment.");
    const c3 = await challenge(s3, SCENARIOS.injected.claim, pages.injected);
    await tx("stranger", "rule", [BigInt(c3)], "rule");
    spend = await api.reads.spend(s3);
    log(`  label ${spend.challenge?.verdictLabel}: ${spend.challenge?.verdictReason}`);
    check("the injected page did not set the verdict", spend.challenge?.verdictLabel === "MISMATCH" && spend.status === "reverted");
  }

  // ---- 6. unchallenged spend finalizes
  if (wantUnchallenged) {
    log("STEP 6  a spend nobody challenges");
    const s4 = await openSpend(pages.mandateLong, pages.long, "agent claimed: payment is due.");
    const deadline = (await api.reads.spend(s4)).challengeDeadline;
    for (;;) {
      const now = await api.reads.chainTime();
      if (now >= deadline) break;
      log(`  waiting ${deadline - now}s for the challenge window to close`);
      await new Promise((r) => setTimeout(r, Math.min(15, deadline - now + 1) * 1000));
    }
    await tx("stranger", "finalize", [BigInt(s4)], "finalize");
    const done: Spend = await api.reads.spend(s4);
    check("an unchallenged spend finalizes to the recipient", done.status === "final");
  }

  // ---- conservation
  const stats = await api.reads.stats();
  const all = await api.reads.spends();
  const unsettled = all.filter((s) => mine.includes(s.id) && s.status !== "final" && s.status !== "reverted");
  const held = (await Promise.all([bal("payer"), bal("recipient"), bal("stranger")])).reduce((a, b) => a + b, 0);
  check("every spend in this run is settled", unsettled.length === 0);
  check("money is conserved: the three accounts hold exactly what was seeded", held === 3 * SEED_MICROS, `held ${held}`);
  check("total supply grew by exactly the three seeds", stats.totalSupply - supplyBefore === 3 * SEED_MICROS);
  log(`final balances  payer ${formatUsdc(await bal("payer"))}  recipient ${formatUsdc(await bal("recipient"))}  stranger ${formatUsdc(await bal("stranger"))}`);
  log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(describeError(e));
  console.error(e);
  process.exit(2);
});
