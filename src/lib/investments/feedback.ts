import type { SubmitFunction } from '@sveltejs/kit';
import { writable } from 'svelte/store';

export type InvestmentFeedback = { state: 'idle' | 'pending' | 'success' | 'error'; message: string };
export const investmentFeedback = writable<InvestmentFeedback>({ state: 'idle', message: '' });

export const handleInvestmentSubmit: SubmitFunction = () => {
  investmentFeedback.set({ state: 'pending', message: 'Saving your changes…' });
  return async ({ result, update }) => {
    if (result.type === 'success') {
      const payload = result.data as { message?: string };
      investmentFeedback.set({ state: 'success', message: payload?.message ?? 'Your changes were saved.' });
      await update({ reset: true });
      return;
    }
    if (result.type === 'failure') {
      const payload = result.data as { message?: string };
      investmentFeedback.set({ state: 'error', message: payload?.message ?? 'Could not save your changes.' });
      await update({ reset: false, invalidateAll: false });
      return;
    }
    if (result.type === 'error') {
      investmentFeedback.set({ state: 'error', message: 'Something went wrong while saving. Please try again.' });
      await update({ reset: false, invalidateAll: false });
      return;
    }
    if (result.type === 'redirect') {
      investmentFeedback.set({ state: 'success', message: 'Your changes were saved.' });
      await update();
    }
  };
};

