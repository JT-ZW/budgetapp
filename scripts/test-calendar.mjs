import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { dateKey, parseDate, monthDays, dateAllowed } from '../src/lib/calendar.ts';
assert.equal(parseDate('2026-02-29'), null);
assert.equal(parseDate('2024-02-29')?.getDate(), 29);
assert.equal(parseDate('2026-13-01'), null);
assert.equal(parseDate('2026-00-01'), null);
assert.equal(parseDate('2026-11-31'), null);
assert.equal(parseDate('2026-1-01'), null);
assert.equal(parseDate('0000-01-01'), null);
for (const key of ['2024-02-29', '2026-11-01', '2026-12-31', '2027-01-01']) assert.equal(dateKey(parseDate(key)), key);
const november = monthDays(2026, 10);
assert.equal(november.length, 42);
assert.equal(dateKey(november[0]), '2026-11-01');
assert.equal(dateKey(november[41]), '2026-12-12');
assert.equal(dateKey(monthDays(2026, 0)[0]), '2025-12-28');
assert.equal(dateAllowed('2026-11-01', '2026-11-01', '2026-11-30'), true);
assert.equal(dateAllowed('2026-11-30', '2026-11-01', '2026-11-30'), true);
assert.equal(dateAllowed('2026-10-31', '2026-11-01'), false);
assert.equal(dateAllowed('2026-12-01', undefined, '2026-11-30'), false);
assert.equal(dateAllowed('2026-02-30'), false);
console.log('PASS: calendar date parsing, leap years, year boundaries, month grids and inclusive limits');

// Exercise Svelte's actual attribute compilation, not just the date helpers.
// An unescaped {4}/{2} in a quoted template attribute becomes 4/2 in the DOM.
mkdirSync('tmp', { recursive: true });
const temporary = mkdtempSync(resolve('tmp', 'calendar-regression-'));
try {
  const source = readFileSync('src/lib/components/DatePicker.svelte', 'utf8');
  const compiled = compile(source, { filename: 'DatePicker.svelte', generate: 'server' }).js.code
    .replace("import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-svelte';", 'const CalendarDays = () => {}; const ChevronLeft = () => {}; const ChevronRight = () => {};')
    .replace("'$lib/calendar'", JSON.stringify(pathToFileURL(resolve('src/lib/calendar.ts')).href));
  const modulePath = join(temporary, 'DatePicker.mjs');
  writeFileSync(modulePath, compiled);
  const { default: DatePicker } = await import(pathToFileURL(modulePath).href);
  const html = render(DatePicker, { props: { name: 'occurred_on', value: '2026-11-03', required: true } }).body;
  const field = html.match(/<input\b[^>]*>/)?.[0];
  assert.ok(field, 'the date field is rendered');
  const pattern = field.match(/pattern="([^"]*)"/)?.[1];
  assert.equal(pattern, '[0-9]{4}-[0-9]{2}-[0-9]{2}', 'template compilation must preserve regex quantifiers');
  const browserPattern = new RegExp(`^(?:${pattern})$`, 'v');
  for (const date of ['2026-11-03', '2024-02-29', '2026-12-31']) assert.ok(browserPattern.test(date), `calendar date ${date} passes browser format validation`);
  for (const date of ['03/11/2026', '2026-1-3', 'not-a-date']) assert.equal(browserPattern.test(date), false);
  assert.match(field, /name="occurred_on"/);
  assert.match(field, /value="2026-11-03"/);
  assert.match(field, /\brequired\b/);
  console.log('PASS: rendered date field accepts calendar-selected ISO dates and preserves form name, value and required validation');
} finally {
  assert.ok(temporary.startsWith(resolve('tmp') + sep), 'cleanup stays inside the workspace temporary directory');
  rmSync(temporary, { recursive: true, force: true });
}
