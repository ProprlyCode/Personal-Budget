# Security

This app is a static page on GitHub Pages; the repository is public. Its
Firebase web config (`apiKey`, `projectId`, …) is **public by design**: it
identifies the project, it doesn't grant access. Access to household data is
controlled only by **Firebase Authentication + Realtime Database rules**.

## Required Firebase setup (do this once)

1. **Turn off public sign-up.** Firebase console → Authentication → Settings →
   *User actions* → uncheck **Enable create (sign-up)**. Household accounts
   are created by hand under Authentication → Users. (With sign-up open,
   anyone can create an account with the public config.)
2. **List household members.** Sign in to the app, open the sync badge →
   *Sync details*, and copy your **User ID**. In Realtime Database → *Data*,
   add a top-level node `members` with a child `<that User ID>: true` (one per
   household login).
3. **Publish the rules** in [`database.rules.json`](database.rules.json):
   only listed members can read or write `budget`; nothing else is readable,
   and `members` can only be edited from the console.
4. **Restrict the API key** (defense in depth): Google Cloud console →
   APIs & Services → Credentials → the browser key → *Application
   restrictions: HTTP referrers* → your Pages domain (and `localhost` if you
   develop locally).

Until step 3 is done, the old `auth != null` rule lets **any** signed-in
Firebase user read and change the household's transactions, budgets, debts,
investments and the market-data key.

## What's stored where

| Data | Where | Notes |
|---|---|---|
| Transactions, budget, goals, debts, investments, rules | Realtime Database `budget` node + browser localStorage | Synced; protected by the rules above |
| Alpha Vantage key | Realtime Database (synced) | Read-only access to public prices; never included in JSON exports |
| Price cache, request counter, UI preferences, sync bookkeeping | localStorage only | Per device |
| Backup snapshots | IndexedDB on each device | Never uploaded; exclude the market-data key |

## Automated checks

- **CI** (`.github/workflows/ci.yml`): unit tests, ESLint over the inline
  script, static checks (every referenced element id exists, CDN scripts
  pinned with Subresource Integrity), Playwright end-to-end tests.
- **Security** (`.github/workflows/security.yml`, also weekly): TruffleHog
  verified-secret scan, `npm audit` (fails on high/critical; tooling is
  dev-only and never shipped), CodeQL `security-and-quality`.
- **Dependabot** keeps npm tooling and GitHub Actions current.

CDN scripts carry `integrity` hashes, so a tampered Chart.js or Firebase SDK
is refused by the browser. When upgrading one, update its hash (the static
check fails until you do):

    curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A

## Reporting

Open a private security advisory on the repository (Security → Advisories).
