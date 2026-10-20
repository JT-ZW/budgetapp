import type { SubmitFunction } from '@sveltejs/kit';
import { writable } from 'svelte/store';

export type InvestmentFeedback = { state: 'idle' | 'pending' | 'success' | 'error'; message: string };
export const investmentFeedback = writable<InvestmentFeedback>({ state: 'idle', message: '' });

export const handleInvestmentSubmit: SubmitFunction = () => {
  investmentFeedback.set({ state: 'pending', message: 'Saving your changes…' });
  return async ({ result, update }) => {
    if (result.type === 'success') {
      const payload = result.data as { message?: string };
      try {
        await update({ reset: true });
        investmentFeedback.set({ state: 'success', message: payload?.message ?? 'Your changes were saved.' });
      } catch {
        investmentFeedback.set({ state: 'error', message: 'Your changes were saved, but the page could not refresh. Refresh the page before entering them again.' });
      }
      return;
    }
    if (result.type === 'failure') {
      const payload = result.data as { message?: string };
      investmentFeedback.set({ state: 'error', message: payload?.message ?? 'Could not save your changes.' });
      await update({ reset: false, invalidateAll: false });
      return;
    }
    if (result.type === 'error') {
      // SvelteKit's default error update navigates away and discards the form.
      investmentFeedback.set({ state: 'error', message: 'We could not confirm whether your changes were saved. Refresh and check your records before trying again.' });
      return;
    }
    if (result.type === 'redirect') {
      const signInRequired = new URL(result.location, 'http://budget.local').pathname === '/';
      investmentFeedback.set(signInRequired
        ? { state: 'error', message: 'Your session has ended. Sign in again before saving your changes.' }
        : { state: 'success', message: 'Your changes were saved.' });
      await update();
    }
  };
};

