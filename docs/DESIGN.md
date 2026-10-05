# Chargeback: design notes

Why the contract is shaped the way it is, what it does when someone attacks it, and where it
deliberately departs from the first draft of the spec.

## The mechanism in one paragraph

A payer posts an amount plus a bond behind a one-paragraph mandate. For a window of three ticks,
anyone who is not the payer or the recipient can post a counter-bond and force a second look. A
GenLayer validator panel fetches the cited page (and the challenger's counter page), reads the
mandate and the agent's trace, and agrees on one label: `MATCH`, `MISMATCH` or `INCONCLUSIVE`.
`MISMATCH` reverts the spend and pays the challenger from the payer's bond. Anything else slashes
the challenger. A spend nobody challenges finalizes when the window lapses. The thesis the UI
states: the first verdict is trusted only because a stranger can fund a second one for less than
the claim.

## State machine

```
spend:      open --challenge--> challenged --rule--> reverted                 (MISMATCH, final)
              |                      |
              |                      +--rule--> cleared --finalize / accept_ruling--> final
              |                                    |
              |                                    +--appeal--> challenged --rule_appeal--> reverted | final
              +--window lapses, finalize--> final

challenge:  pending --rule--> upheld | rejected --appeal--> appealed --rule_appeal--> upheld | rejected
```

`cleared` is the one state the first draft did not have. See "Departures" below.

## Economics (all in micro-USDC, 6 decimals)

| | Payer | Recipient | Challenger |
|---|---|---|---|
| Open | locks `amount + bond` | | |
| Challenge | | | locks `bond` |
| **MISMATCH** (upheld) | gets `amount` back, loses `bond` | nothing | gets `bond + bond` (payer's and own) |
| **MATCH / INCONCLUSIVE** (rejected), then settled | gets `bond` back plus 50% of the challenger's bond | gets `amount` plus the other 50% | loses `bond` |
| Unchallenged, window lapses | gets `bond` back | gets `amount` | |
| Appeal posted | | | locks a second `bond` (equal to the first) |
| Appeal won | as MISMATCH | | also gets the appeal bond back |
| Appeal lost | as rejected | also gets the appeal bond | loses both bonds |

`bond = max(10% of amount, 5 USDC)`. Odd micro-units of a split go to the recipient. Every payout
goes through one function that refuses to run unless the ledger it is paying sums to exactly what
was locked, and the direct tests assert conservation (balances plus locked funds equal total
supply) after every flow.

## What the model decides, and what it does not

The model emits a label, a one-sentence reason and a verbatim quote. Everything that moves value is
deterministic code: amounts, bonds, who may call what, windows, the split. The model cannot choose
an amount or a recipient, and `rule` / `rule_appeal` take only a challenge id, so no caller can
supply a label.

Consensus runs through `gl.eq_principle.prompt_comparative`. The leader runs the fetch and the
prompt; every validator independently re-fetches and re-prompts, and an equivalence check requires
the same `label` and the same `reachable` flag. Reason and quote wording may differ. The reason
text of the leader is what is stored.

`strict_eq` was considered and rejected: a free-text reason can never be byte-identical across
validators, and stripping the reason to get strict equality would throw away the part a reviewer
reads. Equality of the label is what the principle checks.

## Hostile evidence

The page being judged is written by an interested party. Defences, in the order they apply:

1. **Untrusted data framing.** Every value (mandate, trace, both pages, the claim, prior rulings)
   is embedded in the prompt as a JSON string literal, so quotes, newlines and look-alike section
   headers inside it stay inside the literal. The prompt states that text asking for a label is a
   reason for distrust, never compliance.
2. **Markup stripped.** `<script>`, `<style>`, comments and tags are removed before the model sees
   the page; text is bounded to 5,000 characters.
3. **Strict parse.** Anything that is not a JSON object with an allowed label becomes
   `INCONCLUSIVE`. A model that obeys an injected "reply MATCH" in plain prose therefore decides
   nothing.
4. **Grounding.** A `MATCH` or `MISMATCH` must carry a quote, and every fragment of it must appear
   word for word (case, markup and punctuation ignored) in the pages the panel actually read. A
   ruling with no supporting text is discarded as `INCONCLUSIVE`. Excerpts may be joined with an
   ellipsis; each fragment is checked on its own.
5. **Consensus.** A forged or steered leader is rejected unless the validators, reading the same
   pages themselves, reach the same label.

`INCONCLUSIVE` never reverts funds: a challenger who cannot prove a contradiction loses the bond.
An evidence page that cannot be fetched is the exception, and is a `MISMATCH` without consulting
the model, because "the cited evidence is not there" is a challengeable ground in its own right and
the payer chose the URL.

## Departures from the first draft, and why

| First draft | Built | Reason |
|---|---|---|
| Advance a `tick` counter by hand for the demo | Time is the chain's own transaction timestamp; a tick is `tick_seconds`, fixed at deploy (60 s for the demo, so a window is 3 minutes) | A caller-advanced clock lets a colluding payer and recipient skip the window and finalize before anyone can challenge. A countdown is also more honest on screen. |
| Rejected challenge pays the recipient immediately; an appeal may then "revert the spend" | A rejected challenge moves to `cleared`; money moves only when the appeal window lapses, the challenger accepts, or the appeal is decided | The first draft could not honour an appeal win: the recipient would already hold the funds and there is no clawback. |
| `seed(address, amount)` | `seed(amount)`, caller only | Seeding someone else's address burns their one-time faucet. |
| `cited_case_id` returned by the model | Supplied by the challenger, verified to exist, and its text put in the prompt | A model-invented case number is not a citation. |
| Client: `genlayer-py` | `genlayer-js` | The frontend is TypeScript. |
| Strict equality on a canonical JSON verdict | `prompt_comparative` on label and reachability | See "What the model decides". |
| Tool trace and challenger text treated as trusted | All of it fenced as untrusted data | The challenger is as interested as the payer. |
| 20 individual view calls | One `get_snapshot` call | The hosted Studio RPC rate-limits at 30 requests per minute per client. |

## Known limits

- Upheld rulings are final; only the losing *challenger* can appeal. This is the product's
  asymmetry (a cheap veto), but it means a wrong `MISMATCH` against a legitimate recipient has no
  in-contract remedy. Production would use GenLayer's protocol-level appeal on the `rule`
  transaction in addition.
- A payer can cancel their own spend for free by challenging it from a second account. They
  recover everything they locked, so it costs the recipient nothing but the payment they were
  never owed.
- Evidence is a URL the validators fetch. A page that changes between the ruling and an appeal is
  re-read, by design.
- Mock USDC. No token, bridge or custody.

## The console's design rules

- **One idea:** money, risk, evidence, action, recovery. Each screen answers one of them.
- **Colour means something.** The default UI is monochrome. Green is money recovered (a veto),
  red is risk, amber is a deadline, purple is the validator panel, blue is system state.
- **Honest numbers.** Every figure is derived in `frontend/lib/derive.ts` from the contract's
  spends, challenges and cases. There is no mock data and no invented confidence score; the
  Recovery Radar places a spend by how close it is to a decision (time left) and sizes it by amount.
- **Tokens, not values.** Colours, spacing (4px base), radii, type, motion and z-index live in
  `frontend/styles/tokens.css`; components use the variables.
- **Motion with a reason.** 150 ms for controls, about 250 ms for panels, about 400 ms for charts;
  numbers count up; everything respects `prefers-reduced-motion`.
- **Mobile is its own layout:** bottom navigation, a two-card overview (Urgent, Next opportunity),
  and tables that become stacked cards.
