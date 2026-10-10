import { load as sharedLoad, actions as sharedActions } from '../+page.server';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = (event) => sharedLoad(event as unknown as Parameters<typeof sharedLoad>[0]);
export const actions = sharedActions as unknown as Actions;
