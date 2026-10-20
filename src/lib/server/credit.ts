import type { SupabaseClient } from '@supabase/supabase-js';
import { creditProgress, creditMinor, creditDecimal } from '$lib/credit';

async function loadCreditTable(db: SupabaseClient, table: string) {
  const data: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await db.from(table).select('*').order('id').range(offset, offset + 999);
    if (result.error) return { data: [], error: result.error };
    data.push(...(result.data ?? []));
    if ((result.data ?? []).length < 1000) return { data, error: null };
  }
}

// Read full histories so the API's per-request row limit cannot inflate debt balances.
export function loadCreditData(db: SupabaseClient) {
  return Promise.all([
    loadCreditTable(db, 'budget_app_credits'),
    loadCreditTable(db, 'budget_app_credit_instalments'),
    loadCreditTable(db, 'budget_app_credit_movements')
  ]);
}

export async function loadCreditCommitments(db: SupabaseClient) {
  const results = await loadCreditData(db);
  const error = results.find((r) => r.error)?.error?.message ?? null;
  if (error) return { rows: [], error };
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Harare', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const monthEnd = today.slice(0, 7) + '-31';
  const rows = results[0].data.map((c) => creditProgress(c, results[2].data, results[1].data, today))
    .filter((c) => creditMinor(c.outstanding) > 0n).map((c) => {
      let due = c.schedule.filter((i) => i.due_on <= monthEnd).reduce((sum, i) => sum + creditMinor(i.remaining), 0n);
      // Early payments can also cover the unscheduled final balance.
      if (c.due_on <= monthEnd) due += creditMinor(c.unscheduledOutstanding);
      return { id: c.id as string, name: c.name as string, kind: c.kind as string, currency: c.currency as 'USD' | 'ZIG', outstanding: c.outstanding, due: creditDecimal(due), nextDue: c.nextDue as string, overdue: c.overdue };
    }).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  return { rows, error: results.find((r) => r.error)?.error?.message ?? null };
}
