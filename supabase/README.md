# Data model notes

- `wallet_groups` are roll-up parents: one Personal group and any number of project groups.
- `wallet_accounts` hold a single currency balance. Personal accounts require an EcoCash, Bank, or Cash channel; project accounts use currency only.
- `transactions` are the ledger. Money is stored as exact decimal values. A transfer is one row with source, destination, received amount, and optional source-currency fee. It is not classified as income or spending; a fee is categorized as an expense.
- Same-currency transfers preserve the principal amount. Cross-currency transfers record both amounts and the entered exchange rate.
- `budget_targets` are monthly and currency-specific. A null category is the wallet-group target; a category id scopes the target to that category within that group and currency.
- Row Level Security and composite owner foreign keys keep records and references within the signed-in user's data.

The initial migration creates Personal with USD and ZiG EcoCash, Bank, and Cash accounts, plus a Transfer fees category when an account is created. Project wallets should be created through the `create_project_wallet` database function so both currency accounts are created together.

Balances are derived from the ledger: opening balance + income + incoming transfer amounts − expenses − outgoing transfer principal − transfer fees. USD and ZiG totals stay separate; the app will not add unlike currencies into a misleading combined balance.
