# Projects — first release

Post-install update: the user applied the SQL, and read-only checks on 10 November 2026 verified that the installed Projects schema, functions, permissions, and transaction guard match the tested version. See `POST_INSTALL_CHECK_2026-11-10.md`. Application deployment and signed-in browser acceptance are still outstanding.

## Intended workflow

1. Open **Projects**, enter a name, and connect an existing active project wallet. Personal remains available as a funding source; it cannot become a dedicated project wallet. Each wallet can belong to one project only.
2. Review opening history. Select existing expenses as **Capital expenditure** or **Operating expenditure**, and existing income as **Revenue** or **Grant / external funding**. Only selected records are included. Classification does not copy transactions or change cash.
3. Add any missing historical costs or revenue using **Opening history**. These records affect project reports only. Do not enter items already imported from the wallet. Confirm that the linked wallet's current balance already represents actual cash: history-only entries do not reconcile incorrect wallet balances.

   If old activity is missing from the wallet and its balance needs correction, record the missing wallet transactions through Transactions first, then classify those records for the project instead of adding them again as history-only entries.
4. Finish setup and use **Record project activity** for daily costs and revenue. This writes one wallet transaction and its project classification atomically.
5. Add funding from Personal or another wallet as a non-repayable contribution or an internal loan. Matching-currency transfers update both wallets. Internal loans also appear in Credit; repayments from the project return principal to the original lending wallet. External grants are recorded separately from project revenue.

## Accounting boundaries

- Wallet cash is read from the existing balance function, including existing credit and investment movements. It is not calculated by adding historical project reports to opening funding.
- Existing cash at connection is a snapshot, not a new deposit or sales revenue. Historical funding receipts are kept separately from this snapshot.
- Funding, loan principal, capital expenditure, operating expenditure, and revenue remain distinct. Operating surplus is revenue minus operating expenditure; it excludes depreciation and tax calculations.
- History-only records never move cash. Removing a project classification does not delete the underlying wallet transaction.
- Existing transactions linked to project reports are protected from changes that would silently invalidate those reports. Unclassify an expense/revenue before changing it. Recorded funding receipts retain their wallet reference.
- Currency totals remain separate. Funding transfers require accounts in the same currency; use the existing Transactions flow to convert currency before funding a project.
- Existing wallet credit is included in project loan balances. External loans and interest/fees remain manageable through Credit.
- Completed projects remain readable and can be reopened. The linked wallet and financial history are retained.

## Installation

Apply `supabase/migrations/0012_projects.sql` after migrations 0001–0011. It adds Projects tables, owner-only reads, an authenticated project-operation function, and a guard for project-linked wallet transactions. It does not create projects, import user history, or change wallet balances on installation.

Read-only installation check:

```powershell
node --env-file=.env scripts/migrate-projects.mjs
```

Transactional installation, when approved:

```powershell
node --env-file=.env scripts/migrate-projects.mjs --apply
```

The installer uses private local database credentials, prints no secrets or financial records, and rolls back if installation fails. Deployment and installation have not been performed as part of development.

## Validation

`npm run test:projects` runs against isolated PostgreSQL and exercises:

- Linking a wallet once, retrying setup, and rejecting Personal as a dedicated wallet.
- Snapshotting existing cash without creating money.
- Selective imports, capital/operating/revenue classification, historical grants, and prevention of duplicate or conflicting attribution.
- History-only entries and removal without cash changes.
- Contribution and grant flows, same-currency and source-balance validation, internal credit and repayments.
- Repeated submissions without duplicate transactions or repayments.
- Actual Projects loaders reconciling cash, costs, revenue, funding, and outstanding credit.
- Owner isolation, anonymous rejection, direct-write protection, and invalid dates.

Verification completed during development:

- Full existing suite and new project accounting tests passed, including the database security audit covering all 21 application tables.
- Actual project loader and Svelte page-rendering tests passed for setup, daily capture, funding, repayments, date validation, and unavailable states.
- Source checks passed with zero errors and warnings.
- Local HTTP smoke checks passed for public pages, security headers, all 16 protected routes (including both Projects routes), session rejection, cross-origin rejection, and malformed authentication callbacks.
- Production client/server compilation passed. Local Vercel packaging remains blocked by Windows filesystem permissions. An elevated build request timed out in automatic approval review; the fallback local build could not complete packaging.

Automated browser access was unavailable. Signed-in desktop/mobile visual and interaction checks and a successful hosted build remain release acceptance checks. No live database migration, projects, or financial entries were created during development.
