import { fail, redirect } from '@sveltejs/kit';
import { loadAllRows } from '$lib/server/pagination';
import { loadCreditData } from '$lib/server/credit';
import { creditProgress } from '$lib/credit';
import { projectTotals, type Project, type ProjectEntry, type ProjectFunding } from '$lib/projects';

export async function projectSession(locals: App.Locals) {
  if (!locals.supabase) redirect(303, '/');
  const { data, error } = await locals.supabase.auth.getUser();
  if (error || !data.user) redirect(303, '/');
  return { db: locals.supabase, user: data.user };
}

export async function loadProjectWorkspace(locals: App.Locals) {
  const { db } = await projectSession(locals);
  const [projects, groups, accounts, balances, entries, funding, categories] = await Promise.all([
    loadAllRows<Project>((from, to) => db.from('budget_app_projects').select('*').order('created_at', { ascending: false }).order('id').range(from, to)),
    loadAllRows<any>((from, to) => db.from('budget_app_wallet_groups').select('id,name,kind,archived_at').order('name').order('id').range(from, to)),
    loadAllRows<any>((from, to) => db.from('budget_app_wallet_accounts').select('id,wallet_group_id,currency,channel,archived_at').order('currency').order('id').range(from, to)),
    db.rpc('budget_app_get_account_balances'),
    loadAllRows<ProjectEntry>((from, to) => db.from('budget_app_project_entries').select('*').order('occurred_on', { ascending: false }).order('id').range(from, to)),
    loadAllRows<ProjectFunding>((from, to) => db.from('budget_app_project_funding').select('*').order('occurred_on', { ascending: false }).order('id').range(from, to)),
    loadAllRows<any>((from, to) => db.from('budget_app_categories').select('id,name,kind').order('name').order('id').range(from, to))
  ]);
  const balanceById = Object.fromEntries((balances.data ?? []).map((row: any) => [row.account_id, String(row.balance)]));
  const groupRows = groups.data ?? [];
  const accountRows = (accounts.data ?? []).map((a) => ({ ...a, balance: balanceById[a.id] ?? '0.00', label: [groupRows.find((g) => g.id === a.wallet_group_id)?.name ?? 'Wallet', a.currency === 'ZIG' ? 'ZiG' : a.currency, a.channel === 'ecocash' ? 'EcoCash' : a.channel === 'bank' ? 'Bank' : a.channel === 'cash' ? 'Cash' : ''].filter(Boolean).join(' / '), active: !a.archived_at && groupRows.some((g) => g.id === a.wallet_group_id && !g.archived_at) }));
  const entryRows = entries.data ?? [], fundingRows = funding.data ?? [];
  return {
    projects: (projects.data ?? []).map((project) => ({ ...project, walletName: groupRows.find((g) => g.id === project.wallet_group_id)?.name ?? 'Wallet', walletActive: groupRows.some((g) => g.id === project.wallet_group_id && !g.archived_at), totals: projectTotals(entryRows.filter((e) => e.project_id === project.id), fundingRows.filter((f) => f.project_id === project.id), accountRows.filter((a) => a.wallet_group_id === project.wallet_group_id)) })),
    groups: groupRows, accounts: accountRows, entries: entryRows, funding: fundingRows, categories: categories.data ?? [],
    requestId: crypto.randomUUID(), today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Harare', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
    loadError: [projects, groups, accounts, balances, entries, funding, categories].find((r) => r.error)?.error?.message ?? null
  };
}

export async function loadProjectDetail(locals: App.Locals, id: string, url: URL) {
  const workspace = await loadProjectWorkspace(locals);
  const project = workspace.projects.find((p) => p.id === id);
  if (!project && !workspace.loadError) return null;
  const { db } = await projectSession(locals);
  const ids = workspace.accounts.filter((a) => a.wallet_group_id === project?.wallet_group_id).map((a) => a.id);
  const [transactions, credit] = await Promise.all([
    ids.length ? loadAllRows<any>((from, to) => db.from('budget_app_transactions').select('id,kind,account_id,amount,category_id,description,occurred_at').in('account_id', ids).in('kind', ['income', 'expense']).order('occurred_at', { ascending: false }).order('id').range(from, to)) : Promise.resolve({ data: [], error: null }),
    loadCreditData(db)
  ]);
  const entries = workspace.entries.filter((e) => e.project_id === id), funding = workspace.funding.filter((f) => f.project_id === id);
  const classified = new Set(entries.map((e) => e.transaction_id));
  const funded = new Set(funding.map((f) => f.transaction_id));
  const allUnclassified = (transactions.data ?? []).filter((t) => !classified.has(t.id) && !funded.has(t.id));
  const currentPage = Math.max(1, Math.min(Math.ceil(allUnclassified.length / 25) || 1, Number.parseInt(url.searchParams.get('activity_page') ?? '1') || 1));
  const loans = credit[0].data.filter((c) => ids.includes(c.receiving_account_id) && c.kind !== 'lent').map((c) => ({ ...creditProgress(c, credit[2].data, credit[1].data, workspace.today), requestId: crypto.randomUUID() }));
  const entryPages = Math.max(1, Math.ceil(entries.length / 25));
  const entryPage = Math.max(1, Math.min(entryPages, Number.parseInt(url.searchParams.get('entry_page') ?? '1') || 1));
  return { ...workspace, project, entries: entries.slice((entryPage - 1) * 25, entryPage * 25), entryCount: entries.length, entryPage, entryPages, funding, requestIds: { record: crypto.randomUUID(), historical: crypto.randomUUID(), fund: crypto.randomUUID() }, unclassified: allUnclassified.slice((currentPage - 1) * 25, currentPage * 25), unclassifiedCount: allUnclassified.length, activityPage: currentPage, activityPages: Math.max(1, Math.ceil(allUnclassified.length / 25)), loans, loadError: workspace.loadError ?? transactions.error?.message ?? credit.find((r) => r.error)?.error?.message ?? null };
}

export async function projectOperation(request: Request, locals: App.Locals, action: string, projectId?: string) {
  const { db } = await projectSession(locals);
  const form = await request.formData();
  const data: Record<string, unknown> = Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value).trim()]));
  if (projectId) data.project_id = projectId;
  if (action === 'classify') data.entries = form.getAll('transaction_id').map(String).map((id) => ({ transaction_id: id, classification: String(form.get(`classification_${id}`) ?? '') }));
  const { data: result, error } = await db.rpc('budget_app_manage_project', { p_action: action, p_data: data });
  if (error) return fail(400, { message: error.code === '23505' ? 'This wallet is already connected to a project. Open that project instead.' : error.message, action });
  if (action === 'create') redirect(303, `/projects/${result}`);
  return { success: true, message: ({ finish_setup: 'Setup complete. Your project is ready for daily entries.', classify: 'Selected wallet activity classified. Wallet balances are unchanged.', historical: 'Opening history saved. Wallet balances are unchanged.', record: 'Project entry recorded and wallet updated.', fund: 'Project funding recorded.', repay: 'Loan repayment recorded.', unclassify_funding: 'Funding classification removed. The wallet receipt and cash are unchanged.', remove_entry: 'Project classification removed. Wallet balances are unchanged.', update: 'Project details updated.' } as Record<string, string>)[action] ?? 'Saved.' };
}
