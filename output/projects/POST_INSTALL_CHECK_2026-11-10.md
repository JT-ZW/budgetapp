# Projects post-install verification — 10 November 2026

## Verified

- The configured database contains all four Projects tables: projects, project entries, funding, and retry receipts.
- All four have row-level security, authenticated owner-read policies, no anonymous table access, and no direct authenticated insert/update/delete grants.
- The installed project operation and transaction-protection functions match the tested migration source exactly.
- The project operation allows authenticated execution and denies anonymous execution. Its security-definer and search-path settings are correct.
- The transaction-protection trigger is enabled.
- `npm run check` passes with zero errors and warnings.
- `npm test` passes, including the existing financial/security suites and Projects accounting, ownership, retry, loader, and actual Svelte page-rendering tests.
- Local and live HTTP smoke checks pass for public pages, protected-route sign-in redirects, security headers, session rejection, cross-origin rejection, and malformed authentication callbacks.

Database verification was read-only and queried schema/permission metadata, not financial records. Financial test fixtures ran only in isolated PostgreSQL. No production projects, transactions, funding, or permissions were changed by these checks.

## Remaining

1. **Deploy the application code.** The public client route manifest at `https://budgetapp-three-phi.vercel.app` does not yet list `/projects` or `/projects/[id]`. Authentication redirects for these paths do not prove the pages exist: the global sign-in guard also protects unknown paths.
2. **Signed-in browser acceptance.** After deployment, verify project creation, selected history imports, daily capture, funding, and repayments in the browser. These workflows passed isolated tests; no live financial test entries were created.
3. **Older database hardening.** All 21 application tables have RLS. The broader metadata audit still reports unnecessary anonymous privileges on 12 existing tables and three existing wallet function signatures. The new Projects objects do not have these grants. The earlier migration 0008 cleanup remains pending explicit approval; no access changes were attempted here.
4. **Hosted production build.** The previous local production compilation passed, but Windows blocked Vercel packaging. That environment limitation was not re-tested during this post-install check. A hosted/Linux build remains required.

## Repeatable installation check

```powershell
npm run check:projects
```

This runs `scripts/check-project-installation.mjs` using the local private database connection and performs read-only verification. It prints no credentials or financial records.
