// The planting page behind the fish: the Chrome extension's form, as a web page,
// so it works on a phone too. Photos are resized on the device before uploading.
import { getSettings, saveSettings, github, utf8ToBase64, slugify, remember, recall } from '../chrome-extension/shared.js';

const $ = (id) => document.getElementById(id);
const form = $('seed');
const setupForm = $('setup');
const STAGES = [['fresh', 'fresh'], ['budding', 'budding'], ['bloomed', 'blooming']];
const TYPES = ['photo', 'link', 'document', 'drawing', 'video', 'audio'];
const MAX_SIDE = 1600; // px, longest edge after resizing
const dryRun = new URLSearchParams(location.search).has('dry'); // test mode: nothing is saved

let settings;
let garden = [];
const photos = []; // { blob, url }

init().catch((err) => setStatus(`Couldn’t start: ${err.message}`, true));

async function init() {
  settings = { ...(await getSettings()), site: location.origin };
  $('openSettings').addEventListener('click', () => showSetup(true));
  setupForm.addEventListener('submit', saveKey);

  renderPills();
  await loadGarden();
  for (const input of [$('camera'), $('library')]) input.addEventListener('change', addPhotos);
  form.url.addEventListener('input', () => tick('link', !!form.url.value.trim()));
  form.addEventListener('submit', plant);

  if (!settings.token && !dryRun) showSetup(true);
  else showSetup(false);
  if (dryRun) setStatus('Test mode: nothing will be saved.');
}

// ---------- one-time setup

function showSetup(on) {
  setupForm.hidden = !on;
  form.hidden = on;
  if (on) setupForm.token.value = settings.token || '';
}

async function saveKey(e) {
  e.preventDefault();
  const token = setupForm.token.value.trim();
  const status = $('setupStatus');
  status.classList.remove('error');
  status.textContent = 'Testing the key…';
  try {
    const repo = await github({ ...settings, token }).repoInfo();
    if (repo.permissions && !repo.permissions.push) throw new Error('this key can read but not write — give it Contents: Read and write');
    await saveSettings({ token });
    settings.token = token;
    status.textContent = '';
    showSetup(false);
    setStatus('All set! This device can plant now.');
  } catch (err) {
    status.classList.add('error');
    status.textContent = `Not quite: ${err.message}`;
  }
}

// ---------- form pieces

function renderPills() {
  $('stages').innerHTML = STAGES.map(([v, label], i) =>
    `<label><input type="radio" name="status" value="${v}" ${i === 0 ? 'checked' : ''}><span><img src="../chrome-extension/icons/seed-${v}.svg" alt="">${label}</span></label>`
  ).join('');
  $('types').innerHTML = TYPES.map((t) =>
    `<label><input type="checkbox" name="tags" value="${t}"><span>${t}</span></label>`
  ).join('');
}

const tick = (tag, on) => { const box = form.querySelector(`input[name=tags][value=${tag}]`); if (box) box.checked = on; };

async function loadGarden() {
  const res = await fetch('../data/garden.json', { cache: 'no-cache' });
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

// ---------- photos: resized on the device, so uploads are small and quick

async function addPhotos(e) {
  const files = [...e.target.files];
  e.target.value = '';
  for (const file of files) {
    try {
      const blob = await resize(file);
      photos.push({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setStatus(`Couldn’t read ${file.name || 'that photo'}.`, true);
    }
  }
  renderThumbs();
}

async function resize(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('resize failed'))), 'image/jpeg', 0.82));
}

function renderThumbs() {
  $('thumbs').innerHTML = photos.map((p, i) =>
    `<li><img src="${p.url}" alt="Photo ${i + 1}"><span class="size">${Math.round(p.blob.size / 1024)}KB</span>` +
    `<button type="button" data-i="${i}" aria-label="Remove photo ${i + 1}">×</button></li>`
  ).join('');
  $('thumbs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const [gone] = photos.splice(Number(b.dataset.i), 1);
    URL.revokeObjectURL(gone.url);
    renderThumbs();
  }));
  tick('photo', photos.length > 0);
}

async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ---------- planting

async function plant(e) {
  e.preventDefault();
  const title = form.title.value.trim();
  if (!title) return;
  const button = $('plant');
  button.disabled = true;

  try {
    const gh = github(settings);
    const slug = dryRun ? slugify(title) : await uniqueSlug(gh, slugify(title));
    const now = new Date().toISOString();
    const parent = form.branch.value || form.node.value || undefined;
    const tags = [...form.querySelectorAll('input[name=tags]:checked')].map((i) => i.value);
    const files = [];

    for (let i = 0; i < photos.length; i++) {
      setStatus(`Uploading photo ${i + 1} of ${photos.length}…`);
      const path = `assets/uploads/${slug}${photos.length > 1 ? `-${i + 1}` : ''}.jpg`;
      if (!dryRun) await gh.put(path, await blobToBase64(photos[i].blob), `Upload photo for “${slug}”`);
      files.push({ type: 'photo', file: `/${path}`, label: '' });
    }
    const url = form.url.value.trim();
    if (url) {
      let host = url;
      try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
      files.push({ type: 'link', url, label: host });
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

    setStatus('Planting…');
    if (dryRun) {
      console.log('Would save', `content/entries/${slug}.json`, entry, photos.map((p) => p.blob.size));
      setStatus(`Test mode: would plant “${slug}” with ${photos.length} photo(s).`);
      button.disabled = false;
      return;
    }
    await gh.put(`content/entries/${slug}.json`, utf8ToBase64(JSON.stringify(entry, null, 2) + '\n'), `Plant “${slug}”`);
    await remember('lastNode', form.node.value);
    $('status').innerHTML = `Planted! It’ll bloom in about a minute. <a href="../entry.html?id=${encodeURIComponent(slug)}">See it →</a> · <button type="button" class="link-btn" id="again">plant another</button>`;
    $('status').classList.remove('error');
    $('again').addEventListener('click', reset);
    button.textContent = 'Planted ✓';
  } catch (err) {
    const hint = err.status === 401 || err.status === 403 ? ' The GitHub key may have expired — tap settings.' : '';
    setStatus(`Couldn’t plant it: ${err.message}.${hint}`, true);
    button.disabled = false;
  }
}

function reset() {
  const node = form.node.value;
  form.reset();
  form.node.value = node;
  fillBranches();
  photos.splice(0).forEach((p) => URL.revokeObjectURL(p.url));
  renderThumbs();
  $('plant').disabled = false;
  $('plant').textContent = 'Plant it!';
  setStatus('');
  window.scrollTo({ top: 0 });
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
