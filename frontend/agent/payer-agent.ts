/**
 * Example payer agent: an SLA-credit bot.
 *
 * Its job is to release an SLA credit to a customer when GitHub is having an incident. It makes a
 * decision from real data and, instead of paying outright, opens a Chargeback spend so any stranger
 * can check the claim before the money moves.
 *
 * Its rule is deliberately the kind of thing real agents get wrong: it looks at the incidents feed
 * and treats ANY incident in the last 30 days as "GitHub had an outage", while its mandate says
 * "currently experiencing an incident". That is a common stale-evidence mistake, not a planted bug.
 *
 *   cd frontend
 *   CHARGEBACK_ADDRESS=0x... npm run agent:payer
 *   CHARGEBACK_ADDRESS=0x... AGENT_PRIVATE_KEY=0x... RECIPIENT=0x... npm run agent:payer
 */
import { Chargeback, optionsFromEnv } from "./sdk.ts";
import { addressOf, freshPrivateKey } from "../lib/chain.ts";
import { describeError } from "../lib/errors.ts";
import { MICROS, formatUsdc } from "../lib/money.ts";

const STATUS = "https://www.githubstatus.com/api/v2/status.json";
const INCIDENTS = "https://www.githubstatus.com/api/v2/incidents.json";
const MANDATE =
  "Release the SLA credit only if the page reports that GitHub is currently experiencing an incident or degraded service.";
const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

interface Incident {
  name: string;
  status: string;
  impact: string;
  created_at: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return (await res.json()) as T;
}

async function main() {
  const cb = new Chargeback(optionsFromEnv());
  console.log(`payer agent ${cb.address}`);
  await cb.seedIfNeeded();

  const { incidents } = await getJson<{ incidents: Incident[] }>(INCIDENTS);
  const recent = incidents.find((i) => Date.now() - Date.parse(i.created_at) < THIRTY_DAYS);
  if (!recent) {
    console.log("No incident in the last 30 days: nothing to pay. (The agent stays quiet when it has no claim.)");
    return;
  }

  const amount = Number(process.env.AMOUNT_UNITS ?? 25) * MICROS;
  const recipient = process.env.RECIPIENT ?? addressOf(freshPrivateKey());
  const { total } = await cb.cost(amount);
  if ((await cb.balance()) < total) throw new Error(`Need ${formatUsdc(total)} to open this spend.`);

  const trace =
    `agent claimed: GitHub had an incident ("${recent.name}", ${recent.created_at.slice(0, 10)}, impact ${recent.impact}); ` +
    `released the SLA credit.`;
  console.log(`decision: ${trace}`);
  const { spendId, hash } = await cb.openSpend({ recipient, amount, mandate: MANDATE, evidenceUrl: STATUS, trace });
  console.log(`opened spend #${spendId} for ${formatUsdc(amount)} (tx ${hash.slice(0, 12)}…). It finalizes only if nobody challenges.`);
}

main().catch((e) => {
  console.error(describeError(e));
  process.exit(1);
});
