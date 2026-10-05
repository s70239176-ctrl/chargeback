"use client";

import { formatClock } from "../../lib/clock.ts";
import type { Spend } from "../../lib/types.ts";
import { Icon } from "../ui/Icon.tsx";
import c from "./console.module.css";

type State = "done" | "current" | "todo" | "skipped";

interface Step {
  key: string;
  title: string;
  detail: string;
  state: State;
}

const when = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") + "Z";

/** Spend opened, window, second look, ruling, appeal, settled; each step says what is known and what is not. */
export function stepsFor(spend: Spend, now: number): Step[] {
  const ch = spend.challenge;
  const ruled = ch !== null && ch.verdictLabel !== "";
  const settled = spend.status === "final" || spend.status === "reverted";
  const windowOpen = spend.status === "open" && now < spend.challengeDeadline;

  const steps: Step[] = [
    {
      key: "open",
      title: "Spend opened",
      detail: `${when(spend.openedAt)} · amount and bond locked from the payer`,
      state: "done",
    },
    {
      key: "window",
      title: ch ? "Challenge window used" : "Challenge window",
      detail: windowOpen
        ? `Closes in ${formatClock(spend.challengeDeadline - now)}`
        : ch
          ? "A stranger funded a second look inside the window"
          : `Closed ${when(spend.challengeDeadline)} with no challenge`,
      state: windowOpen ? "current" : "done",
    },
    {
      key: "second",
      title: "Second look funded",
      detail: ch ? `Challenge #${ch.id}: counter-bond posted, claim filed` : "No challenger",
      state: ch ? "done" : windowOpen ? "todo" : "skipped",
    },
    {
      key: "panel",
      title: "Validator panel",
      detail: ruled
        ? `${ch.verdictLabel}: ${ch.verdictReason}`
        : ch
          ? ch.status === "appealed"
            ? "Appeal filed, waiting for the panel to re-run"
            : "Waiting for someone to convene the panel"
          : "Convened only if a challenge is funded",
      state: ruled ? "done" : ch ? "current" : windowOpen ? "todo" : "skipped",
    },
    {
      key: "appeal",
      title: "Appeal window",
      detail:
        ch && ch.appeals === 1
          ? "Used: the panel was re-run once"
          : spend.status === "cleared"
            ? now < spend.appealDeadline
              ? `Open for ${formatClock(spend.appealDeadline - now)}; the challenger may appeal once`
              : "Lapsed without an appeal"
            : ch && ch.status === "upheld"
              ? "Not applicable: upheld rulings are final"
              : "Opens only after a rejected challenge",
      state: ch && ch.appeals === 1 ? "done" : spend.status === "cleared" ? "current" : settled && ch?.status !== "upheld" && ch ? "done" : "todo",
    },
    {
      key: "settled",
      title: settled ? (spend.status === "reverted" ? "Reverted and recovered" : "Payment released") : "Settlement",
      detail: settled
        ? `${spend.settlement.length} ledger ${spend.settlement.length === 1 ? "entry" : "entries"} paid out`
        : "Funds move only when the window lapses or a ruling is final",
      state: settled ? "done" : "todo",
    },
  ];
  return steps;
}

export function DisputeTimeline({ spend, now }: { spend: Spend; now: number }) {
  const steps = stepsFor(spend, now);
  return (
    <ol className={c.timeline} aria-label="Dispute timeline">
      {steps.map((s) => (
        <li key={s.key} className={`${c.step} ${c[`step_${s.state}`]}`}>
          <span className={c.stepMark} aria-hidden="true">
            {s.state === "done" ? <Icon name="check" size={12} /> : s.state === "current" ? <i className={c.stepPulse} /> : null}
          </span>
          <div>
            <p className={c.stepTitle}>
              {s.title}
              {s.state === "skipped" && <span className={c.faint}> · skipped</span>}
            </p>
            <p className={c.stepDetail}>{s.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
