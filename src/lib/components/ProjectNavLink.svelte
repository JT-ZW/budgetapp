<script lang="ts">
  import { page } from '$app/state';
  import { FolderKanban } from 'lucide-svelte';
  const active = $derived(page.url.pathname.startsWith('/projects'));
</script>
<a class="side-link" class:active href="/projects" aria-current={active ? 'page' : undefined}><FolderKanban size={18}/> Projects</a>
