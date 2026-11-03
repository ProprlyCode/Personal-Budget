# Personal Budget

A standalone personal finance and budgeting web app — a single HTML file with
vanilla JavaScript, [Chart.js](https://www.chartjs.org/) (via CDN), and
`localStorage` for persistence. No backend, no build step, no auth, single
user.

Open `index.html` in a browser to run it. All data lives in your browser's
`localStorage`; use the export feature to back it up as CSV/JSON.

## Features

- **Transaction log** — manual entry plus CSV import (single-amount or
  debit/credit column bank exports), with a sortable/filterable table.
- **Categorization** — per-transaction category dropdown, bulk
  re-categorization, and keyword-based auto-categorization on import (with
  uncategorized transactions flagged for manual review).
- **Budget builder** — monthly dollar targets per category, with the option
  to copy last month's budget as a starting point.
- **Budget vs. actual** — bar chart and table per category for the selected
  month, with over/under indicators.
- **Savings goals** — name, target amount, target date, and progress bar.
- **Connected money**: a Savings/Investments or Debt Payments transaction can
  say where the money went ("Goes to…" on the Transactions tab): a savings
  goal, an investment account or a debt. The goal's saved amount, the
  account's contributions and the debt's balance and payment history follow
  automatically, and undo themselves when the link is changed or the
  transaction deleted. Money that may already be counted (logged by hand, or
  from before the goal/debt was set up) asks first so it's counted once.
  Imported transfers are linked the way the same transfer was linked before.
- **Cards & bank accounts** (Settings): each transaction picks its card or
  account. Cards keep a running balance (owed when added + charges − refunds −
  payments); a card payment (**+ → Paid a card**, from checking) clears it and is
  never spending. Checking keeps a typed balance plus what you log. The
  Dashboard shows what's on each card and since the last payment.
- **Net worth two ways** (Dashboard): *net worth* = cash + investments +
  savings + what you own − every debt − card balances; *liquid* leaves out the
  home and vehicles (and the mortgage paired with the home). **What you own**
  (Settings): a home paired with its mortgage shows equity and about what you'd
  walk away with after selling costs (7% default); vehicles lose a yearly %
  (15% default) between value updates. A savings account replaces the goals
  in the total so the same money isn't counted twice. One point per month is
  kept for the trend chart.
- **Recurring bills, subscriptions and paychecks**: **+ → Repeats** (monthly,
  twice a month, every 2 weeks, weekly, yearly). Each occurrence adds itself on
  its date with id `r-<rule>-<date>` (so two devices never double-add);
  deleting one remembers the date. A new amount applies "from now on"
  (Settings → Recurring, or "also change future ones" when editing one).
  "Amount varies" bills are added as estimates to confirm. The Dashboard shows
  what's still coming this month; history is scanned for things that look
  recurring; imported statement rows matching a recurring entry are skipped.
- **Quick add / edit**: the **+** button on every tab opens a short form (amount,
  description, category, card, date). Past merchants are suggested and fill in
  their category and card. Tap any transaction's description to edit it.
- **Spending means spending**: saving, investing, debt payments and paying
  off a card in full (category *Credit Card Payment*, a *transfer*) are not
  counted as spending anywhere. The Dashboard shows this month so far (vs
  last month by the same day), where the money went, net worth (investments +
  savings goals − debts) and this month's investing progress per account.
- **Investments**: manually tracked accounts (401(k), IRA, 529, kids'
  accounts…) grouped by person, with dated balance updates, contributions vs.
  market growth, current vs. target stock/bond/cash mix, and a balance chart.
- **Strategy rules**: a Roth IRA is filled up to the yearly limit (default
  $7,500) right after the emergency fund and high-rate debt, then the 529s
  (worst odds first), then extra. A **Retirement** card combines 401(k)s and
  IRAs toward a target of 25× yearly spending (from the budget or entered) by
  the retirement year you set, with odds and the monthly amount needed. All
  goals and odds are in **today's dollars** (returns reduced by 2.5% inflation,
  5% for college before simulating). Rebalance and fund-mix rules only appear
  when an account is managed by hand.
