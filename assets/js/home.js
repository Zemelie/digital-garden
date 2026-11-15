import { SITE } from '../../site.config.js';
import { loadGarden, matchesFilters, formatDate, escapeHtml, STATUSES, TAGS } from './data.js';
import { svgEl, hash, renderDandelion, renderStem } from './dandelion.js';
import { applySky, enableWateringCan } from './ambience.js';

const $ = (id) => document.getElementById(id);
const svg = $('garden');
const frame = $('frame');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const filters = { topic: '', status: '', tag: '' };
let G;

const entryHref = (id) => `entry.html?id=${encodeURIComponent(id)}`;
const zoomHref = (id) => `#/n/${encodeURIComponent(id)}`;

init().catch((err) => {
  console.error(err);
  frame.insertAdjacentHTML('beforeend', `<p class="load-error">${escapeHtml(err.message)}</p>`);
});

async function init() {
  G = await loadGarden();
  applySky(frame, $('skyMark'));
  enableWateringCan(frame);
  setupLastTended();
  setupFilters();
  setupLegend();
  setupIndex();
  setupTooltip();
  window.addEventListener('hashchange', route);
  route();

  // Links in from entry pages: ?tag=photo pre-filters, #index-open opens the index.
  const tag = new URLSearchParams(location.search).get('tag');
  if (TAGS.includes(tag)) setFilter('tag', tag);
  if (location.hash === '#index-open') document.querySelector('[data-open-index]').click();
}

// ---------- routing: #/ is the garden, #/n/<id> zooms into one dandelion

