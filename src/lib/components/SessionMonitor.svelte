<script lang="ts">
  import { onMount } from 'svelte';
  let { expiresAt }: { expiresAt: string | null } = $props();
  let locked = $state(false);

  onMount(() => {
    let lastActivity = 0;
    let sentActivity = 0;
    let deadline = expiresAt ? Date.parse(expiresAt) : 0;
    let busy = false;
    let lastCheck = 0;
    const activity = (event: Event) => {
      if (event.isTrusted && document.visibilityState === 'visible' && !locked) lastActivity = Date.now();
    };
    const check = async (force = false) => {
      if (!expiresAt || busy) return;
      if (!force && Date.now() - lastCheck < 15000) return;
      lastCheck = Date.now();
      busy = true;
      // Hide private data while checking an elapsed deadline, including after sleep.
      locked = deadline > 0 && Date.now() >= deadline;
      const idleMs = Date.now() - lastActivity;
      const touch = !locked && lastActivity > sentActivity && idleMs <= 15000;
      const pendingActivity = lastActivity;
      try {
        const response = await fetch('/session', {
          method: touch ? 'POST' : 'GET', cache: 'no-store',
          ...(touch ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idleMs }) } : {})
        });
        if (response.status === 401 || response.redirected) {
          locked = true;
          window.location.replace('/?auth=expired');
          return;
        }
        if (!response.ok) return;
        const data = await response.json();
        deadline = Date.parse(data.expiresAt);
        if (touch) sentActivity = pendingActivity;
        locked = Date.now() >= deadline;
      } catch {
        // The server still enforces expiry if the browser is offline.
      } finally { busy = false; }
    };
    const visibility = () => { if (document.visibilityState === 'visible') void check(true); };
    const restore = () => { void check(true); };
    const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'];
    for (const name of events) window.addEventListener(name, activity, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pageshow', restore);
    const timer = window.setInterval(() => {
      if (deadline && Date.now() >= deadline) locked = true;
      void check();
    }, 1000);
    void check();
    return () => {
      clearInterval(timer);
      for (const name of events) window.removeEventListener(name, activity);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pageshow', restore);
    };
  });
</script>

{#if locked}
  <div class="session-lock" role="alert">Your session has ended. Checking sign-in status…</div>
{/if}

<style>
  .session-lock { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; background: var(--canvas); color: var(--ink); }
</style>
