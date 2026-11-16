import { SITE } from '../../site.config.js';
import { loadGarden, matchesFilters, escapeHtml, byTitle, STATUSES, TAGS, STATUS_LABELS } from './data.js';
import { initChrome, setupFilterForm } from './chrome.js';

const $ = (id) => document.getElementById(id);
const filters = { node: '', status: '', tag: [] };
let G;

init().catch((err) => {
  console.error(err);
  $('indexList').innerHTML = `<p class="index-empty">${escapeHtml(err.message)}</p>`;
});

async function init() {
  G = await loadGarden();
  initChrome(G);

  // "Root system": the philosophy, split into paragraphs at the questions.
  $('philosophy').innerHTML = SITE.philosophy
    .split(/(?<=thinking\.)\s+/)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('');

  setupFilterForm($('filters'), G, {
    byTitle,
    onApply: (f) => {
      filters.node = f.node;
      filters.status = f.status;
      filters.tag = f.tag ? [f.tag] : [];
      render();
    },
  });

  // "Clues and codes" is a key, not a control: filtering happens up top.
  $('statusKey').innerHTML = STATUSES.map(
    (s) => `<li><img class="swatch" src="assets/img/icons/seed-${s}.svg" alt="">${STATUS_LABELS[s]}</li>`
  ).join('');
  $('tagKey').innerHTML = TAGS.map((t) => `<li><span class="box"></span>${t}</li>`).join('');

  render();
}

const entryHref = (id) => `entry.html?id=${encodeURIComponent(id)}`;

function render() {
  const nodes = [...G.nodes].sort(byTitle).filter((n) => !filters.node || n.id === filters.node);
  const filtering = filters.status || filters.tag.length;

  const html = nodes.map((node) => {
    // Depth-first under each node, so sub-branches sit under their branch.
    const rows = G.walk(node.id).slice(1)
      .filter((e) => matchesFilters(e, filters))
      .map((e) => {
        const depth = G.pathTo(e.id).length - 1;
        const kind = e.tags.length ? ` <span class="kind">- ${escapeHtml(e.tags.join(', '))}</span>` : '';
        return `<li class="depth-${Math.min(depth, 3)}"><img class="seed-dot" src="assets/img/icons/seed-${e.status}.svg" alt="${e.status}" title="${e.status}"><a href="${entryHref(e.id)}">${escapeHtml(e.title)}</a>${kind}</li>`;
      });
    if (filtering && !rows.length) return '';
    return `<section class="index-node"><h2><a href="${entryHref(node.id)}">${escapeHtml(node.title)}</a></h2>` +
      (rows.length ? `<ul>${rows.join('')}</ul>` : '<p class="index-empty">just a seed — nothing growing yet</p>') + '</section>';
  }).join('');

  const loose = G.loose.filter((e) => matchesFilters(e, filters));
  const looseHtml = loose.length && !filters.node
    ? `<section class="index-node"><h2>Loose seeds</h2><ul>${loose.map((e) => `<li><img class="seed-dot" src="assets/img/icons/seed-${e.status}.svg" alt="${e.status}"><a href="${entryHref(e.id)}">${escapeHtml(e.title)}</a></li>`).join('')}</ul></section>`
    : '';

  $('indexList').innerHTML = html + looseHtml || '<p class="index-empty">Nothing matches those filters.</p>';
}
