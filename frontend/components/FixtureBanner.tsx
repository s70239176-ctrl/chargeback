"use client";

import { useState } from "react";
import type { useFixtureBase } from "../lib/fixtureBase.ts";
import styles from "./Shell.module.css";

type Fx = ReturnType<typeof useFixtureBase>;

export function FixtureBanner({ fx }: { fx: Fx }) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);

  function save(e: React.FormEvent) {
    e.preventDefault();
    fx.setBase(draft);
    setEditing(false);
  }

  if (!fx.isPrivate && !editing) {
    return (
      <p className={styles.fixtures}>
        Evidence pages are served from <span className="mono">{fx.base || "…"}</span>.{" "}
        <button type="button" className="btn btnQuiet" onClick={() => (setDraft(fx.base), setEditing(true))}>
          change host
        </button>
      </p>
    );
  }

  return (
    <form className={styles.warn} onSubmit={save}>
      <p>
        {fx.isPrivate
          ? "This app is on localhost, but Studio's validators fetch evidence from the public internet, so they cannot read the demo pages from here. "
          : "Where should the demo evidence pages come from? "}
        Run a tunnel to this app (for example <span className="mono">cloudflared tunnel --url http://localhost:3000</span>)
        and paste its https address:
      </p>
      <div className={styles.warnRow}>
        <input
          className="field mono"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://your-tunnel.trycloudflare.com"
          aria-label="Public base URL of this app"
          spellCheck={false}
        />
        <button type="submit" className="btn" disabled={!/^https:\/\/[^\s/]+/.test(draft.trim())}>
          Use this host
        </button>
        {editing && (
          <button type="button" className="btn btnQuiet" onClick={() => setEditing(false)}>
            cancel
          </button>
        )}
      </div>
    </form>
  );
}
