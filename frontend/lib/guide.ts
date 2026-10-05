import { activeDeadline } from "./clock.ts";
import type { Role, Spend } from "./types.ts";

export interface GuideInput {
  seeded: boolean;
  spends: readonly Spend[];
  active: Role;
  chainNow: number;
  addresses: Readonly<Record<Role, string>>;
}

/**
 * One sentence telling a reviewer what to click next, derived only from on-chain state.
 * It never fabricates progress: with no spends it says to open one, and so on.
 */
export function nextStep(input: GuideInput): string {
  const { seeded, spends, active, chainNow, addresses } = input;
  if (!seeded) return "Press “Seed demo accounts”. It mints free mock USDC to the three accounts so you can play every side.";
  if (spends.length === 0) return "Open a spend in column 1. The BA283 mandate is prefilled; press “Lock funds”.";

  const pending = spends.find((s) => s.status === "challenged" && s.challenge?.status === "pending");
  if (pending) return `Spend #${pending.id} has a challenge waiting. Press “Convene the panel” in column 3. Anyone can.`;

  const appealed = spends.find((s) => s.challenge?.status === "appealed");
  if (appealed) return `Spend #${appealed.id} is on appeal. Press “Run the appeal panel” in column 3.`;

  const open = spends.find((s) => s.status === "open");
  if (open) {
    const deadline = activeDeadline(open);
    if (deadline !== null && chainNow >= deadline) {
      return `The challenge window on spend #${open.id} has closed with no challenge. Press “Finalize” to pay the recipient.`;
    }
    if (active !== "stranger") {
      return `Switch to Stranger in column 2, then fund a second look at spend #${open.id}. Payer and recipient are not allowed to.`;
    }
    return `Fund a second look at spend #${open.id}: write the claim and press the challenge button in column 2.`;
  }

  const cleared = spends.find((s) => s.status === "cleared");
  if (cleared) {
    const ch = cleared.challenge;
    const you = ch !== null && ch.challenger.toLowerCase() === addresses[active].toLowerCase();
    return you
      ? `The challenge on spend #${cleared.id} lost. Appeal once with a second bond, or accept the ruling to settle now.`
      : `Spend #${cleared.id} cleared. The challenger can still appeal; after the window anyone can finalize it.`;
  }
  return "Everything is settled. Open another spend, or try the jailbreak page: it begs the panel to say MATCH.";
}
