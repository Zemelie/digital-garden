import { getSettings, github, utf8ToBase64, slugify, remember, recall } from './shared.js';

const $ = (id) => document.getElementById(id);
const form = $('seed');
const STAGES = [['fresh', 'fresh'], ['budding', 'budding'], ['bloomed', 'blooming']];
const TYPES = ['link', 'document', 'photo', 'drawing', 'video', 'audio'];

// Opened as a normal web page (not as the extension)? Preview mode: fake tab, nothing is saved.
const inExtension = !!globalThis.chrome?.tabs;
const dryRun = !inExtension || new URLSearchParams(location.search).has('dry');

let settings;
let tab = { title: '', url: '', windowId: undefined };
let garden = [];

init().catch((err) => setStatus(`Couldn’t start: ${err.message}`, true));

async function init() {
  settings = await getSettings();
  if (!settings.token && !dryRun) {
    $('setup').hidden = false;
    return;
  }
  form.hidden = false;

  tab = await currentTab();
  const selection = await selectedText(tab);
  form.title.value = tab.title;
  form.body.value = selection ? `> ${selection.replace(/\n+/g, '\n> ')}\n\n` : '';
  $('link').textContent = tab.url;
  $('link').title = tab.url;

  renderPills();
  await loadGarden();
  form.addEventListener('submit', plant);
  form.body.focus();
  form.body.setSelectionRange(form.body.value.length, form.body.value.length);
  if (dryRun) setStatus('Preview mode: nothing will be saved.');
}

async function currentTab() {
  if (!inExtension) return { title: 'An interesting page about type design', url: 'https://example.com/articles/type-design', windowId: undefined };
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return { id: t.id, title: t.title || '', url: t.url || '', windowId: t.windowId };
}

async function selectedText(t) {
  if (!inExtension || !t.id) return '';
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: t.id }, func: () => String(getSelection() || '').trim() });
    return (res?.result || '').slice(0, 2000);
  } catch {
    return ''; // chrome:// pages and the Web Store don't allow reading the selection
  }
}

function renderPills() {
  $('stages').innerHTML = STAGES.map(([v, label], i) =>
    `<label><input type="radio" name="status" value="${v}" ${i === 0 ? 'checked' : ''}><span><img src="icons/seed-${v}.svg" alt="">${label}</span></label>`
  ).join('');
  $('types').innerHTML = TYPES.map((t) =>
    `<label><input type="checkbox" name="tags" value="${t}" ${t === 'link' ? 'checked' : ''}><span>${t}</span></label>`
  ).join('');
}

// ---------- dandelion + branch pickers (same logic as the CMS picker)

async function loadGarden() {
  const res = await fetch(`${settings.site.replace(/\/$/, '')}/data/garden.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`couldn’t load the garden (${res.status})`);
  garden = (await res.json()).entries || [];

  const nodes = garden.filter((e) => !e.parent).sort((a, b) => a.title.localeCompare(b.title));
  form.node.innerHTML = '<option value="">— new dandelion —</option>' +
    nodes.map((n) => `<option value="${esc(n.id)}">${esc(n.title)}</option>`).join('');

  const lastNode = await recall('lastNode');
  if (lastNode && nodes.some((n) => n.id === lastNode)) form.node.value = lastNode;
  fillBranches();
  form.node.addEventListener('change', fillBranches);
}

function fillBranches() {
  const node = form.node.value;
  const children = new Map();
  garden.forEach((e) => { if (e.parent) (children.get(e.parent) || children.set(e.parent, []).get(e.parent)).push(e); });
  const opts = [];
  const walk = (id, depth) => (children.get(id) || [])
    .sort((a, b) => a.title.localeCompare(b.title))
    .forEach((c) => {
      opts.push(`<option value="${esc(c.id)}">${'  '.repeat(depth)}${depth ? '└ ' : ''}${esc(c.title)}</option>`);
      walk(c.id, depth + 1);
    });
  if (node) walk(node, 0);
  form.branch.innerHTML = `<option value="">${node ? '— straight from the dandelion —' : '—'}</option>` + opts.join('');
  form.branch.disabled = !node || !opts.length;
}

// ---------- planting

async function plant(e) {
  e.preventDefault();
  const title = form.title.value.trim();
  if (!title) return;
  const button = $('plant');
  button.disabled = true;
  setStatus('Planting…');

  try {
    const gh = github(settings);
    const slug = dryRun ? slugify(title) : await uniqueSlug(gh, slugify(title));
    const now = new Date().toISOString();
    const parent = form.branch.value || form.node.value || undefined;
    const tags = [...form.querySelectorAll('input[name=tags]:checked')].map((i) => i.value);

    let host = tab.url;
    try { host = new URL(tab.url).hostname.replace(/^www\./, ''); } catch {}
    const files = /^https?:/.test(tab.url) ? [{ type: 'link', url: tab.url, label: host }] : [];

    if (form.screenshot.checked && inExtension) {
      setStatus('Taking a screenshot…');
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 82 });
      const path = `assets/uploads/${slug}-screenshot.jpg`;
      if (!dryRun) await gh.put(path, dataUrl.split(',')[1], `Upload screenshot for “${slug}” (from Chrome)`);
      files.push({ type: 'photo', file: `/${path}`, label: 'Screenshot' });
      if (!tags.includes('photo')) tags.push('photo');
    }

    const entry = {
      title,
      ...(parent ? { parent } : {}),
      status: form.status.value,
      tags,
      planted: now,
      tended: now,
      ...(files.length ? { files } : {}),
      body: form.body.value.trim(),
    };

    if (dryRun) {
      console.log('Would save', `content/entries/${slug}.json`, entry);
      setStatus(`Preview: would plant “${slug}” — see the console for the entry.`);
    } else {
      await gh.put(`content/entries/${slug}.json`, utf8ToBase64(JSON.stringify(entry, null, 2) + '\n'), `Plant “${slug}” (from Chrome)`);
      const url = `${settings.site.replace(/\/$/, '')}/entry.html?id=${encodeURIComponent(slug)}`;
      $('status').innerHTML = `Planted! It’ll bloom in about a minute. <a href="${url}" target="_blank">See it →</a>`;
      $('status').classList.remove('error');
    }
    await remember('lastNode', form.node.value);
    button.textContent = 'Planted ✓';
  } catch (err) {
    const hint = err.status === 401 || err.status === 403
      ? ' Your GitHub key may have expired or lack write access — check settings.'
      : '';
    setStatus(`Couldn’t plant it: ${err.message}.${hint}`, true);
    button.disabled = false;
  }
}

async function uniqueSlug(gh, base) {
  let slug = base;
  for (let n = 2; await gh.exists(`content/entries/${slug}.json`); n++) slug = `${base}-${n}`;
  return slug;
}

function setStatus(text, isError = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', isError);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