function route() {
  const m = location.hash.match(/^#\/n\/(.+)$/);
  const id = m && decodeURIComponent(m[1]);
  if (id && G.byId.get(id)?.type === 'node') renderZoom(id);
  else renderHome();
  applyFilters();
}

function clearSvg() {
  [...svg.childNodes].forEach((n) => n.nodeName !== 'desc' && n.remove());
  addDefs();
}

function addDefs() {
  const defs = svgEl('defs', {}, svg);
  const pat = svgEl('pattern', { id: 'soil', width: 9, height: 9, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(35)' }, defs);
  svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 9, class: 'soil-line' }, pat);
}

function drawGround(W, groundY, H) {
  const g = svgEl('g', { class: 'ground' }, svg);
  svgEl('rect', { x: -20, y: groundY, width: W + 40, height: H - groundY + 20, fill: 'url(#soil)', class: 'soil' }, g);
  svgEl('path', { d: `M-20 ${groundY} H${W + 20}`, class: 'ground-line' }, g);
  // grass tufts
  const tufts = Math.round(W / 70);
  for (let i = 0; i < tufts; i++) {
    const x = (i + hash('tuft' + i)) * (W / tufts);
    const h = 6 + hash('tuft-h' + i) * 9;
    svgEl('path', { d: `M${x} ${groundY} l-3 ${-h} M${x} ${groundY} l1 ${-h * 1.3} M${x} ${groundY} l4 ${-h * 0.9}`, class: 'grass' }, g);
  }
}

// ---------- the whole garden

function renderHome() {
  document.body.dataset.view = 'home';
  $('gardenTitle').hidden = false;
  $('zoomBar').hidden = true;
  $('threadsNote').hidden = true;
  clearSvg();

  const nodes = G.nodes;
  const H = 680;
  const groundY = 620;
  const W = Math.max(1200, nodes.length * 230 + 160);
  // On phones the title sits above the drawing, so trim the empty sky it would have covered.
  const top = matchMedia('(max-width: 640px)').matches ? 150 : 0;
  svg.setAttribute('viewBox', `0 ${top} ${W} ${H - top}`);
  // Past ~6 dandelions the garden scrolls sideways inside the frame instead of shrinking.
  svg.style.minWidth = `${Math.max(640, W * 0.6)}px`;
  drawGround(W, groundY, H);

  const threadLayer = svgEl('g', { class: 'threads' }, svg);
  const plants = svgEl('g', { class: 'plants' }, svg);
  const globalPos = new Map();
  const margin = 90;
  const slot = (W - margin * 2) / Math.max(1, nodes.length);

  nodes.forEach((node, i) => {
    const leaves = (G.children.get(node.id) || []).length ? G.leafCount(node.id) : 0;
    const R = leaves ? Math.min(slot * 0.46, 48 + 26 * Math.sqrt(leaves)) : 20;
    const x = margin + slot * (i + 0.5) + (hash(node.id + ':x') - 0.5) * slot * 0.16;
    const minHead = 175 + R * 1.15;
    const headY = leaves ? minHead + hash(node.id + ':y') * Math.max(0, groundY - 200 - minHead) : groundY - 80 - hash(node.id) * 40;
    const stemLen = groundY - headY;

    const plant = svgEl('g', { class: 'plant', transform: `translate(${x.toFixed(1)} ${headY.toFixed(1)})` }, plants);
    plant.dataset.node = node.id;
    const body = svgEl('g', { class: 'plant-body' }, plant);

    if (!reduceMotion) {
      const amp = 0.8 + hash(node.id + ':amp') * 0.8;
      svgEl('animateTransform', {
        attributeName: 'transform', type: 'rotate', dur: `${7 + hash(node.id + ':dur') * 4}s`, repeatCount: 'indefinite',
        values: `${-amp} 0 ${stemLen};${amp} 0 ${stemLen};${-amp} 0 ${stemLen}`, calcMode: 'spline',
        keySplines: '0.45 0 0.55 1;0.45 0 0.55 1', begin: `-${(hash(node.id) * 6).toFixed(2)}s`,
      }, body);
    }

    renderStem(body, stemLen, node.id);
    const { pos } = renderDandelion(body, G, node.id, { R, hrefFor: (id) => (id === node.id ? zoomHref(id) : entryHref(id)) });
    for (const [id, p] of pos) globalPos.set(id, { x: x + p.x, y: headY + p.y });

    // Plant marker at the base, like a seed-packet stake.
    const marker = svgEl('a', { href: zoomHref(node.id), class: 'plant-marker' }, plant);
    const t = svgEl('text', { x: 0, y: stemLen + 30, 'text-anchor': 'middle' }, marker);
    t.textContent = node.title;
  });

  // Threads between related entries (the "threading" idea).
  for (const [a, set] of G.related) {
    for (const b of set) {
      if (a > b || !globalPos.has(a) || !globalPos.has(b)) continue;
      if (G.rootOf(a)?.id === G.rootOf(b)?.id) continue;
      const p = globalPos.get(a);
      const q = globalPos.get(b);
      const sag = 50 + Math.abs(p.x - q.x) * 0.12;
      const path = svgEl('path', {
        d: `M${p.x.toFixed(1)} ${p.y.toFixed(1)} Q${((p.x + q.x) / 2).toFixed(1)} ${(Math.max(p.y, q.y) + sag).toFixed(1)} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`,
        class: 'thread',
      }, threadLayer);
      path.dataset.a = a;
      path.dataset.b = b;
    }
  }
}

// ---------- zoomed into one dandelion

function renderZoom(nodeId) {
  document.body.dataset.view = 'zoom';
  const node = G.byId.get(nodeId);
  $('gardenTitle').hidden = true;
  $('zoomBar').hidden = false;
  $('zoomTitle').textContent = node.title;
  document.title = `${node.title} · ${SITE.title}`;

  const i = G.nodes.indexOf(node);
  const n = G.nodes.length;
  $('prevCluster').href = zoomHref(G.nodes[(i - 1 + n) % n].id);
  $('nextCluster').href = zoomHref(G.nodes[(i + 1) % n].id);

  clearSvg();
  const W = 1000;
  const H = 690;
  const groundY = 650;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.minWidth = '640px';
  drawGround(W, groundY, H);

  const hasBranches = (G.children.get(nodeId) || []).length > 0;
  const R = hasBranches ? 230 : 40;
  const headY = hasBranches ? 330 : 500;
  const body = svgEl('g', { class: 'plant zoomed', transform: `translate(${W / 2} ${headY})` }, svg);
  renderStem(body, groundY - headY, nodeId);
  renderDandelion(body, G, nodeId, {
    R, labels: true, hrefFor: entryHref, headLabel: `IDEA / TOPIC: ${node.title}`,
  });

  if (!hasBranches) {
    const t = svgEl('text', { x: W / 2, y: 420, 'text-anchor': 'middle', class: 'seed-note' }, svg);
    t.textContent = 'Just a seed so far — plant a branch from the CMS to help it grow.';
  }

  // Threads that leave this dandelion for other clusters.
  const members = new Set(G.walk(nodeId).map((e) => e.id));
  const out = [];
  for (const id of members) {
    for (const r of G.related.get(id) || []) {
      const other = G.rootOf(r);
      if (other && other.id !== nodeId) out.push({ from: G.byId.get(id), to: G.byId.get(r), cluster: other });
    }
  }
  const note = $('threadsNote');
  note.hidden = !out.length;
  note.innerHTML = out.length
    ? `<span class="label">Threads out</span>` +
      out.map((t) => `<a href="${entryHref(t.to.id)}">${escapeHtml(t.from.title)} ↝ ${escapeHtml(t.to.title)} <small>(${escapeHtml(t.cluster.title)})</small></a>`).join('')
    : '';
}

// ---------- filters (topic / epistemic / tag)

function setupFilters() {
  const form = $('filters');
  const opt = (v, label) => `<option value="${escapeHtml(v)}">${escapeHtml(label)}</option>`;
  form.topic.innerHTML = opt('', 'All topics') + G.nodes.map((n) => opt(n.id, n.title)).join('');
  form.status.innerHTML = opt('', 'All stages') + STATUSES.map((s) => opt(s, s)).join('');
  form.tag.innerHTML = opt('', 'All files') + TAGS.map((t) => opt(t, t)).join('');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    filters.topic = form.topic.value;
    filters.status = form.status.value;
    filters.tag = form.tag.value;
    applyFilters();
  });
}

