# User Payout Management System

A Low-Level Design and reference implementation of a system that manages
advance payouts and final (reconciled) payouts for affiliate sales.

Built in **Node.js / Express**. Zero external infra required to run — see
[Running it](#running-it).

---

## 1. Problem Recap

- Every sale starts as `pending`.
- A **pending** sale is eligible for an **advance payout of 10% of its
  earning** — but only ever once, no matter how many times the advance
  job runs.
- An admin later **reconciles** each sale to `approved` or `rejected`.
  - **Approved** → user gets `earning - advancePaid`.
  - **Rejected** → the advance already paid is clawed back:
    `adjustment = -advancePaid`.
- A user can make **one withdrawal every 24 hours**.
- If a withdrawal later **fails / is cancelled / is rejected**, the money
  must be **credited back** to the user's withdrawable balance, and the
  user should be able to withdraw it again.

---

## 2. High-Level Design Decisions

### 2.1 Ledger-first wallet (event sourcing for money)

The user's balance is **never** mutated directly by business logic. Every
balance change — an advance, a reconciliation adjustment, a withdrawal
debit, a failed-withdrawal reversal — is written as an **immutable,
append-only `Transaction` row** (`amountPaise`, signed: credit `+`, debit
`-`). `WalletService.recordEntry()` is the *only* function in the codebase
allowed to touch `user.withdrawableBalancePaise`, and it does so in the
same operation as writing the ledger row.

Why: payouts are money — they need to be auditable and reconstructable.
If the cached balance ever looks wrong, `SUM(transactions.amount_paise)`
for that user is the ground truth. It also makes "why does this user have
₹X" trivially answerable by reading the ledger, which matters a lot
during a support/finance dispute.

### 2.2 Money as integer paise

All amounts are stored as integer paise (`₹1 = 100 paise`) internally.
`10% of ₹30` computed in floating point rupees can produce values like
`2.9999999999999996`. Doing the math in integers and only converting to
rupees at the API boundary (`utils/money.js`) eliminates an entire class
of rounding bugs. `computeAdvance` rounds the 10% **down**, so the
platform never advances a user more than they're strictly owed.

### 2.3 Idempotency, twice over

Both requirements that say "never do X twice" (never double-advance,
never reconcile twice) are enforced at **two independent layers**:

1. **Application-level guard**: `sale.isAdvanceEligible()` /
   `sale.isReconciled()` checked before acting.
2. **Concurrency-level guard**: a per-`saleId` `KeyedMutex` serializes the
   check-then-act sequence, so two concurrent job runs (or an admin
   double-click) can't both pass the guard before either has recorded its
   result. See `src/utils/KeyedMutex.js` for the reasoning — this is the
   in-memory stand-in for `SELECT ... FOR UPDATE` inside a DB transaction.
3. **Schema-level guard** (documented in `schema.sql`, not exercised by
   the in-memory implementation): `advance_payouts.sale_id` and
   `reconciliations.sale_id` are `UNIQUE`, so even a bug in the service
   layer cannot physically insert a second advance/reconciliation for the
   same sale.

Belt and suspenders — any one of the three layers is enough to guarantee
correctness; having all three means a mistake in one layer doesn't turn
into an incident.

### 2.4 Withdrawal: debit-on-request, not debit-on-success

The 24h-cooldown amount is debited from `withdrawableBalancePaise` the
moment a withdrawal is **requested**, not when the payment gateway
confirms it succeeded. This prevents the same rupee being withdrawn
twice while a payout is still in flight with the bank/UPI rail. If the
withdrawal later fails, the debit is reversed (§2.5).

### 2.5 Failed payout recovery is decoupled from the cooldown

The 24h cooldown is keyed off `user.lastSuccessfulWithdrawalAt`, which is
**only** set when a withdrawal reaches `success`. A withdrawal that ends
in `failed` / `cancelled` / `rejected`:

- credits the amount back into `withdrawableBalancePaise` (via a
  `withdrawal_reversal_credit` ledger entry), and
- does **not** touch `lastSuccessfulWithdrawalAt`.

So a user is never penalized with a 24h lockout because of a
payment-gateway failure that wasn't their fault — they can retry
immediately. A `reversed` flag on the withdrawal prevents a duplicate
webhook/retry from crediting the same failure twice.

### 2.6 Reconciliation math never produces a negative advance clawback larger than the balance can bear

Because the advance is capped at 10% of the earning, a rejected sale's
clawback (`-advancePaid`) is at most 10% of that sale's earning — it can
still push a user's *overall* balance negative if they've already
withdrawn other money, which is a legitimate real-world "you owe us"
state. The system permits a negative `withdrawableBalancePaise` (no clamp
to zero) and simply blocks further withdrawals until reconciliations
bring it back positive — clamping to zero would silently write off money
the platform is actually owed.

---

## 3. Class Design

```
models/
  User          — id, withdrawableBalancePaise, lastSuccessfulWithdrawalAt
  Sale          — id, userId, earningPaise, status, advanceStatus, advancePaidPaise, reconciledAt
  Withdrawal    — id, userId, amountPaise, status, reversed
  Transaction   — id, userId, type, amountPaise (signed), referenceType, referenceId

repositories/                          (swap for a real DB client 1:1, see schema.sql)
  UserRepository, SaleRepository, WithdrawalRepository, TransactionRepository

services/
  WalletService            — the only writer of balance + ledger
  AdvancePayoutService      — 10% advance job, idempotent
  ReconciliationService     — approve/reject a sale, settle final adjustment
  WithdrawalService          — request / status webhook, 24h rule, failure recovery

api/
  routes/{users,sales,withdrawals}.js — thin controllers, no business logic
  app.js                              — Express wiring + centralized error handler

utils/
  money.js       — paise <-> rupees, 10% calc
  errors.js      — AppError hierarchy -> HTTP status mapping
  KeyedMutex.js  — per-key serialization (advance/reconcile/withdraw races)
```

Each service depends only on repository **interfaces** (implicit in JS —
any object with matching methods works), so `repositories/InMemoryDB.js`
can be swapped for a Postgres-backed set of repositories without touching
a single service. `schema.sql` documents that target schema.

---

## 4. Database Schema

See [`schema.sql`](./schema.sql) for the full DDL (Postgres dialect) with
comments. Summary of relationships:

```
users (1) ──< sales (N)
users (1) ──< withdrawals (N)
users (1) ──< transactions (N)
brands (1) ──< sales (N)
sales (1) ──< advance_payouts (0..1)   [UNIQUE(sale_id) — at most one, ever]
sales (1) ──< reconciliations (0..1)   [UNIQUE(sale_id) — at most once, ever]
```

---

## 5. API Reference

All amounts in request/response bodies are in **rupees** (the API
boundary converts to/from paise; nothing else in the system sees rupees).

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/api/users` | `{ name, email }` | Create a user |
| GET | `/api/users/:userId/balance` | — | Current withdrawable balance |
| GET | `/api/users/:userId/transactions` | — | Full ledger for the user |
| GET | `/api/users/:userId/sales` | — | All sales for the user |
| POST | `/api/sales` | `{ userId, brand, earning }` | Create a pending sale |
| POST | `/api/sales/advance-payouts/run` | `{ userId }` | Run the advance payout job for a user (idempotent — safe to re-trigger) |
| POST | `/api/sales/:saleId/reconcile` | `{ status: "approved"\|"rejected" }` | Reconcile a sale, settle the final adjustment |
| POST | `/api/withdrawals` | `{ userId, amount }` | Request a withdrawal (enforces balance + 24h rule) |
| POST | `/api/withdrawals/:id/status` | `{ status: "processing"\|"success"\|"failed"\|"cancelled"\|"rejected" }` | Simulated payment-gateway webhook |
| GET | `/api/withdrawals/user/:userId` | — | Withdrawal history |

All errors are returned as `{ error: "<CODE>", message: "<...>" }` with an
appropriate HTTP status (`404` not found, `409` conflict / business-rule
violation, `422` validation).

---

## 6. Edge Cases Handled

| Case | Handling |
|---|---|
| Advance job re-run on an already-advanced sale | No-op (idempotent) — see §2.3 |
| Concurrent advance-job runs on the same sale | Serialized via `KeyedMutex`, only one credit happens |
| Sale with `earning = 0` | Advance = 0, no ledger row is written (nothing to advance) |
| Reconciling a sale twice | Second call throws `409 CONFLICT` |
| Reconciling a non-pending sale | Throws `409 CONFLICT` |
| Reconciling to an invalid status (e.g. `pending`) | Throws `422 VALIDATION_ERROR` |
| Rejected sale that never received an advance | Adjustment is `0`, not a spurious debit |
| Withdrawal amount > withdrawable balance | Throws `409 CONFLICT` before any state changes |
| Second withdrawal within 24h of a **successful** one | Throws `409 CONFLICT` with remaining wait time |
| Withdrawal fails/cancels/rejects | Amount is credited back; does **not** start/count toward the 24h cooldown |
| Duplicate status webhook for an already-terminal withdrawal | Throws `409 CONFLICT`; `reversed` flag additionally guards against double-crediting |
| Two withdrawal requests racing on the same user | Serialized via `KeyedMutex` keyed by `userId` |
| Negative wallet balance (advance clawed back after user already withdrew) | Allowed (not clamped to 0); further withdrawals blocked until balance is positive again |

---

## 7. Running It

```bash
npm install
npm start          # starts the API on http://localhost:3000
npm test           # runs the Jest suite (16 tests), including the
                    # exact worked example from the assignment PDF
```

### Quick manual walkthrough (matches the PDF's worked example)

```bash
# create user
curl -s -X POST localhost:3000/api/users -H 'Content-Type: application/json' \
  -d '{"name":"John Doe","email":"john@example.com"}'

# create 3 sales of ₹40 each for that user, then:
curl -s -X POST localhost:3000/api/sales/advance-payouts/run \
  -H 'Content-Type: application/json' -d '{"userId":"<id>"}'
# -> ₹12 total advance (₹4 per sale), balance = 12

# reconcile: 1 rejected, 2 approved
curl -s -X POST localhost:3000/api/sales/<sale1>/reconcile -d '{"status":"rejected"}' -H 'Content-Type: application/json'
curl -s -X POST localhost:3000/api/sales/<sale2>/reconcile -d '{"status":"approved"}' -H 'Content-Type: application/json'
curl -s -X POST localhost:3000/api/sales/<sale3>/reconcile -d '{"status":"approved"}' -H 'Content-Type: application/json'
# adjustments: -4, +36, +36 = 68 (matches the PDF exactly)
# total withdrawable balance = 12 (advance) + 68 (adjustment) = 80
```

---

## 8. Trade-offs & What I'd Do Differently in Production

- **In-memory store vs. real DB**: chosen so the assignment runs with
  `npm install && npm start`, zero external services. Every repository
  method is written the way it would be against a real DB (`schema.sql`
  documents the target schema + the `UNIQUE` constraints and indexes that
  would replace the in-process `KeyedMutex`).
- **KeyedMutex vs. DB row locks**: functionally equivalent for a
  single-process deployment, but doesn't help across multiple app
  instances. In production this becomes `SELECT ... FOR UPDATE` /
  `UNIQUE` constraints, which work correctly across any number of app
  instances talking to the same database.
- **Synchronous settlement**: reconciliation settles the final payout
  adjustment immediately and synchronously. At larger scale you'd likely
  make the advance job and reconciliation settlement asynchronous
  (queue-driven) so a slow downstream (e.g. a ledger write to an external
  accounting system) can't block the reconciliation API response — the
  core idempotency design here (per-entity dedupe key) carries over
  unchanged to that model.
- **No auth/authz layer**: out of scope for the assignment, but a real
  system would gate `/reconcile` behind an admin role and `/withdrawals`
  behind the owning user's identity.