- **Simple by default**: the Investments tab shows the summary, *What to do
  now* (only actionable items; the rest fold into "N things look good"), your
  accounts, this month's plan and a once-a-year checklist (ticks sync and
  reset each January). Fund analysis, live prices, goal outlook, the balance
  chart and the rules sit under a collapsed **Advanced** section. Accounts
  that are all in one target-date fund (by setting, elections or holdings)
  get no fund-switch or rebalance suggestions, only a confirmation, or a
  warning if the fund costs over 0.60%.
- **Investing decisions**: your written rules (emergency-fund months,
  debt-APR cutoff, goal odds, rebalance band, monthly amount, market-drop rule)
  applied to your real data to produce a ranked "What to do now" list:
  - emergency fund sized from your average monthly spending (transactions);
  - pay-debt-first for debts above your APR cutoff;
  - a safe monthly investing amount = average surplus − 1 std dev;
  - **Monte Carlo goal odds** (2,000 seeded market paths, correlated
    lognormal stocks/bonds/cash, glide path toward the goal date): chance of
    hitting each goal, 10th/50th/90th percentile outcomes, and the monthly
    amount needed for your target odds;
  - a split of this month's money: foundation first, then the goal with the
    worst odds, never past what a goal needs;
  - rebalance alerts when the mix drifts past the band (with new money first
    when that fixes it within 6 months);
  - a goal outlook fan chart with a what-if monthly amount.
- **Fund picker (401(k) etc.)**: paste your plan's fund performance table
  (returns, benchmark rows, expense ratios; header, N/A and split-line
  layouts handled) or add funds by hand. Each fund is scored against its own
  benchmark: cost first, then past excess return with a t-stat and a
  shrinkage estimate (−ER + w·(excess+ER), w = σ²/(σ²+TE²/years)), so
  short or noisy track records count for little. Suggests whole-percent
  contribution elections that hit your target stock/bond/cash mix with the
  best fund per asset class (index funds win unless an active fund is
  ≥0.25%/yr better in expectation), and shows the 20-year cost of your
  current funds. Fund balances also drive the account's actual mix.
