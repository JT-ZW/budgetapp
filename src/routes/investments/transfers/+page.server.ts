import { load as sharedLoad, actions as sharedActions } from '../+page.server';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = (event) => sharedLoad(event as Parameters<typeof sharedLoad>[0]);
export const actions = sharedActions as Actions;
