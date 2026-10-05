/** A contract revert, carrying the exact reason string the contract raised. */
export class RevertError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = "RevertError";
    this.reason = reason;
  }
}

/** A transaction that did not produce a result (validators disagreed, timed out, was cancelled). */
export class TxFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TxFailure";
  }
}

const PREFIX = "EXPECTED: ";

export function stripPrefix(message: string): string {
  return message.startsWith(PREFIX) ? message.slice(PREFIX.length) : message;
}

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Studio reports a contract revert as base64: one result-tag byte (1 for a user error) followed by
 * the UTF-8 reason. Returns null when the value is not that shape.
 */
export function decodeRevertPayload(b64: string): string | null {
  try {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    if (bytes.length < 2 || bytes[0] === undefined || bytes[0] >= 0x20) return null;
    const text = bytesToText(bytes.slice(1));
    return text.includes(PREFIX) || /^[\x20-\x7e]+$/.test(text) ? stripPrefix(text) : null;
  } catch {
    return null;
  }
}

function dig(value: unknown, path: readonly string[]): unknown {
  let cur: unknown = value;
  for (const key of path) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** The revert reason inside a simulate/RPC error, if there is one. */
export function revertFromRpcError(error: unknown): string | null {
  const direct = dig(error, ["cause", "data", "receipt", "result"]);
  if (typeof direct === "string") {
    const decoded = decodeRevertPayload(direct);
    if (decoded) return decoded;
  }
  return null;
}

/**
 * The revert reason inside a finished transaction, if the leader's execution failed. Only the
 * leader's receipt counts: validators that sat the round out report their own "idle" result.
 */
export function revertFromReceipt(tx: unknown): string | null {
  const receipts = dig(tx, ["consensus_data", "leader_receipt"]);
  if (!Array.isArray(receipts) || receipts.length === 0) return null;
  const leader = receipts.find((r) => dig(r, ["mode"]) === "leader") ?? receipts[0];
  if (dig(leader, ["execution_result"]) !== "ERROR") return null;
  const payload = dig(leader, ["result", "payload"]);
  if (typeof payload === "string" && payload !== "") return stripPrefix(payload);
  const raw = dig(leader, ["result"]);
  if (typeof raw === "string") {
    const decoded = decodeRevertPayload(raw);
    if (decoded) return decoded;
  }
  return "The contract rejected this transaction.";
}

/** Text safe to show a person for any thrown value. */
export function describeError(error: unknown): string {
  if (error instanceof RevertError) return error.reason;
  if (error instanceof TxFailure) return error.message;
  const fromRpc = revertFromRpcError(error);
  if (fromRpc) return fromRpc;
  if (error instanceof Error) {
    const m = error.message.split("\n")[0] ?? error.message;
    if (/fetch|network|Failed to fetch|ECONN|ENOTFOUND/i.test(m)) {
      return "Could not reach the GenLayer RPC. Check the network and the NEXT_PUBLIC_GENLAYER_RPC_URL setting.";
    }
    return m;
  }
  return "Something went wrong.";
}
