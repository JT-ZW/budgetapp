<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-svelte';
  import { dateAllowed, dateKey, monthDays, parseDate } from '$lib/calendar';

  let { name, value = $bindable(''), min, max, required = false, disabled = false, id }: {
    name: string; value?: string; min?: string; max?: string; required?: boolean; disabled?: boolean; id?: string;
  } = $props();
  const uid = $props.id();
  let input: HTMLInputElement;
  let trigger: HTMLButtonElement;
  let panel: HTMLDivElement;
  let open = $state(false);
  let accessibleLabel = $state('');
  let top = $state(0), left = $state(0);
  let year = $state(new Date().getFullYear()), month = $state(new Date().getMonth());
  let focusDate = $state('');
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = $derived(monthDays(year, month));
  const tabDate = $derived(days.find((day) => dateKey(day) === focusDate && allowed(dateKey(day))) ?? days.find((day) => day.getMonth() === month && allowed(dateKey(day))));
  const firstYear = $derived(Number(min?.slice(0, 4)) || Math.min(1900, year));
  const lastYear = $derived(Number(max?.slice(0, 4)) || Math.max(2200, year));
  const years = $derived(Array.from({ length: Math.max(0, lastYear - firstYear + 1) }, (_, i) => firstYear + i));
  const allowed = (key: string) => dateAllowed(key, min, max);
  function monthAllowed(y: number, m: number) {
    return (!max || dateKey(new Date(y, m, 1, 12)) <= max) && (!min || dateKey(new Date(y, m + 1, 0, 12)) >= min);
  }

  function validate() {
    if (!input) return;
    input.setCustomValidity(!value || allowed(value) ? '' : `Choose a valid date${min ? ` on or after ${min}` : ''}${max ? ` on or before ${max}` : ''}.`);
  }
  $effect(() => { value; min; max; validate(); });
  $effect(() => { if (disabled && open) panel?.hidePopover(); });

  onMount(() => {
    const initial = value;
    accessibleLabel = Array.from(input.labels?.[0]?.childNodes ?? []).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(' ').trim();
    const form = input.form;
    const reset = () => queueMicrotask(() => { value = initial; panel.hidePopover(); });
    const scroll = (event: Event) => { if (open && !panel.contains(event.target as Node)) panel.hidePopover(); };
    form?.addEventListener('reset', reset);
    document.addEventListener('scroll', scroll, true);
    return () => { form?.removeEventListener('reset', reset); document.removeEventListener('scroll', scroll, true); };
  });

  async function show() {
    if (disabled || open) return;
    const selected = parseDate(value) ?? parseDate(dateKey(new Date()))!;
    const clamped = min && dateKey(selected) < min ? parseDate(min)! : max && dateKey(selected) > max ? parseDate(max)! : selected;
    year = clamped.getFullYear(); month = clamped.getMonth(); focusDate = dateKey(clamped);
    panel.showPopover();
    await tick();
    const rect = input.getBoundingClientRect();
    const bounds = panel.getBoundingClientRect();
    left = Math.max(8, Math.min(rect.left, window.innerWidth - bounds.width - 8));
    top = rect.bottom + bounds.height + 8 <= window.innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - bounds.height - 8);
  }

  async function choose(key: string) {
    value = key;
    panel.hidePopover();
    await tick();
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function navigate(offset: number) {
    const date = new Date(year, month + offset, 1, 12);
    year = date.getFullYear(); month = date.getMonth();
    focusDate = dateKey(date);
  }

  function changeYear(event: Event) {
    year = Number((event.currentTarget as HTMLSelectElement).value);
    if (min && year === Number(min.slice(0, 4))) month = Math.max(month, Number(min.slice(5, 7)) - 1);
    if (max && year === Number(max.slice(0, 4))) month = Math.min(month, Number(max.slice(5, 7)) - 1);
  }

  async function moveFocus(event: KeyboardEvent, key: string) {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const date = parseDate(key)!;
    if (event.key in offsets) date.setDate(date.getDate() + offsets[event.key]);
    else if (event.key === 'Home') date.setDate(date.getDate() - date.getDay());
    else if (event.key === 'End') date.setDate(date.getDate() + 6 - date.getDay());
    else if (event.key === 'PageUp' || event.key === 'PageDown') {
      const target = new Date(year, month + (event.key === 'PageUp' ? -1 : 1), 1, 12);
      target.setDate(Math.min(date.getDate(), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()));
      date.setTime(target.getTime());
    } else return;
    event.preventDefault();
    const next = dateKey(date);
    if (!allowed(next)) return;
    year = date.getFullYear(); month = date.getMonth(); focusDate = next;
    await tick();
    panel.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus();
  }
</script>

<span class="date-control">
  <input bind:this={input} id={id ?? uid} type="text" {name} bind:value placeholder="YYYY-MM-DD" pattern={'[0-9]{4}-[0-9]{2}-[0-9]{2}'} maxlength="10" {required} {disabled} autocomplete="off" aria-label={accessibleLabel || undefined} aria-describedby={`${uid}-format`} onclick={() => show()} onkeydown={(event) => { if (event.key === 'ArrowDown' && event.altKey) { event.preventDefault(); void show().then(() => panel.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus()); } }}/>
  <button bind:this={trigger} class="date-trigger" type="button" {disabled} aria-label="Open calendar" aria-haspopup="dialog" aria-expanded={open} aria-controls={`${uid}-calendar`} onclick={() => open ? panel.hidePopover() : show()}><CalendarDays size={18}/></button>
</span>
<span class="sr-only" id={`${uid}-format`}>Use YYYY-MM-DD, or open the calendar to choose a date.</span>
<div bind:this={panel} id={`${uid}-calendar`} popover="auto" class="calendar-panel" role="dialog" aria-label="Choose a date" style:top={`${top}px`} style:left={`${left}px`} ontoggle={(event) => { open = event.newState === 'open'; }}>
  <div class="calendar-header">
    <div class="calendar-heading"><select aria-label="Month" bind:value={month}>{#each months as label, index}<option value={index} disabled={!monthAllowed(year, index)}>{label}</option>{/each}</select><select aria-label="Year" value={year} onchange={changeYear}>{#each years as option}<option value={option}>{option}</option>{/each}</select></div>
    <button type="button" class="month-nav" aria-label="Previous month" disabled={!monthAllowed(year, month - 1)} onclick={() => navigate(-1)}><ChevronLeft size={18}/></button><button type="button" class="month-nav" aria-label="Next month" disabled={!monthAllowed(year, month + 1)} onclick={() => navigate(1)}><ChevronRight size={18}/></button>
  </div>
  <p class="sr-only" aria-live="polite">{months[month]} {year}</p>
  <div class="calendar-weekdays" aria-hidden="true">{#each weekdays as day}<span>{day}</span>{/each}</div>
  <div class="calendar-days" role="group" aria-label={`${months[month]} ${year}`}>
    {#each days as day}
      {@const key = dateKey(day)}
      <button type="button" class="calendar-day" class:outside={day.getMonth() !== month} class:selected={key === value} class:today={key === dateKey(new Date())} disabled={!allowed(key)} tabindex={tabDate && key === dateKey(tabDate) ? 0 : -1} data-date={key} aria-label={day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} aria-pressed={key === value} aria-current={key === dateKey(new Date()) ? 'date' : undefined} onclick={() => choose(key)} onkeydown={(event) => moveFocus(event, key)}>{day.getDate()}</button>
    {/each}
  </div>
  <div class="calendar-footer"><button type="button" disabled={!value} onclick={() => choose('')}>Clear</button><button type="button" disabled={!allowed(dateKey(new Date()))} onclick={() => choose(dateKey(new Date()))}>Today</button><button type="button" onclick={() => { panel.hidePopover(); trigger.focus(); }}>Done</button></div>
</div>
<svelte:window onresize={() => { if (open) panel.hidePopover(); }}/>

<style>
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
  .date-control { display: block; position: relative; width: 100%; min-width: 0; }
  .date-control input { padding-right: 46px; margin-bottom: 0; }
  .date-trigger { position: absolute; top: 50%; right: 4px; transform: translateY(-50%); display: grid; place-items: center; width: 38px; height: 38px; min-height: 38px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--accent); cursor: pointer; }
  .date-trigger:hover:not(:disabled) { background: var(--accent-soft); }
  .date-trigger:disabled { opacity: .4; cursor: default; }
  .calendar-panel { position: fixed; inset: auto; margin: 0; width: min(336px, calc(100vw - 16px)); max-height: calc(100dvh - 16px); overflow-y: auto; padding: 16px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); color: var(--ink); box-shadow: 0 16px 48px rgb(0 0 0 / .45); font-family: inherit; }
  .calendar-header { display: flex; align-items: center; gap: 4px; margin-bottom: 16px; }
  .calendar-heading { display: flex; flex: 1; gap: 2px; min-width: 0; }
  .calendar-heading select { width: auto; max-width: 125px; min-height: 36px; height: 36px; margin: 0; padding: 0 4px; border: 0; background: transparent; color: var(--ink); font-size: .85rem; font-weight: 700; }
  .month-nav { display: grid; place-items: center; flex: 0 0 32px; width: 32px; height: 36px; padding: 0; border: 0; border-radius: 8px; color: var(--muted); background: transparent; cursor: pointer; }
  .month-nav:hover { background: var(--surface-raised); color: var(--accent); }
  .month-nav:disabled { opacity: .25; cursor: default; }
  .calendar-weekdays, .calendar-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px; }
  .calendar-weekdays { margin-bottom: 7px; text-align: center; color: var(--muted); font-size: .65rem; font-weight: 650; }
  .calendar-day { position: relative; display: grid; place-items: center; aspect-ratio: 1; width: 100%; padding: 0; border: 1px solid transparent; border-radius: 10px; background: transparent; color: var(--ink); font-size: .8rem; font-weight: 600; cursor: pointer; }
  .calendar-day:hover:not(:disabled) { background: var(--accent-soft); color: var(--accent); }
  .calendar-day.outside { color: var(--muted); font-weight: 400; }
  .calendar-day.today { border-color: var(--accent); }
  .calendar-day.selected, .calendar-day.selected:hover { background: var(--accent); color: var(--canvas); font-weight: 800; border-color: var(--accent); }
  .calendar-day:disabled { opacity: .25; cursor: default; }
  .calendar-footer { display: flex; justify-content: space-between; gap: 8px; border-top: 1px solid var(--line); margin-top: 12px; padding-top: 10px; }
  .calendar-footer button { min-height: 36px; padding: 5px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--accent); font-size: .75rem; font-weight: 650; cursor: pointer; }
  .calendar-footer button:hover:not(:disabled) { background: var(--accent-soft); }
  .calendar-footer button:disabled { opacity: .35; cursor: default; }
  button:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
