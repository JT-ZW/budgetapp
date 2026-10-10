<script lang="ts">
  import { Check, CircleAlert, LoaderCircle, X } from 'lucide-svelte';
  import { investmentFeedback } from '$lib/investments/feedback';
  const close = () => investmentFeedback.set({ state: 'idle', message: '' });
</script>

{#if $investmentFeedback.state !== 'idle'}
  <div class="operation-modal-backdrop" role="presentation">
    <dialog open class="operation-modal" aria-labelledby="operation-modal-title" aria-describedby="operation-modal-message">
      {#if $investmentFeedback.state === 'pending'}<span class="operation-modal-icon pending"><LoaderCircle size={24} class="operation-spinner"/></span>
      {:else if $investmentFeedback.state === 'success'}<span class="operation-modal-icon success"><Check size={24}/></span>
      {:else}<span class="operation-modal-icon error"><CircleAlert size={24}/></span>{/if}
      <h2 id="operation-modal-title">{$investmentFeedback.state === 'pending' ? 'Please wait' : $investmentFeedback.state === 'success' ? 'Done' : 'Could not complete that'}</h2>
      <p id="operation-modal-message">{$investmentFeedback.message}</p>
      {#if $investmentFeedback.state !== 'pending'}<button class="primary-button" type="button" onclick={close}><X size={16}/> Close</button>{/if}
    </dialog>
  </div>
{/if}