- **Statement import (PDF)**: *Add an account → Start from a statement (PDF)*
  creates a 401(k) from it, and each account card has *Import statement (PDF)*
  for later statements. It reads a
  Lincoln Financial "Your Account Summary" (any date range) on the device with
  PDF.js (lazy-loaded, integrity-pinned): period, beginning/ending balance,
  contributions by source (incl. employer match), each fund's units, price and
  balance, per-fund activity and transactions. A preview lets you match funds
  to your lineup and choose what to apply: balance history (contributions
  recorded so the match isn't counted as growth), fund units/balances,
  elections derived from the period's contribution split, and the monthly
  contribution from detected pay frequency. Cross-checks warn when totals
  don't add up. Funds remember their statement name for the next import.
- **Live prices (optional, Alpha Vantage free key)**: one monthly-adjusted
  request per ticker, cached ~12 h per device, prioritized within the free
  daily limit. Enables live account values (shares × price, or a recorded
  balance grown by the fund's or a stand-in ETF's return), statistics
  *measured* from monthly total returns vs a class index ETF (excess return,
  tracking error, t-stat, beta), and a market-drop rule from the S&P 500's
  distance to its high. Live data never changes the simulation's long-run
  return assumptions. Active funds are capped at half of their asset class
  next to an index fund (core-satellite). The key syncs with the household;
  prices stay on each device.

## Sync and backups

- **Per-section sync.** Each section (transactions, budget, goals, debts,
  investments, categories, budget history, buckets, rules, market key) is a
  child of the household node, and a device writes only the sections it
  changed. List sections (transactions, goals, debts, investments) are merged
  item-by-item inside a Firebase transaction: this device's adds, edits and
  deletes (found by comparing with a per-device base of item fingerprints)
  are applied onto the current cloud copy, so two people adding at once both
  keep theirs. Unsaved sections are remembered across reloads
  (`pa_dirty_sections`) and pushed on the next sign-in; empty lists are
  stored as `false` so deletions sync.
- **Backups.** A snapshot of all synced data is saved in IndexedDB on each
  device daily (kept: 7 daily + 8 weekly) and before every import, reset or
  restore (kept: newest 10 from 30 days). Settings → Backups lists them with
  Restore/Download; a dashboard reminder appears when no backup file has
  been downloaded from this device in 30 days. The JSON export now includes
  budget history and buckets and never the market-data key.

## Data model

Stored in `localStorage` under these keys:

- `pa_transactions` → `[{ id, date, description, amount, category, type, account, notes, link }]`
  (`link` = `goal:<id>`, `inv:<id>` or `debt:<id>[:<groupId>]`; goals keep `contribs`, accounts `contribs` and
  debts `payments` entries with `txnId`, rebuilt from the links by `reconcileLinks`)
- `pa_budget` → `{ month: "YYYY-MM", categories: { categoryName: budgetedAmount } }`
- `pa_savings_goals` → `[{ id, name, targetAmount, currentAmount, targetDate, since, contribs }]`
- `pa_categories` → `[{ name, type: "income"|"expense"|"transfer", color }]`
- `pa_assets` → `[{ id, name, kind: "home"|"vehicle"|"other", value, valueDate, depreciation, sellCostPct, debtId? }]`;
  `pa_nw_history` → `[{ id: "YYYY-MM", netWorth, liquid }]`
- `pa_recurring` → `[{ id, description, amount, type, category, acctId, freq, day, day2, start, end?, paused?, varies, changes: [{ from, amount }], skips: [date] }]`
  (generated transactions carry `recurId`, and `estimate` when the amount varies)
- `pa_accounts` → `[{ id, name, kind: "card"|"checking"|"savings", startBalance, since, isDefault, archived? }]`
  (transactions carry `acctId`; a card payment has `link: "card:<id>"`)
- `pa_investments` → `[{ id, name, owner, type, monthlyContribution, targetAmount, targetDate, history: [{ id, date, balance, contributed }] }]`
  plus `funds: [{ id, name, stmtName, ticker, proxy, shares, cls, er, ret1, ret3, ret5, ret10, b3, b5, b10, benchName, elect, balance }]`,
  `alloc`/`targetAlloc` (`{ stocks, bonds, cash }` %), `allocMode` (`glide`|`fixed`|`auto`) and `payroll`
  (`contributed` = money put in since the previous entry, so growth = change − contributions)
- `pa_invest_policy` → your rules and simulation assumptions (see `DEFAULT_POLICY`)
- `pa_market` → `{ apiKey }` (synced); `pa_price_cache`, `pa_av_calls` → per-device price cache and daily request count
- `pa_dirty_sections`, `pa_sync_base` → per-device sync bookkeeping; `pa_last_file_backup`, `pa_backup_snooze` → backup reminder; IndexedDB `pa-backups` → snapshots

Tests: `node tests-investments.js`, `node tests-decisions.js`, `node tests-funds.js` and `node tests-market.js` (pure engine
blocks extracted from `index.html`).

Amounts are numbers with 2-decimal precision; dates are ISO strings
(`YYYY-MM-DD`).

## Scope

Personal finances only, for a single user, entirely client-side.

## Development & checks

The app has no build step: open `index.html`. Tooling is dev-only:

```bash
npm ci
npm run test:unit   # engine tests (tests/)
npm run lint        # ESLint over the inline script + static checks
npm run test:e2e    # Playwright end-to-end (e2e/), mocked network
npm run test:rules  # Firebase Realtime Database rules vs the emulator (needs Java 21)
npm test            # all of the above
```

CI runs these on every pull request and push to `main`; a weekly security
workflow adds a secret scan, `npm audit` and CodeQL. See
[SECURITY.md](SECURITY.md) for the required Firebase setup.

