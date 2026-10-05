import type { Spend } from "./types.ts";

export type View = "opportunities" | "disputes" | "won" | "lost";

export const VIEW_META: Record<View, { title: string; blurb: string; empty: { title: string; body: string } }> = {
  opportunities: {
    title: "Opportunities",
    blurb: "Provisional spends still inside their challenge window. A stranger can fund a second look at any of them.",
    empty: {
      title: "No spends are open to challenge.",
      body: "When a payer locks a spend behind a mandate, it appears here with a live countdown.",
    },
  },
  disputes: {
    title: "Active disputes",
    blurb: "Challenges waiting for the validator panel, and rulings still inside their appeal window.",
    empty: {
      title: "Your dispute queue is clear.",
      body: "When a stranger funds a second look, it appears here until the panel rules and the appeal window passes.",
    },
  },
  won: {
    title: "Won",
    blurb: "Challenges the panel upheld. The spend was reverted and the funds went back to the payer.",
    empty: {
      title: "Nothing recovered yet.",
      body: "A challenge the panel upholds lands here with the amount returned and the bonds it moved.",
    },
  },
  lost: {
    title: "Lost",
    blurb: "Challenges the panel rejected. The challenger's bond was slashed and the recipient was paid.",
    empty: {
      title: "No lost challenges.",
      body: "Challenges that fail, whether MATCH or INCONCLUSIVE, are recorded here with the ruling that decided them.",
    },
  },
};

export function inView(view: View, s: Spend, now: number): boolean {
  switch (view) {
    case "opportunities":
      return s.status === "open" && now < s.challengeDeadline;
    case "disputes":
      return s.status === "challenged" || s.status === "cleared";
    case "won":
      return s.status === "reverted";
    case "lost":
      return s.status === "final" && s.challenge !== null;
  }
}