function setFilter(key, value) {
  filters[key] = value;
  $('filters')[key].value = value;
  applyFilters();
}

function applyFilters() {
  const active = filters.topic || filters.status || filters.tag;
  let matches = 0;

  svg.querySelectorAll('.plant[data-node]').forEach((p) => {
    p.classList.toggle('dimmed', !!filters.topic && p.dataset.node !== filters.topic);
  });
  svg.querySelectorAll('.branch-group, .label-group').forEach((el) => {
    const entry = G.byId.get(el.dataset.id);
    const ok = matchesFilters(entry, filters);
    el.classList.toggle('faded', !ok);
    if (ok && el.classList.contains('branch-group') && (!filters.topic || G.rootOf(entry.id)?.id === filters.topic)) matches++;
  });
  svg.querySelectorAll('.thread').forEach((t) => {
    const show = [t.dataset.a, t.dataset.b].every((id) => matchesFilters(G.byId.get(id), filters));
    t.classList.toggle('faded', !show);
  });

  $('filterNote').innerHTML = active
    ? `${matches} branch${matches === 1 ? '' : 'es'} match · <button type="button" class="link-btn" id="clearFilters">clear</button>`
    : '';
  $('clearFilters')?.addEventListener('click', () => {
    Object.keys(filters).forEach((k) => setFilter(k, ''));
  });
  document.querySelectorAll('.legend-tags button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tag === filters.tag)));
}

// ---------- legend, last tended, index

function setupLegend() {
  const counts = Object.fromEntries(TAGS.map((t) => [t, 0]));
  G.entries.forEach((e) => (e.tags || []).forEach((t) => counts[t]++));
  $('legendTags').innerHTML = TAGS.map(
    (t) => `<li><button type="button" data-tag="${t}" aria-pressed="false"><span class="box" aria-hidden="true"></span>${t} <small>${counts[t]}</small></button></li>`
  ).join('');
  $('legendTags').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tag]');
    if (b) setFilter('tag', filters.tag === b.dataset.tag ? '' : b.dataset.tag);
  });
}

function setupLastTended() {
  const e = G.lastTended;
  $('lastTended').innerHTML = e
    ? `<span class="label">Last tended</span> ${formatDate(e.tended)}<br><a href="${entryHref(e.id)}">${escapeHtml(e.title)}</a>`
    : '';
}

function setupIndex() {
  $('philosophy').textContent = SITE.philosophy;
  const statusMark = (s) => `<svg class="mark" viewBox="0 0 24 8" aria-label="${s}"><path class="branch st-${s}" d="M1 4 H23"/></svg>`;
  const item = (e) => {
    const kids = G.children.get(e.id) || [];
    return `<li>${statusMark(e.status)}<a href="${entryHref(e.id)}">${escapeHtml(e.title)}</a>` +
      (e.tags.length ? ` <span class="tags-inline">${e.tags.join(' · ')}</span>` : '') +
      (kids.length ? `<ul>${kids.map(item).join('')}</ul>` : '') + '</li>';
  };
  let html = G.nodes.map((n) => {
    const kids = G.children.get(n.id) || [];
    return `<div class="index-node"><h3><a href="${zoomHref(n.id)}">${escapeHtml(n.title)}</a> <a class="small" href="${entryHref(n.id)}">notes →</a></h3>` +
      (kids.length ? `<ul>${kids.map(item).join('')}</ul>` : '<p class="muted">a seed, nothing branching yet</p>') + '</div>';
  }).join('');
  if (G.loose.length) {
    html += `<div class="index-node"><h3>Loose seeds</h3><ul>${G.loose.map((e) => `<li>${statusMark(e.status)}<a href="${entryHref(e.id)}">${escapeHtml(e.title)}</a></li>`).join('')}</ul></div>`;
  }
  $('indexList').innerHTML = html;

  const drawer = $('index');
  document.querySelectorAll('[data-open-index]').forEach((btn) =>
    btn.addEventListener('click', () => {
      drawer.hidden = !drawer.hidden;
      document.querySelectorAll('[data-open-index]').forEach((b) => b.setAttribute('aria-expanded', String(!drawer.hidden)));
      if (!drawer.hidden) drawer.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    })
  );
}

// ---------- hover tooltip (the overview has no labels on branches)

function setupTooltip() {
  const tip = $('tooltip');
  svg.addEventListener('pointermove', (e) => {
    const target = e.target.closest('[data-id]');
    if (!target || document.body.dataset.view !== 'home') { tip.hidden = true; return; }
    const entry = G.byId.get(target.dataset.id);
    const r = frame.getBoundingClientRect();
    tip.innerHTML = `<strong>${escapeHtml(entry.title)}</strong><span>${entry.type === 'node' ? 'idea · click to zoom in' : entry.status + (entry.tags.length ? ' · ' + entry.tags.join(', ') : '')}</span>`;
    tip.style.left = `${e.clientX - r.left + 14}px`;
    tip.style.top = `${e.clientY - r.top + 14}px`;
    tip.hidden = false;
  });
  svg.addEventListener('pointerleave', () => (tip.hidden = true));
}
