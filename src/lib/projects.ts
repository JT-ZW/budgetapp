import { decimalToMinorUnits, formatMoney } from '$lib/finance';
import type { Currency } from '$lib/types/finance';

export type Project = { id: string; name: string; description: string; wallet_group_id: string; status: string; setup_completed: boolean; started_on: string; created_at: string };
export type ProjectEntry = { id: string; project_id: string; classification: string; transaction_id: string | null; account_id: string; amount: string | number; currency: string; occurred_on: string; description: string };
export type ProjectFunding = { id: string; project_id: string; kind: string; account_id: string; source_account_id: string | null; transaction_id: string | null; credit_id: string | null; amount: string | number; currency: string; occurred_on: string; description: string; request_id: string | null };
export const projectMoney = (amount: string | number, currency: string) => formatMoney(decimalToMinorUnits(String(amount)), currency as Currency);
export const classificationLabel = (kind: string) => ({ capex: 'Capital expenditure', opex: 'Operating expenditure', revenue: 'Revenue' }[kind] ?? kind);
export const fundingLabel = (kind: string) => ({ opening: 'Cash at connection', contribution: 'Wallet contribution', grant: 'External funding', loan: 'Wallet loan' }[kind] ?? kind);
const decimal = (value: bigint) => `${value < 0n ? '-' : ''}${(value < 0n ? -value : value) / 100n}.${String((value < 0n ? -value : value) % 100n).padStart(2, '0')}`;

export function projectTotals(entries: ProjectEntry[], funding: ProjectFunding[], cash: { currency: string; balance: string }[]) {
  const currencies = [...new Set([...cash.map((a) => a.currency), ...entries.map((e) => e.currency), ...funding.map((f) => f.currency)])];
  return currencies.map((currency) => {
    const sum = (rows: { amount: string | number; currency: string }[]) => rows.filter((row) => row.currency === currency).reduce((total, row) => total + decimalToMinorUnits(String(row.amount)), 0n);
    const capex = sum(entries.filter((e) => e.classification === 'capex'));
    const opex = sum(entries.filter((e) => e.classification === 'opex'));
    const revenue = sum(entries.filter((e) => e.classification === 'revenue'));
    return { currency, cash: decimal(cash.filter((a) => a.currency === currency).reduce((n, a) => n + decimalToMinorUnits(a.balance), 0n)), capex: decimal(capex), opex: decimal(opex), revenue: decimal(revenue), operatingSurplus: decimal(revenue - opex), opening: decimal(sum(funding.filter((f) => f.kind === 'opening'))), contributions: decimal(sum(funding.filter((f) => f.kind === 'contribution'))), grants: decimal(sum(funding.filter((f) => f.kind === 'grant'))), loansReceived: decimal(sum(funding.filter((f) => f.kind === 'loan'))) };
  });
}
