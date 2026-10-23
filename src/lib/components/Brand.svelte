<script lang="ts">
  let { href = '/dashboard', full = false }: { href?: string; full?: boolean } = $props();
</script>

<a class="brand" class:homwe-full={full} href={href} aria-label="Homwe home">
  <span class="homwe-art" class:homwe-wordmark={full}>
    <img src="/homwe-logo.png" alt={full ? 'Homwe' : ''} width="1254" height="1254" decoding="async" />
  </span>
  {#if !full}<span>Homwe</span>{/if}
</a>

<style>
  .brand { display: inline-flex; align-items: center; gap: 11px; flex-shrink: 0; text-decoration: none; }
  .homwe-art { position: relative; display: block; flex-shrink: 0; width: 42px; height: 42px; overflow: hidden; border-radius: 12px; background: #fcfaf2; }
  .homwe-art img { position: absolute; display: block; width: 196%; max-width: none; height: auto; left: -48.4%; top: -28.9%; }
  .homwe-wordmark { width: 170px; height: auto; aspect-ratio: 1005 / 895; border-radius: 16px; }
  .homwe-wordmark img { width: 124.78%; left: -12.44%; top: -20.67%; }
  .homwe-full { width: fit-content; }
</style>
