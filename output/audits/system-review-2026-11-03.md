# Homwe system review — 3 November 2026

## Result

The expanded isolated test suite passes. Source checks report zero errors and warnings. Additional correctness issues were fixed locally; the changes have not been deployed. This review does not certify that the application has no remaining defects.

## Fixes prepared

- **Calendar validation:** the shared date input now preserves its regular-expression quantifiers through Svelte compilation. The rendered-field regression test accepts `2026-11-03` and rejects incorrectly formatted input.
- **Server date validation:** Transactions, investment actions, and Insights now use strict date parsing. Impossible dates such as `2026-02-30` are rejected or replaced by the statement filter's default, rather than silently rolling into March. Year zero is rejected.
- **Long financial histories:** Overview, Insights, investment accounts, investment analysis, and investment withdrawal checks now paginate relevant queries beyond the default 1,000-row limit. Queries include a stable ID tie-breaker. Failed pages return an error rather than a seemingly complete partial history. A redundant investment-price query was removed.
- **Archived destinations:** transaction transfers reject archived destination wallet groups, even when their individual accounts are still active.
- **Shortcut retries:** a uniqueness error is only treated as a successful retry after finding the matching saved confirmation for the signed-in user. Unrelated failures remain errors.

## Verification

- `npm run check`: zero errors and warnings.
- `npm test`: passed after the changes. Covers financial calculations, actual page loaders, lending/borrowing, repayments, instalments, statements, custom budgets, session expiry/revocation, owner isolation, migration security, feedback states, and calendars.
- New action tests exercise successful transaction saves, invalid transaction/investment dates, repeated shortcut confirmations, tampered shortcut fields, unrelated uniqueness errors, and archived transfer destinations.
- Long-history tests cover a 2,001-row pagination fixture, errors on later pages, actual reporting loaders after more than 1,000 ledger entries, and investment account/analysis loaders with 1,002 cash movements.
- Live HTTP smoke checks against `https://budgetapp-three-phi.vercel.app`: public pages, all 14 protected routes, security headers, session rejection, cross-origin rejection, and malformed authentication callbacks passed. These used no signed-in session and recorded no financial transactions.
- The same HTTP smoke checks passed against the updated local source on an isolated development-server port, after the initial dependency compilation completed.
- `git diff --check`: passed.
- Production client and server compilation completed. Vercel packaging failed on Windows with `EPERM` while creating the catch-all function symbolic link. A successful Linux/Vercel build is still required before release.

## Pending live database hardening

A read-only metadata audit found 17 application tables, all with row-level security enabled. It also found unnecessary anonymous grants on 12 tables and three privileged wallet function signatures. This finding does not establish that another user's records are accessible: owner policies remain a separate boundary.

The repository already contains the tested migration `supabase/migrations/0008_restrict_anonymous_access.sql`. It removes PUBLIC/anonymous grants from application objects and preserves explicit authenticated grants and owner policies. No financial rows are changed by this migration.

**Not applied:** automatic approval review rejected the production permission change because the user's request authorized a system-wide check, not that specific persistent access mutation. Removing grants could disrupt functionality that depends on anonymous access. Explicit user approval is required before proceeding. The database audit itself made no changes.

## Dependency findings

`npm audit --audit-level=high` reports seven affected-package findings: three low and four moderate, with no high or critical findings. Dependency files were not changed. The suggested blanket repair includes breaking framework/adapter upgrades and does not substitute for a reviewed migration.

Relevant advisories:

- [SvelteKit enhanced-form redirect handling](https://github.com/advisories/GHSA-pfhg-q3qv-9q6r): patched in SvelteKit 3. This app currently uses SvelteKit 2.
- [SvelteKit untrusted prerender cache-control handling](https://github.com/advisories/GHSA-27mw-82g8-phjj): patched in SvelteKit 3; the described exploit requires prerendering with an untrusted cache-control value. No such pattern was found in this review.
- [deepmerge prototype poisoning](https://github.com/advisories/GHSA-gcqx-w48m-w2h4): the advisory lists no patched release.
- [glob cancellation handling](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4).
- [minimatch resource amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249).

## Limits and release follow-up

Signed-in desktop/mobile browser acceptance, actual production financial saves, and authentication recovery delivery were not verified in this audit. Automated financial writes ran only in an isolated PostgreSQL test database. No production records were edited and no deployment was performed.

Approve the targeted database permission cleanup, review compatible dependency remediation, obtain a successful hosted/Linux production build, and complete signed-in acceptance of the prepared calendar and transaction fixes before promoting a deployment.
