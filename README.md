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
- **Trends** — line chart of spending over the last 6–12 months and a
  donut chart of spending by category for the selected period.
- **Month/date-range selector** that filters the whole dashboard.
- **Export** — CSV/JSON export of all data, so it's never locked into
  `localStorage`.

## Data model

Stored in `localStorage` under these keys:

- `pa_transactions` → `[{ id, date, description, amount, category, type, account, notes }]`
- `pa_budget` → `{ month: "YYYY-MM", categories: { categoryName: budgetedAmount } }`
- `pa_savings_goals` → `[{ id, name, targetAmount, currentAmount, targetDate }]`
- `pa_categories` → `[{ name, type: "income"|"expense", color }]`

Amounts are numbers with 2-decimal precision; dates are ISO strings
(`YYYY-MM-DD`).

## Scope

Personal finances only, for a single user, entirely client-side.
