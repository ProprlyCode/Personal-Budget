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
- **Investments**: manually tracked accounts (401(k), IRA, 529, kids'
  accounts…) grouped by person, with dated balance updates, contributions vs.
  market growth, current vs. target stock/bond/cash mix, and a balance chart.
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

## Data model

Stored in `localStorage` under these keys:

- `pa_transactions` → `[{ id, date, description, amount, category, type, account, notes }]`
- `pa_budget` → `{ month: "YYYY-MM", categories: { categoryName: budgetedAmount } }`
- `pa_savings_goals` → `[{ id, name, targetAmount, currentAmount, targetDate }]`
- `pa_categories` → `[{ name, type: "income"|"expense", color }]`
- `pa_investments` → `[{ id, name, owner, type, monthlyContribution, targetAmount, targetDate, history: [{ id, date, balance, contributed }] }]`
  plus `alloc`/`targetAlloc` (`{ stocks, bonds, cash }` %), `allocMode` (`glide`|`fixed`|`auto`) and `payroll`
  (`contributed` = money put in since the previous entry, so growth = change − contributions)
- `pa_invest_policy` → your rules and simulation assumptions (see `DEFAULT_POLICY`)

Tests: `node tests-investments.js` and `node tests-decisions.js` (pure engine
blocks extracted from `index.html`).

Amounts are numbers with 2-decimal precision; dates are ISO strings
(`YYYY-MM-DD`).

## Scope

Personal finances only, for a single user, entirely client-side.
