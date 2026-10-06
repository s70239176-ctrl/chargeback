/**
 * Example watchdog: a stranger who audits agent spend.
 *
 * It polls the contract for spends still inside their challenge window, fetches each cited page
 * for itself, and applies a policy. If the policy says the page contradicts the mandate, it posts a
 * bond, files a claim and convenes the validator panel. It never decides anything: the label comes
 * from validator consensus, and if the watchdog is wrong it loses its bond.
 *
 * The policy below is for the GitHub-status mandate the example payer agent uses. Write your own
 * `Policy` for other mandates; it is just a function from a spend and its page to a claim or null.
 *
 *   cd frontend
 *   CHARGEBACK_ADDRESS=0x... npm run agent:watchdog            # watch forever
 *   CHARGEBACK_ADDRESS=0x... npm run agent:watchdog -- --once  # one pass, then exit
 */
import { Chargeback, optionsFromEnv } from "./sdk.ts";
import { describeError } from "../lib/errors.ts";
import type { Spend } from "../lib/types.ts";

/** Returns the claim to file, or null to leave the spend alone. */
type Policy = (spend: Spend, page: string) => string | null;

const githubStatusPolicy: Policy = (spend, page) => {
  if (!/githubstatus\.com/.test(spend.evidenceUrl)) return null;
  if (!/incident|degraded|outage/i.test(spend.mandate)) return null;
  try {
    const body = JSON.parse(page) as { status?: { indicator?: string; description?: string } };
    const indicator = body.status?.indicator;
    if (indicator === "none") {
      return `The cited status feed currently reports "${body.status?.description}" (indicator none), so GitHub is not experiencing an incident and the credit should not have been released.`;
    }
  } catch {
    /* not JSON: leave it */
  }
  return null;
};

const POLICIES: Policy[] = [githubStatusPolicy];
const once = process.argv.includes("--once");
const seen = new Set<number>();

async function pass(cb: Chargeback) {
  for (const spend of await cb.challengeable()) {
    if (seen.has(spend.id)) continue;
    seen.add(spend.id);
    if (spend.payer.toLowerCase() === cb.address.toLowerCase() || spend.recipient.toLowerCase() === cb.address.toLowerCase()) continue;

    let page: string;
    try {
      page = await (await fetch(spend.evidenceUrl)).text();
    } catch (e) {
      console.log(`spend #${spend.id}: could not read ${spend.evidenceUrl} (${describeError(e)})`);
      continue;
    }
    const claim = POLICIES.map((p) => p(spend, page)).find((c) => c !== null);
    if (!claim) {
      console.log(`spend #${spend.id}: the page does not contradict the mandate, leaving it.`);
      continue;
    }
    console.log(`spend #${spend.id}: challenging. ${claim}`);
    try {
      const { challengeId } = await cb.challenge(spend.id, claim, spend.evidenceUrl);
      console.log(`  bond posted, challenge #${challengeId}. Convening the panel…`);
      const after = await cb.rule(challengeId);
      const ch = after.challenge;
      console.log(`  ruling: ${ch?.verdictLabel}. ${ch?.verdictReason}`);
      console.log(`  spend #${after.id} is now ${after.status}.`);
    } catch (e) {
      console.log(`  could not challenge: ${describeError(e)}`);
    }
  }
}

async function main() {
  const cb = new Chargeback(optionsFromEnv());
  console.log(`watchdog ${cb.address}`);
  await cb.seedIfNeeded();
  do {
    await pass(cb);
    if (!once) await new Promise((r) => setTimeout(r, 15_000));
  } while (!once);
}

main().catch((e) => {
  console.error(describeError(e));
  process.exit(1);
});
