import { decimalToMinorUnits } from './finance';
import type { Currency } from './types/finance';

interface CreditRecord {
  id: string; name: string; kind: 'internal' | 'external' | 'lent'; lender: string;
  lending_account_id: string | null; receiving_account_id: string; currency: Currency;
  principal: string | number; charges: string | number; borrowed_on: string; due_on: string; notes: string;
}
export interface CreditMovement {
  id: string; credit_id: string; kind: 'borrow' | 'repay' | 'lend' | 'collect'; principal: string | number; charges: string | number;
  account_id: string; destination_account_id: string | null; occurred_on: string;
}
interface CreditInstalment { id: string; credit_id: string; due_on: string; amount: string | number }

export const creditMinor = (value: string | number) => decimalToMinorUnits(String(value));
/** Principal only: paid charges already have their own expense ledger entry. */
export function creditWalletDelta(movement: CreditMovement, accountIds: ReadonlySet<string>): bigint {
  let delta = 0n;
  const principal = creditMinor(movement.principal);
  if (accountIds.has(movement.account_id)) {
    delta += ['borrow', 'collect'].includes(movement.kind) && !movement.destination_account_id ? principal : -principal;
  }
  if (movement.destination_account_id && accountIds.has(movement.destination_account_id)) delta += principal;
  return delta;
}
export function creditDecimal(value: bigint): string {
  const sign = value < 0n ? '-' : ''; const amount = value < 0n ? -value : value;
  return `${sign}${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`;
}
export function creditProgress(credit: CreditRecord, movements: CreditMovement[], instalments: CreditInstalment[], today: string) {
  const payments = movements.filter((m) => m.credit_id === credit.id && ['repay', 'collect'].includes(m.kind));
  const paidPrincipal = payments.reduce((sum, m) => sum + creditMinor(m.principal), 0n);
  const paidCharges = payments.reduce((sum, m) => sum + creditMinor(m.charges), 0n);
  const paid = paidPrincipal + paidCharges;
  let allocated = paid;
  const schedule = instalments.filter((i) => i.credit_id === credit.id)
    .sort((a, b) => a.due_on.localeCompare(b.due_on) || a.id.localeCompare(b.id))
    .map((i) => {
      const amount = creditMinor(i.amount); const applied = allocated > amount ? amount : allocated;
      allocated -= applied;
      const remaining = amount - applied;
      return { ...i, paid: creditDecimal(applied), remaining: creditDecimal(remaining), status: remaining === 0n ? 'Paid' : i.due_on < today ? 'Overdue' : applied > 0n ? 'Partly paid' : 'Upcoming' };
    });
  const outstanding = creditMinor(credit.principal) + creditMinor(credit.charges) - paid;
  const planned = schedule.reduce((sum, i) => sum + creditMinor(i.amount), 0n);
  const unplanned = creditMinor(credit.principal) + creditMinor(credit.charges) - planned;
  const scheduledRemaining = schedule.reduce((sum, i) => sum + creditMinor(i.remaining), 0n);
  const overdueScheduled = schedule.filter((i) => i.due_on < today).reduce((sum, i) => sum + creditMinor(i.remaining), 0n);
  return { ...credit, payments, schedule, paid: creditDecimal(paid), outstanding: creditDecimal(outstanding),
    remainingPrincipal: creditDecimal(creditMinor(credit.principal) - paidPrincipal), remainingCharges: creditDecimal(creditMinor(credit.charges) - paidCharges),
    unplanned: creditDecimal(unplanned), unscheduledOutstanding: creditDecimal(outstanding - scheduledRemaining), overdue: creditDecimal(credit.due_on < today ? outstanding : overdueScheduled),
    status: outstanding === 0n ? 'Repaid' : credit.due_on < today || overdueScheduled > 0n ? 'Overdue' : 'Active',
    nextDue: schedule.find((i) => creditMinor(i.remaining) > 0n)?.due_on ?? (outstanding > 0n ? credit.due_on : null) };
}
