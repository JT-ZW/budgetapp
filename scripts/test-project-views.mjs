// Render the actual Svelte pages with isolated ledger data. Only browser-only
// navigation/enhancement hooks and decorative icons are stubbed for Node SSR.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import ts from 'typescript';

export async function checkProjectViews(workspace, detail) {
  mkdirSync('tmp', { recursive: true });
  const temporary = mkdtempSync(resolve('tmp', 'project-views-'));
  const cache = new Map(); let serial = 0;
  const appState = join(temporary, 'state.mjs'), forms = join(temporary, 'forms.mjs');
  writeFileSync(appState, `export const page={url:new URL('http://test.invalid/projects/${detail.project.id}')};`);
  writeFileSync(forms, 'export function enhance() {}');
  function module(path) {
    path = resolve(path);
    if (cache.has(path)) return cache.get(path);
    const file = join(temporary, `view-${serial++}.mjs`), url = pathToFileURL(file).href;
    cache.set(path, url);
    const source = readFileSync(path, 'utf8');
    let code = path.endsWith('.svelte') ? compile(source, { filename: path, generate: 'server' }).js.code : ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    code = code.replace(/import \{([^}]+)\} from ['"]lucide-svelte['"];?/g, (_, names) => names.split(',').map((name) => `const ${name.trim()}=()=>{};`).join('\n'));
    code = code.replace(/from (['"])([^'"]+)\1/g, (all, quote, specifier) => {
      if (specifier === '$app/state') return `from '${pathToFileURL(appState).href}'`;
      if (specifier === '$app/forms') return `from '${pathToFileURL(forms).href}'`;
      if (!specifier.startsWith('$lib/') && !specifier.startsWith('.')) return all;
      let target = specifier.startsWith('$lib/') ? resolve('src/lib', specifier.slice(5)) : resolve(dirname(path), specifier);
      if (!existsSync(target)) target += '.ts';
      return `from '${module(target)}'`;
    });
    writeFileSync(file, code);
    return url;
  }
  try {
    const Overview = (await import(module('src/routes/projects/+page.svelte'))).default;
    const Detail = (await import(module('src/routes/projects/[id]/+page.svelte'))).default;
    const overview = render(Overview, { props: { data: workspace, form: null } }).body;
    assert.match(overview, /Connect a project/);
    assert.match(overview, /BeVisioneers garden/);
    const connect = render(Overview, { props: { data: { ...workspace, projects: [] }, form: null } }).body;
    assert.match(connect, /action="\?\/create"/);
    const setup = render(Detail, { props: { data: { ...detail, project: { ...detail.project, setup_completed: false } }, form: null } }).body;
    assert.match(setup, /Finish setup and start daily tracking/);
    assert.ok(/opening history/i.test(setup), 'setup includes opening-history capture');
    assert.doesNotMatch(setup, /action="\?\/record"/);
    const daily = render(Detail, { props: { data: detail, form: null } }).body;
    assert.match(daily, /action="\?\/record"/);
    assert.match(daily, /action="\?\/fund"/);
    assert.match(daily, /action="\?\/repay"/);
    assert.match(daily, /50\.00/);
    assert.match(daily, /name="occurred_on"/);
    assert.match(daily, /pattern="\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}"/);
    assert.doesNotMatch(daily, /pattern="\[0-9\]4/);
    const failed = render(Overview, { props: { data: { ...workspace, loadError: 'Missing migration' }, form: null } }).body;
    assert.match(failed, /Projects are unavailable/);
    assert.doesNotMatch(failed, /action="\?\/create"/);
    console.log('PASS: real Projects pages render setup, daily capture, funding, repayments, date validation and unavailable states');
  } finally {
    assert.ok(temporary.startsWith(resolve('tmp') + sep));
    rmSync(temporary, { recursive: true, force: true });
  }
}
