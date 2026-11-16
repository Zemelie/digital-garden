import { SITE } from '../../site.config.js';
import { loadGarden, matchesFilters, escapeHtml, byTitle } from './data.js';
import { svgEl, hash, renderDandelion, renderStem, layoutDandelion } from './dandelion.js';
import { startSky } from './sky.js';
import { initChrome, setupFilterForm } from './chrome.js';
import { enableWateringCan } from './ambience.js';

const $ = (id) => document.getElementById(id);
const svg = $('garden');
const stage = $('stage');
const filters = { node: '', status: '', tag: '' };
let G;

const entryHref = (id) => `entry.html?id=${encodeURIComponent(id)}`;

startSky($('sky'));

init().catch((err) => {
  console.error(err);
  stage.insertAdjacentHTML('beforeend', `<p class="load-error">${escapeHtml(err.message)}</p>`);
});

async function init() {
  G = await loadGarden();
  document.title = SITE.title;
  initChrome(G);
  enableWateringCan(stage);
  setupFilterForm($('filters'), G, { byTitle, onApply: (f) => { Object.assign(filters, f); applyFilters(); } });
  renderGarden();
  setupTooltip();
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { renderGarden(); applyFilters(); }, 150);
  });

  // Links in from other pages: ?tag=photo or ?status=fresh pre-filters.
  const q = new URLSearchParams(location.search);
  for (const k of ['node', 'status', 'tag']) {
    const v = q.get(k);
    if (v) { filters[k] = v; $('filters')[k].value = v; }
  }
  applyFilters();
}

const DOT = 14;
const HEAD = 21;
const PLANT_GAP = 70; // minimum clear space between two seed heads

function renderGarden() {
  const nodes = G.nodes;
  const H = 800;
  const groundY = 712;

  // Size every dandelion first, then space them so their seed heads never overlap.
  const sizes = nodes.map((n) => layoutDandelion(G, n.id, { dot: DOT, head: HEAD }).extent);
  const xs = [];
  nodes.forEach((n, i) => {
    if (i === 0) { xs.push(0); return; }
    const want = sizes[i - 1] + sizes[i] + PLANT_GAP;
    xs.push(xs[i - 1] + Math.max(want, 240));
  });
  const span = xs.length ? xs[xs.length - 1] : 0;
  const margin = 200 + (sizes[0] || 0);
  const needed = Math.max(1444, span + margin * 2);
  // Stretch the drawing to the frame's shape so the ground reaches both edges.
  const frameAspect = stage.clientWidth / Math.max(1, stage.clientHeight);
  const W = Math.max(needed, Math.round(H * frameAspect));
  const offset = (W - span) / 2;
  const plantX = nodes.map((n, i) => offset + xs[i]);

  [...svg.childNodes].forEach((n) => n.nodeName !== 'desc' && n.remove());
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  stage.style.setProperty('--garden-w', `${Math.round(needed * 0.53)}px`);
  const plants = svgEl('g', { class: 'plants' }, svg);

  nodes.forEach((node, i) => {
    const hasSeeds = (G.children.get(node.id) || []).length > 0;
    const ext = sizes[i];
    const top = 320 + ext; // keep seeds clear of the title and filters
    const bottom = groundY - 110 - ext * 0.4;
    const headY = hasSeeds
      ? top + hash(node.id + ':y') * Math.max(0, bottom - top)
      : groundY - 80 - hash(node.id) * 30;

    const plant = svgEl('g', { class: 'plant', transform: `translate(${plantX[i].toFixed(1)} ${headY.toFixed(1)})` }, plants);
    plant.dataset.node = node.id;
    renderStem(plant, groundY - headY + 4);
    renderDandelion(plant, G, node.id, { dot: DOT, head: HEAD, hrefFor: entryHref });
  });

  drawGround(W, H, groundY, nodes, plantX);
}

// Cream ground with a stepped, pixel-art top edge and a label under each plant.
function drawGround(W, H, groundY, nodes, plantX) {
  const g = svgEl('g', { class: 'ground' }, svg);
  const pts = [[0, H], [0, groundY + 6]];
  let x = 0;
  let i = 0;
  while (x < W) {
    const step = [-6, 0, 6, 0][i % 4] + Math.round((hash('step' + i) - 0.5) * 4);
    const w = 90 + Math.round(hash('w' + i) * 320);
    pts.push([x, groundY + step], [Math.min(W, x + w), groundY + step]);
    x += w;
    i++;
  }
  pts.push([W, H]);
  svgEl('polygon', { points: pts.map((p) => p.join(',')).join(' '), class: 'ground-fill' }, g);
  for (let k = 0; k < 6; k++) {
    svgEl('rect', { x: hash('px' + k) * W, y: groundY + 30 + hash('py' + k) * 60, width: 8 + hash('pw' + k) * 30, height: 6, class: 'ground-speck' }, g);
  }
  nodes.forEach((node, i) => {
    const a = svgEl('a', { href: entryHref(node.id), class: 'plant-label' }, g);
    a.dataset.node = node.id;
    const t = svgEl('text', { x: plantX[i].toFixed(1), y: groundY + 46, 'text-anchor': 'middle' }, a);
    t.textContent = node.title;
  });
}

function applyFilters() {
  const active = filters.node || filters.status || filters.tag;
  let matches = 0;
  svg.querySelectorAll('.plant, .plant-label').forEach((p) => {
    p.classList.toggle('dimmed', !!filters.node && p.dataset.node !== filters.node);
  });
  svg.querySelectorAll('.seed').forEach((el) => {
    const entry = G.byId.get(el.dataset.id);
    const ok = matchesFilters(entry, filters);
    el.classList.toggle('faded', !ok);
    if (ok && (!filters.node || G.rootOf(entry.id)?.id === filters.node)) matches++;
  });
  $('filterNote').innerHTML = active
    ? `${matches} ${matches === 1 ? 'seed' : 'seeds'} found · <button type="button" class="link-btn" id="clearFilters">clear</button>`
    : '';
  $('clearFilters')?.addEventListener('click', () => {
    Object.keys(filters).forEach((k) => { filters[k] = ''; $('filters')[k].value = ''; });
    applyFilters();
  });
}

function setupTooltip() {
  const tip = $('tooltip');
  svg.addEventListener('pointermove', (e) => {
    const target = e.target.closest('[data-id]');
    if (!target) { tip.hidden = true; return; }
    const entry = G.byId.get(target.dataset.id);
    const r = stage.getBoundingClientRect();
    tip.innerHTML = `<strong>${escapeHtml(entry.title)}</strong><span>${entry.type === 'node' ? 'idea' : entry.status}${entry.tags.length ? ' · ' + entry.tags.join(', ') : ''}</span>`;
    tip.style.left = `${Math.min(e.clientX - r.left + 14, r.width - 200)}px`;
    tip.style.top = `${e.clientY - r.top + 14}px`;
    tip.hidden = false;
  });
  svg.addEventListener('pointerleave', () => (tip.hidden = true));
}
