import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { loadProjectDetail, projectOperation } from '$lib/server/projects';
export const load: PageServerLoad = async ({ locals, params, url }) => {
  const data = await loadProjectDetail(locals, params.id, url);
  if (!data) error(404, 'Project not found.');
  return data;
};
export const actions: Actions = Object.fromEntries(['finish_setup', 'classify', 'historical', 'record', 'fund', 'repay', 'remove_entry', 'unclassify_funding', 'update'].map((action) => [action, ({ request, locals, params }: Parameters<Actions[string]>[0]) => projectOperation(request, locals, action, params.id)]));
