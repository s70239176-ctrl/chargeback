"use client";

import type { ReactNode } from "react";
import type { Point, Tally } from "../../lib/derive.ts";
import { Panel } from "../ui/index.tsx";
import c from "./console.module.css";

/** A chart card always opens with the business question it answers, then says what it shows. */
export function ChartCard({ question, answer, children }: { question: string; answer: ReactNode; children: ReactNode }) {
  return (
    <Panel>
      <h3 className={c.question}>{question}</h3>
      <p className={c.answer}>{answer}</p>
      {children}
    </Panel>
  );
}

export function AreaChart({ points, unit = "" }: { points: readonly Point[]; unit?: string }) {
  const W = 520;
  const H = 160;
  const pad = 8;
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = points.length > 1 ? (W - pad * 2) / (points.length - 1) : 0;
  const xy = points.map((p, i) => [pad + i * step, H - 22 - (p.value / max) * (H - 44)] as const);
  const line = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = xy.length ? `${line} L${xy[xy.length - 1]![0].toFixed(1)},${H - 22} L${xy[0]![0].toFixed(1)},${H - 22} Z` : "";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={c.area} role="img" aria-label={`Chart: ${points.map((p) => `${p.label} ${p.value}${unit}`).join(", ")}`}>
      <defs>
        <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--info)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--info)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad} x2={W - pad} y1={H - 22 - g * (H - 44)} y2={H - 22 - g * (H - 44)} className={c.grid} />
      ))}
      <path d={area} fill="url(#areaFill)" className={c.areaFill} />
      <path d={line} className={c.areaLine} pathLength={1} />
      {xy.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} className={c.areaDot}>
          <title>{`${points[i]!.label}: ${points[i]!.value}${unit}`}</title>
        </circle>
      ))}
      {points.map((p, i) =>
        i % Math.ceil(points.length / 5) === 0 ? (
          <text key={i} x={xy[i]![0]} y={H - 4} textAnchor="middle" className={c.axisText}>
            {p.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export function BarList({ items, format = (v: number) => String(v), tone }: { items: readonly Tally[]; format?: (v: number) => string; tone?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className={c.bars}>
      {items.map((i) => (
        <li key={i.label}>
          <div className={c.barRow}>
            <span>{i.label}</span>
            <span className="mono">{format(i.value)}</span>
          </div>
          <div className={c.barTrack}>
            <div className={c.barFill} style={{ width: `${(i.value / max) * 100}%`, background: tone ?? "var(--text-2)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
