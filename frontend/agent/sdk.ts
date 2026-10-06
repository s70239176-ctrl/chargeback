/**
 * Chargeback SDK for agents.
 *
 * Two roles use it. A **payer agent** opens a spend instead of paying outright: it locks the amount
 * and a bond behind a one-paragraph mandate and the page it relied on. A **watchdog** is a stranger
 * who reads open spends, checks the cited evidence for itself and, if the page contradicts the
 * mandate, funds a second look and convenes the validator panel.
 *
 * Everything goes through the deployed contract; this file decides nothing. Amounts are integer
 * micro-units (1,000,000 = 1.00), exactly as the contract stores them.
 */
import { createChainApi, freshPrivateKey, type Hash, type Signer } from "../lib/chain.ts";
import { describeError } from "../lib/errors.ts";
import { MICROS, bondFor } from "../lib/money.ts";
import type { CaseRecord, Challenge, CourtConfig, Spend } from "../lib/types.ts";

export interface ChargebackOptions {
  /** 0x-prefixed 32-byte private key. Omit to use a fresh throwaway key (printed via `address`). */
  privateKey?: `0x${string}`;
  contract: `0x${string}`;
  rpcUrl?: string;
  chainId?: number;
}

export interface OpenSpendInput {
  recipient: string;
  /** Integer micro-units. */
  amount: number;
  mandate: string;
  evidenceUrl: string;
  trace: string;
}

export class Chargeback {
  readonly privateKey: `0x${string}`;
  readonly address: `0x${string}`;
  private readonly api;
  private readonly signer: Signer;

  constructor(opts: ChargebackOptions) {
    this.privateKey = opts.privateKey ?? freshPrivateKey();
    this.api = createChainApi({
      rpcUrl: opts.rpcUrl ?? "https://studio.genlayer.com/api",
      chainId: opts.chainId ?? 61999,
      contract: opts.contract,
    });
    this.signer = this.api.signer(this.privateKey);
    this.address = this.signer.address;
  }

  // ------------------------------------------------------------------ reads
  config(): Promise<CourtConfig> {
    return this.api.reads.config();
  }
  balance(address: string = this.address): Promise<number> {
    return this.api.reads.balance(address);
  }
  spend(id: number): Promise<Spend> {
    return this.api.reads.spend(id);
  }
  /** Newest first. */
  spends(): Promise<Spend[]> {
    return this.api.reads.spends();
  }
  cases(): Promise<CaseRecord[]> {
    return this.api.reads.cases();
  }
  chainTime(): Promise<number> {
    return this.api.reads.chainTime();
  }
  /** Spends still inside their challenge window, on the chain's clock. */
  async challengeable(): Promise<Spend[]> {
    const now = await this.chainTime();
    return (await this.spends()).filter((s) => s.status === "open" && now < s.challengeDeadline);
  }

  // ----------------------------------------------------------------- writes
  /** Mint free test balance to this account (once per address). A no-op if already seeded. */
  async seedIfNeeded(amount = 500 * MICROS): Promise<void> {
    if ((await this.balance()) > 0) return;
    try {
      await this.signer.send("seed", [BigInt(amount)]);
    } catch (e) {
      if (!/already been seeded/.test(describeError(e))) throw e;
    }
  }

  /** What opening a spend of `amount` will lock: the amount plus the bond. */
  async cost(amount: number): Promise<{ bond: number; total: number }> {
    const cfg = await this.config();
    const bond = bondFor(amount, cfg.bondBps, cfg.minBond);
    return { bond, total: amount + bond };
  }

  async openSpend(input: OpenSpendInput): Promise<{ spendId: number; hash: Hash }> {
    const hash = await this.signer.send("open_spend", [
      input.recipient,
      BigInt(input.amount),
      input.mandate,
      input.evidenceUrl,
      input.trace,
    ]);
    const mine = (await this.spends()).find(
      (s) =>
        s.payer.toLowerCase() === this.address.toLowerCase() &&
        s.evidenceUrl === input.evidenceUrl &&
        s.recipient.toLowerCase() === input.recipient.toLowerCase(),
    );
    if (!mine) throw new Error("The spend was accepted but could not be found in the contract's list.");
    return { spendId: mine.id, hash };
  }

  async challenge(
    spendId: number,
    claim: string,
    counterUrl = "",
    precedentCaseId = 0,
  ): Promise<{ challengeId: number; hash: Hash }> {
    const hash = await this.signer.send("challenge", [BigInt(spendId), claim, counterUrl, BigInt(precedentCaseId)]);
    const s = await this.spend(spendId);
    return { challengeId: s.activeChallengeId, hash };
  }

  /** Convene the validator panel. The label comes only from consensus; there is no verdict argument. */
  async rule(challengeId: number): Promise<Spend> {
    await this.signer.send("rule", [BigInt(challengeId)]);
    return this.afterChallenge(challengeId);
  }
  async appeal(challengeId: number): Promise<Hash> {
    return this.signer.send("appeal", [BigInt(challengeId)]);
  }
  async ruleAppeal(challengeId: number): Promise<Spend> {
    await this.signer.send("rule_appeal", [BigInt(challengeId)]);
    return this.afterChallenge(challengeId);
  }
  async acceptRuling(challengeId: number): Promise<Hash> {
    return this.signer.send("accept_ruling", [BigInt(challengeId)]);
  }
  async finalize(spendId: number): Promise<Hash> {
    return this.signer.send("finalize", [BigInt(spendId)]);
  }

  async challengeOf(challengeId: number): Promise<Challenge> {
    return this.api.reads.challenge(challengeId);
  }

  private async afterChallenge(challengeId: number): Promise<Spend> {
    const ch = await this.challengeOf(challengeId);
    return this.spend(ch.spendId);
  }
}

/** Read `ChargebackOptions` from the environment the way the example agents do. */
export function optionsFromEnv(env: NodeJS.ProcessEnv = process.env): ChargebackOptions {
  const contract = env.NEXT_PUBLIC_CHARGEBACK_ADDRESS ?? env.CHARGEBACK_ADDRESS;
  if (!contract || !/^0x[0-9a-fA-F]{40}$/.test(contract)) {
    throw new Error("Set CHARGEBACK_ADDRESS (or NEXT_PUBLIC_CHARGEBACK_ADDRESS) to the deployed contract.");
  }
  const key = env.AGENT_PRIVATE_KEY;
  return {
    contract: contract as `0x${string}`,
    privateKey: key && /^0x[0-9a-fA-F]{64}$/.test(key) ? (key as `0x${string}`) : undefined,
    rpcUrl: env.NEXT_PUBLIC_GENLAYER_RPC_URL,
    chainId: env.NEXT_PUBLIC_GENLAYER_CHAIN_ID ? Number(env.NEXT_PUBLIC_GENLAYER_CHAIN_ID) : undefined,
  };
}
