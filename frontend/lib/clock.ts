import type { Spend } from "./types.ts";

export interface Countdown {
  /** Whole ticks remaining, 0 when the window has closed. */
  ticksLeft: number;
  secondsLeft: number;
  closed: boolean;
}

/** Ticks and seconds left until `deadline`, on the chain's clock. */
export function countdown(deadline: number, chainNow: number, tickSeconds: number): Countdown {
  const secondsLeft = Math.max(0, deadline - chainNow);
  return {
    ticksLeft: secondsLeft === 0 ? 0 : Math.ceil(secondsLeft / tickSeconds),
    secondsLeft,
    closed: secondsLeft === 0,
  };
}

/** The deadline that governs a spend right now: the challenge window, or the appeal window after a ruling. */
export function activeDeadline(spend: Pick<Spend, "status" | "challengeDeadline" | "appealDeadline">): number | null {
  if (spend.status === "open") return spend.challengeDeadline;
  if (spend.status === "cleared") return spend.appealDeadline;
  return null;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}
