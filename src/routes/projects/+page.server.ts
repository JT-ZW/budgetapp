import type { Actions, PageServerLoad } from './$types';
import { loadProjectWorkspace, projectOperation } from '$lib/server/projects';
export const load: PageServerLoad = ({ locals }) => loadProjectWorkspace(locals);
export const actions: Actions = { create: ({ request, locals }) => projectOperation(request, locals, 'create') };
