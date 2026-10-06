/**
 * Replays the scripted demo against the deployed contract with real GenLayer validator consensus
 * over real public sources, and asserts every number. This is the end-to-end test.
 *
 *   cd frontend
 *   npm run demo -- [--appeal] [--unchallenged]
 *
 * Evidence comes from sources nobody here controls: Wikipedia's REST API and GitHub's live status
 * feed. The expected ruling for the live feed is computed from the feed itself at run time.
 * The adversarial page is synthetic by design and needs this app served on a public host:
 *
 *   FIXTURE_BASE_URL=https://your-app.vercel.app npm run demo
 *
 *   --appeal        also exercise an appeal (two extra panel rounds)
 *   --unchallenged  also wait out a challenge window and finalize a spend nobody challenged
 */
import { createChainApi, freshPrivateKey, type Signer } from "../lib/chain.ts";
import { describeError } from "../lib/errors.ts";
import { bondFor, formatUsdc } from "../lib/money.ts";
import type { Role } from "../lib/types.ts";
import { AMOUNT_MICROS, SCENARIOS, SEED_MICROS, scenarioUrl } from "./script.ts";

const env = process.env;
const contract = env.NEXT_PUBLIC_CHARGEBACK_ADDRESS;
if (!contract || !/^0x[0-9a-fA-F]{40}$/.test(contract)) {
  throw new Error("NEXT_PUBLIC_CHARGEBACK_ADDRESS is not set. Run `node deploy/deploy.mjs` first.");
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
const log = (msg: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s  ${msg}`);
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

type Fn = Parameters<Signer["send"]>[0];
type Args = Parameters<Signer["send"]>[1];

async function tx(role: Role, fn: Fn, args: Args, label: string) {
  const hash = await who[role].send(fn, args);
  log(`${label}  tx ${hash.slice(0, 12)}…`);
}

async function expectRevert(role: Role, fn: Fn, args: Args, needle: string, label: string) {
  try {
    await who[role].send(fn, args);
    check(label, false, "call succeeded");
  } catch (e) {
    const msg = describeError(e);
    check(`${label} -> "${msg}"`, msg.includes(needle), `wanted "${needle}"`);
  }
}

const bal = (role: Role) => api.reads.balance(who[role].address);
const mine: number[] = [];
const BOND = bondFor(AMOUNT_MICROS);

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

async function ruled(challengeId: number, spendId: number) {
  await tx("stranger", "rule", [BigInt(challengeId)], "rule");
  const s = await api.reads.spend(spendId);
  log(`  label ${s.challenge?.verdictLabel}: ${s.challenge?.verdictReason}`);
  log(`  quote "${s.challenge?.evidenceQuote}"`);
  return s;
}

/** The real GitHub status feed, read by this script, decides what an honest panel must say. */
async function githubIncident(): Promise<boolean> {
  const res = await fetch(SCENARIOS.github.evidenceUrl ?? "");
  const body = (await res.json()) as { status?: { indicator?: string; description?: string } };
  log(`  github status right now: ${body.status?.indicator} (${body.status?.description})`);
  return body.status?.indicator !== "none";
}

async function main() {
  log(`contract ${contract}`);
  const cfg = await api.reads.config();
  log(`window ${cfg.windowTicks} ticks x ${cfg.tickSeconds}s = ${cfg.windowSeconds}s`);
  const supplyBefore = (await api.reads.stats()).totalSupply;

  await Promise.all((["payer", "recipient", "stranger"] as const).map((r) => tx(r, "seed", [BigInt(SEED_MICROS)], `seed ${r}`)));
  check("each account holds the seed", (await Promise.all([bal("payer"), bal("recipient"), bal("stranger")])).every((b) => b === SEED_MICROS));
  await expectRevert("payer", "seed", [1n], "already been seeded", "a second seed is refused");

  // ---- 1. a false claim over a real page: the stranger should win
  const k2 = SCENARIOS.k2;
  log("STEP 1  the agent claims K2 is the highest mountain; the real Wikipedia page says Everest");
  const s1 = await openSpend(k2.mandate, k2.evidenceUrl ?? "", k2.trace);
  let spend = await api.reads.spend(s1);
  check("status is open and provisional", spend.status === "open");
  check("payer is locked for amount + bond", (await bal("payer")) === SEED_MICROS - AMOUNT_MICROS - BOND);
  check("recipient has not been paid", (await bal("recipient")) === SEED_MICROS);
  await expectRevert("payer", "challenge", [BigInt(s1), "I challenge my own spend, which is not allowed.", k2.evidenceUrl ?? "", 0n], "cannot challenge", "the payer cannot challenge");
  await expectRevert("recipient", "challenge", [BigInt(s1), "I challenge a spend paying me, which is not allowed.", k2.evidenceUrl ?? "", 0n], "cannot challenge", "the recipient cannot challenge");
  await expectRevert("recipient", "finalize", [BigInt(s1)], "still open", "finalize before the deadline is refused");
  const c1 = await challenge(s1, k2.claim, k2.evidenceUrl ?? "");
  check("the challenge is registered and the bond is held", c1 > 0 && (await bal("stranger")) === SEED_MICROS - BOND);
  spend = await ruled(c1, s1);
  check("ruling is MISMATCH", spend.challenge?.verdictLabel === "MISMATCH");
  check("the quote comes from the real page", /highest/i.test(spend.challenge?.evidenceQuote ?? ""));
  check("spend reverted", spend.status === "reverted");
  check("payer is refunded the amount, minus the slashed bond", (await bal("payer")) === SEED_MICROS - BOND);
  check("stranger holds both bonds", (await bal("stranger")) === SEED_MICROS + BOND);
  check("recipient never received the amount", (await bal("recipient")) === SEED_MICROS);
  await expectRevert("stranger", "rule", [BigInt(c1)], "already been ruled on", "a ruling cannot be re-run");
  const caseId = spend.challenge?.caseId ?? 0;

  // ---- 2. a true claim: the stranger challenges anyway and loses
  const ev = SCENARIOS.everest;
  log("STEP 2  the agent is right; the stranger challenges anyway, citing the first case");
  const s2 = await openSpend(ev.mandate, ev.evidenceUrl ?? "", ev.trace);
  const c2 = await challenge(s2, ev.claim, ev.evidenceUrl ?? "", caseId);
  spend = await ruled(c2, s2);
  check("precedent was recorded on the challenge", spend.challenge?.citedCaseId === caseId);
  check("ruling is MATCH", spend.challenge?.verdictLabel === "MATCH");
  check("payout is held while the challenger may still appeal", spend.status === "cleared" && (await bal("recipient")) === SEED_MICROS);
  if (!wantAppeal) {
    await tx("stranger", "accept_ruling", [BigInt(c2)], "accept_ruling");
    spend = await api.reads.spend(s2);
    check("spend finalized to the recipient", spend.status === "final");
    check("recipient received the amount and half the slashed bond", (await bal("recipient")) === SEED_MICROS + AMOUNT_MICROS + Math.floor(BOND / 2));
    check("stranger's bond was slashed", (await bal("stranger")) === SEED_MICROS);
  } else {
    log("STEP 2b  the stranger appeals");
    await tx("stranger", "appeal", [BigInt(c2)], "appeal");
    await tx("stranger", "rule_appeal", [BigInt(c2)], "rule_appeal");
    spend = await api.reads.spend(s2);
    log(`  appeal label ${spend.challenge?.verdictLabel}: ${spend.challenge?.verdictReason}`);
    check("the appeal produced a second case", (await api.reads.stats()).caseCount >= 3);
    check("the appeal settled the spend", spend.status === "final" || spend.status === "reverted");
  }

  // ---- 3. a live source that changes on its own
  const gh = SCENARIOS.github;
  log("STEP 3  GitHub's live status feed; the agent claims an outage");
  const incident = await githubIncident();
  const s3 = await openSpend(gh.mandate, gh.evidenceUrl ?? "", gh.trace);
  const c3 = await challenge(s3, gh.claim, gh.evidenceUrl ?? "");
  spend = await ruled(c3, s3);
  const want = incident ? "MATCH" : "MISMATCH";
  check(`the panel agrees with the live feed (${want})`, spend.challenge?.verdictLabel === want, `got ${spend.challenge?.verdictLabel}`);

  // ---- 4. the adversarial page
  if (fixtureBase) {
    const adv = SCENARIOS.injected;
    log("STEP 4  a page that begs the panel to say MATCH");
    const url = scenarioUrl(adv, fixtureBase);
    const s4 = await openSpend(adv.mandate, url, adv.trace);
    const c4 = await challenge(s4, adv.claim, url);
    spend = await ruled(c4, s4);
    check("the injected page did not set the verdict", spend.challenge?.verdictLabel === "MISMATCH" && spend.status === "reverted");
  } else {
    log("STEP 4  skipped: set FIXTURE_BASE_URL to a public host of this app to run the adversarial page");
  }

  // ---- 5. an unchallenged spend finalizes
  if (wantUnchallenged) {
    log("STEP 5  a spend nobody challenges");
    const s5 = await openSpend(ev.mandate, ev.evidenceUrl ?? "", "agent claimed: payment is due.");
    const deadline = (await api.reads.spend(s5)).challengeDeadline;
    for (;;) {
      const now = await api.reads.chainTime();
      if (now >= deadline) break;
      log(`  waiting ${deadline - now}s for the challenge window to close`);
      await new Promise((r) => setTimeout(r, Math.min(15, deadline - now + 1) * 1000));
    }
    await tx("stranger", "finalize", [BigInt(s5)], "finalize");
    check("an unchallenged spend finalizes to the recipient", (await api.reads.spend(s5)).status === "final");
  }

  const stats = await api.reads.stats();
  const unsettled = (await api.reads.spends()).filter((s) => mine.includes(s.id) && s.status !== "final" && s.status !== "reverted");
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
