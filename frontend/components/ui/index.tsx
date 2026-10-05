"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Spend } from "../../lib/types.ts";
import { Icon, type IconName } from "./Icon.tsx";
import s from "./ui.module.css";

const cx = (...parts: Array<string | false | undefined | null>) => parts.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ Button */
type Variant = "secondary" | "primary" | "positive" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: IconName;
  iconOnly?: boolean;
}

export function Button({ variant = "secondary", size = "md", loading, icon, iconOnly, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(s.btn, variant !== "secondary" && s[variant], size !== "md" && s[size], iconOnly && s.icon, loading && s.loading, className)}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  icon,
  children,
  external,
}: {
  href: string;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  children: ReactNode;
  external?: boolean;
}) {
  const className = cx(s.btn, variant !== "secondary" && s[variant], size !== "md" && s[size]);
  const body = (
    <>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </>
  );
  return external ? (
    <a href={href} className={className} target="_blank" rel="noreferrer">
      {body}
    </a>
  ) : (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}

/* ------------------------------------------------------------------- Badge */
export type Tone = "neutral" | "positive" | "warning" | "danger" | "info" | "intel";

export function Badge({ tone = "neutral", pulse, children }: { tone?: Tone; pulse?: boolean; children: ReactNode }) {
  return (
    <span className={cx(s.badge, tone !== "neutral" && s[`t-${tone}`], pulse && s.pulse)}>
      <span className={s.dot} aria-hidden="true" />
      {children}
    </span>
  );
}

/** One place that decides how a spend's state is worded and coloured. */
export function statusOf(spend: Pick<Spend, "status" | "challengeDeadline" | "appealDeadline" | "challenge">, now: number, tick: number): { tone: Tone; text: string; pulse: boolean } {
  switch (spend.status) {
    case "open":
      if (now >= spend.challengeDeadline) return { tone: "danger", text: "Releasing", pulse: true };
      if (spend.challengeDeadline - now <= tick) return { tone: "warning", text: "Closing", pulse: true };
      return { tone: "info", text: "Provisional", pulse: true };
    case "challenged":
      return { tone: "intel", text: spend.challenge?.status === "appealed" ? "On appeal" : "Awaiting panel", pulse: true };
    case "cleared":
      return { tone: "warning", text: "Appealable", pulse: false };
    case "reverted":
      return { tone: "positive", text: "Recovered", pulse: false };
    default:
      return { tone: "neutral", text: "Released", pulse: false };
  }
}

export function StatusBadge({ spend, now, tick }: { spend: Parameters<typeof statusOf>[0]; now: number; tick: number }) {
  const st = statusOf(spend, now, tick);
  return (
    <Badge tone={st.tone} pulse={st.pulse}>
      {st.text}
    </Badge>
  );
}

/* ------------------------------------------------------------------- Panel */
export function Panel({
  title,
  action,
  tone,
  flush,
  children,
  className,
  as: Tag = "section",
}: {
  title?: ReactNode;
  action?: ReactNode;
  tone?: "intel" | "risk";
  flush?: boolean;
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "aside";
}) {
  return (
    <Tag className={cx(s.panel, tone === "intel" && s.toneIntel, tone === "risk" && s.toneRisk, className)}>
      {(title || action) && (
        <header className={s.panelHead}>
          {title && <h2 className={s.kicker}>{title}</h2>}
          {action}
        </header>
      )}
      <div className={cx(s.panelBody, flush && s.flush)}>{children}</div>
    </Tag>
  );
}

/* ----------------------------------------------------------------- Metric */
export function useCountUp(target: number, ms = 700): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || from.current === target) {
      from.current = target;
      setV(target);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(a + (target - a) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function Metric({
  label,
  value,
  format,
  foot,
  delta,
  size = "md",
  tone,
}: {
  label: string;
  value: number;
  format: (v: number) => string;
  foot?: ReactNode;
  delta?: { text: string; good: boolean } | null;
  size?: "md" | "xl";
  tone?: "positive" | "danger" | "warning";
}) {
  const shown = useCountUp(value);
  return (
    <div className={s.metric}>
      <p className={s.kicker}>{label}</p>
      <p
        className={cx(s.metricValue, size === "xl" && s.xl)}
        style={tone ? { color: `var(--${tone})` } : undefined}
        aria-label={`${label}: ${format(value)}`}
      >
        <span aria-hidden="true">{format(shown)}</span>
      </p>
      {(foot || delta) && (
        <p className={s.metricFoot}>
          {delta && <span className={delta.good ? s.up : s.down}>{delta.text} </span>}
          {foot}
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- Skeleton */
export function Skeleton({ w = "100%", h = 16 }: { w?: number | string; h?: number }) {
  return <span className={s.skeleton} style={{ width: w, height: h }} aria-hidden="true" />;
}

/* ------------------------------------------------------------ EmptyState */
export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className={s.empty} role="status">
      <p className={s.emptyTitle}>{title}</p>
      <p className={s.emptyBody}>{body}</p>
      {action && <div className={s.emptyAction}>{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------ FilterChips */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{ id: T; label: string; count?: number }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className={s.chips} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          className={cx(s.chip, o.id === value && s.chipOn)}
          onClick={() => onChange(o.id)}
        >
          {o.label}
          {o.count !== undefined && <span style={{ color: "var(--text-3)", marginLeft: 6 }}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- Drawer */
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={s.drawer}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className={s.drawerInner}>
          <div className={s.drawerHead}>
            <h2 id={titleId} className={s.drawerTitle}>
              {title}
            </h2>
            <Button variant="ghost" iconOnly icon="close" onClick={onClose} aria-label="Close" />
          </div>
          <div className={s.drawerBody}>{children}</div>
        </div>
      )}
    </dialog>
  );
}

/* ------------------------------------------------------------------ Field */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className={s.field}>
      <label className={s.fieldLabel} htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className={s.hint}>{hint}</p>}
      {error && (
        <p className={s.errorText} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass = s.input;
export const monoClass = s.mono;
export const hintClass = s.hint;
export const errorClass = s.errorText;
export const srOnly = s.srOnly;

/* ---------------------------------------------------------------- Tooltip */
export function Tip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className={s.tip} data-tip={text}>
      {children}
    </span>
  );
}
