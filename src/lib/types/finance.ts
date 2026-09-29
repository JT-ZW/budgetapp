export type Currency = 'USD' | 'ZIG';
export type WalletGroupKind = 'personal' | 'project';
export type WalletChannel = 'ecocash' | 'bank' | 'cash';
export type TransactionKind = 'income' | 'expense' | 'transfer';
export type CategoryKind = 'income' | 'expense';
export type BudgetGoalKind = 'spending_cap' | 'income_target' | 'savings_target';
export type BudgetPeriodType = 'week' | 'month' | 'quarter' | 'year';

export interface WalletGroup {
	id: string;
	owner_id: string;
	name: string;
	kind: WalletGroupKind;
	archived_at: string | null;
	created_at: string;
}

export interface WalletAccount {
	id: string;
	owner_id: string;
	wallet_group_id: string;
	currency: Currency;
	channel: WalletChannel | null;
	opening_balance: string;
	archived_at: string | null;
	created_at: string;
}

export interface Category {
	id: string;
	owner_id: string;
	name: string;
	kind: CategoryKind;
	created_at: string;
}

export interface LedgerTransaction {
	id: string;
	owner_id: string;
	kind: TransactionKind;
	account_id: string;
	destination_account_id: string | null;
	amount: string;
	destination_amount: string | null;
	exchange_rate: string | null;
	fee_amount: string;
	category_id: string | null;
	description: string;
	occurred_at: string;
	created_at: string;
}

export interface BudgetTarget {
	id: string;
	owner_id: string;
	wallet_group_id: string;
	currency: Currency;
	goal_kind: BudgetGoalKind;
	category_id: string | null;
	amount: string;
	period_start: string;
	period_type: BudgetPeriodType;
	created_at: string;
}
