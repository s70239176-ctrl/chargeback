"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatClock } from "../../lib/clock.ts";
import { radarNodes, summarize, type RadarNode } from "../../lib/derive.ts";
import { usd, usdCompact } from "../../lib/money.ts";
import type { Spend } from "../../lib/types.ts";
import { FilterChips, statusOf } from "../ui/index.tsx";
import c from "./console.module.css";

type Filter = "all" | "expiring" | "value" | "challenged" | "mine";

const W = 640;
const H = 420;
const CX = W / 2;
const CY = H / 2;

const FILL: Record<string, string> = {
  info: "var(--info)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  intel: "var(--intel)",
  positive: "var(--positive)",
  neutral: "var(--text-3)",
};

/**
 * Recovery Radar: every spend as a node. Closer to the middle means closer to a decision (its
 * window is about to close, or a panel is about to rule); bigger means more money.
 */
export function RecoveryRadar({
  spends,
  now,
  tick,
  windowSeconds,
  isMine,
}: {
  spends: readonly Spend[];
  now: number;
  tick: number;
  windowSeconds: number;
  isMine: (s: Spend) => boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [hover, setHover] = useState<number | null>(null);

  const byId = useMemo(() => new Map(spends.map((s) => [s.id, s])), [spends]);
  const nodes = useMemo(() => radarNodes(spends, now, windowSeconds), [spends, now, windowSeconds]);
  const maxAmount = Math.max(1, ...nodes.map((n) => n.amount));
  const median = useMemo(() => {
    const a = nodes.map((n) => n.amount).sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)] ?? 0;
  }, [nodes]);

  const passes = (n: RadarNode): boolean => {
    const s = byId.get(n.id);
    if (!s) return false;
    switch (filter) {
      case "expiring":
        return s.status === "open" && s.challengeDeadline - now <= tick;
      case "value":
        return n.amount >= median && n.amount > 0;
      case "challenged":
        return s.challenge !== null;
      case "mine":
        return isMine(s);
      default:
        return true;
    }
  };

  const money = summarize(spends);
  const shown = nodes.filter(passes);
  const active = hover !== null ? byId.get(hover) : undefined;
  const activeNode = nodes.find((n) => n.id === hover);

  const pos = (n: RadarNode) => {
    const r = 46 + n.freshness * 140;
    return { x: CX + Math.cos(n.angle) * r * 1.55, y: CY + Math.sin(n.angle) * r };
  };

  return (
    <div className={c.radar}>
      <div className={c.radarBar}>
        <FilterChips<Filter>
          label="Radar filter"
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: "All" },
            { id: "expiring", label: "Expiring" },
            { id: "value", label: "High value" },
            { id: "challenged", label: "Challenged" },
            { id: "mine", label: "Mine" },
          ]}
        />
      </div>

      <div className={c.radarStage}>
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Recovery radar of spends" className={c.radarSvg}>
          {[60, 120, 180].map((r, i) => (
            <ellipse key={r} cx={CX} cy={CY} rx={r * 1.55} ry={r} className={c.ring} style={{ opacity: 1 - i * 0.18 }} />
          ))}
          <line x1={CX} y1={CY - 190} x2={CX} y2={CY + 190} className={c.axis} />
          <line x1={CX - 290} y1={CY} x2={CX + 290} y2={CY} className={c.axis} />
          <text x={CX - 292} y={CY - 8} className={c.ringLabel}>
            fresh window
          </text>
          <text x={CX - 292} y={CY + 10} className={c.ringLabel} style={{ opacity: 0.6 }}>
            outer ring
          </text>
          <text x={CX + 98} y={CY - 8} className={c.ringLabel}>
            decision
          </text>

          {shown.map((n, i) => {
            const s = byId.get(n.id);
            if (!s) return null;
            const p = pos(n);
            const st = statusOf(s, now, tick);
            const rad = 7 + Math.sqrt(n.amount / maxAmount) * 17;
            return (
              <g
                key={n.id}
                className={c.node}
                style={{ animationDelay: `${(i % 7) * -1.1}s` }}
                tabIndex={0}
                role="link"
                aria-label={`Spend ${n.id}, ${usd(n.amount)}, ${st.text}`}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(n.id)}
                onBlur={() => setHover(null)}
                onClick={() => router.push(`/console/spend/${n.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/console/spend/${n.id}`);
                  }
                }}
              >
                <line x1={CX} y1={CY} x2={p.x} y2={p.y} className={c.link} />
                <circle cx={p.x} cy={p.y} r={rad + 5} fill={FILL[st.tone]} opacity={hover === n.id ? 0.22 : 0.08} />
                <circle cx={p.x} cy={p.y} r={rad} fill={FILL[st.tone]} opacity={0.9} />
                {rad > 13 && (
                  <text x={p.x} y={p.y + 3.5} textAnchor="middle" className={c.nodeText}>
                    {usdCompact(n.amount)}
                  </text>
                )}
              </g>
            );
          })}

          <text x={CX} y={CY - 4} textAnchor="middle" className={c.centerValue}>
            {usd(money.underWatch)}
          </text>
          <text x={CX} y={CY + 16} textAnchor="middle" className={c.centerLabel}>
            UNDER WATCH
          </text>
        </svg>

        {active && activeNode && (
          <div
            className={c.tip}
            style={{
              left: `${Math.min(78, Math.max(4, (pos(activeNode).x / W) * 100))}%`,
              top: `${Math.min(70, Math.max(2, (pos(activeNode).y / H) * 100 + 4))}%`,
            }}
            role="tooltip"
          >
            <p className={c.tipHead}>
              <span className="mono">Spend #{active.id}</span> · {statusOf(active, now, tick).text}
            </p>
            <p className={c.tipAmount}>{usd(active.amount)}</p>
            <p className={c.tipRow}>
              {active.status === "open" && active.challengeDeadline > now
                ? `Window closes in ${formatClock(active.challengeDeadline - now)}`
                : active.status === "cleared" && active.appealDeadline > now
                  ? `Appeal window ${formatClock(active.appealDeadline - now)} left`
                  : "No open deadline"}
            </p>
            <p className={c.tipMandate}>{active.mandate}</p>
          </div>
        )}

        {shown.length === 0 && (
          <p className={c.radarEmpty}>
            {spends.length === 0 ? "Nothing on the radar yet. Open a spend and it appears here." : "No spends match this filter."}
          </p>
        )}
      </div>

      <ul className={c.legend} aria-label="Legend">
        <li><i style={{ background: FILL.info }} />Provisional</li>
        <li><i style={{ background: FILL.warning }} />Closing</li>
        <li><i style={{ background: FILL.intel }} />Awaiting panel</li>
        <li><i style={{ background: FILL.positive }} />Recovered</li>
        <li><i style={{ background: FILL.neutral }} />Released</li>
      </ul>
    </div>
  );
}
