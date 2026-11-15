import { SITE } from '../../site.config.js';
import { loadGarden, formatDate, escapeHtml } from './data.js';
import { renderDandelion, renderStem } from './dandelion.js';

const $ = (id) => document.getElementById(id);
const entryHref = (id) => `entry.html?id=${encodeURIComponent(id)}`;
const zoomHref = (id) => `./#/n/${encodeURIComponent(id)}`;

init().catch((err) => {
  console.error(err);
  $('title').textContent = 'Something went wrong';
  $('body').textContent = err.message;
});

async function init() {
  const G = await loadGarden();
  const id = new URLSearchParams(location.search).get('id');
  const entry = G.byId.get(id);
  if (!entry) {
    $('title').textContent = 'Nothing planted here (yet)';
    $('body').innerHTML = `<p>No entry called “${escapeHtml(id)}”. <a href="./">Back to the garden</a>.</p>`;
    return;
  }
  document.title = `${entry.title} · ${SITE.title}`;
  const root = G.rootOf(entry.id);

  renderCrumbs(G, entry);
  renderHeader(entry);
  renderMedia(entry);
  renderBody(entry);
  renderConnections(G, entry);
  renderMeta(entry);
  if (root) renderMiniMap(G, root, entry);
  renderNav(G, entry, root);
  renderComments(entry);
}

function renderCrumbs(G, entry) {
  const path = G.pathTo(entry.id);
  const parts = [`<a href="./">Garden</a>`];
  path.forEach((e, i) => {
    const last = i === path.length - 1;
    const href = e.type === 'node' && !last ? zoomHref(e.id) : entryHref(e.id);
    parts.push(last ? `<span aria-current="page">${escapeHtml(e.title)}</span>` : `<a href="${href}">${escapeHtml(e.title)}</a>`);
  });
  $('crumbs').innerHTML = parts.join('<span class="sep" aria-hidden="true">›</span>');
}

function renderHeader(entry) {
  $('kind').textContent = entry.type === 'node' ? 'Idea / topic' : 'Branch';
  $('title').textContent = entry.title;
  $('tags').innerHTML = entry.tags.map((t) => `<li><a href="./?tag=${t}">${t}</a></li>`).join('');
}

function renderMedia(entry) {
  const out = [];
  if (entry.image) out.push(`<figure><img src="${escapeHtml(entry.image)}" alt="${escapeHtml(entry.title)}"></figure>`);
  if (entry.link) {
    let host = entry.link;
    try { host = new URL(entry.link).hostname.replace(/^www\./, ''); } catch {}
    out.push(`<p><a class="outbound" href="${escapeHtml(entry.link)}" target="_blank" rel="noopener">Visit ${escapeHtml(host)} ↗</a></p>`);
  }
  if (entry.attachments.length) {
    const items = entry.attachments.map(({ label, file }) => {
      const f = escapeHtml(file);
      if (/\.(mp3|m4a|wav|ogg)$/i.test(file)) return `<li><span>${escapeHtml(label)}</span><audio controls preload="none" src="${f}"></audio></li>`;
      if (/\.(mp4|webm|mov)$/i.test(file)) return `<li><span>${escapeHtml(label)}</span><video controls preload="metadata" src="${f}"></video></li>`;
      return `<li><a href="${f}" download>${escapeHtml(label)}</a> <small>${escapeHtml(file.split('.').pop())}</small></li>`;
    });
    out.push(`<ul class="attachments">${items.join('')}</ul>`);
  }
  $('media').innerHTML = out.join('');
}

function renderBody(entry) {
  const md = entry.body || '';
  if (window.marked && window.DOMPurify) {
    $('body').innerHTML = DOMPurify.sanitize(marked.parse(md));
  } else {
    $('body').innerHTML = md.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  }
}

function renderConnections(G, entry) {
  const groups = [];
  const li = (e) => `<li><a href="${entryHref(e.id)}">${escapeHtml(e.title)}</a>${G.rootOf(e.id) && G.rootOf(e.id).id !== G.rootOf(entry.id)?.id ? ` <small>in ${escapeHtml(G.rootOf(e.id).title)}</small>` : ''}</li>`;

  if (entry.parent && G.byId.get(entry.parent)) groups.push(['Grows from', [G.byId.get(entry.parent)]]);
  const kids = G.children.get(entry.id) || [];
  if (kids.length) groups.push([entry.type === 'node' ? 'Branches' : 'Sub-branches', kids]);
  const rel = [...(G.related.get(entry.id) || [])].map((id) => G.byId.get(id));
  if (rel.length) groups.push(['Threads to', rel]);

  $('connections').innerHTML = groups.length
    ? `<h2>Connected to</h2>` + groups.map(([label, list]) => `<div><h3>${label}</h3><ul>${list.map(li).join('')}</ul></div>`).join('')
    : '';
}

function renderMeta(entry) {
  $('planted').textContent = formatDate(entry.planted);
  $('tended').textContent = formatDate(entry.tended);
  $('stage').innerHTML = `<svg class="mark" viewBox="0 0 24 8" aria-hidden="true"><path class="branch st-${entry.status}" d="M1 4 H23"/></svg> ${entry.status}`;
}

function renderMiniMap(G, root, entry) {
  const svg = $('miniMap');
  const pathIds = new Set(G.pathTo(entry.id).map((e) => e.id));
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'plant mini');
  svg.appendChild(g);
  renderStem(g, 170, root.id);
  renderDandelion(g, G, root.id, { R: 105, hrefFor: entryHref, currentId: entry.id, pathIds });
  $('miniCaption').innerHTML = `Where this sits in <a href="${zoomHref(root.id)}">${escapeHtml(root.title)}</a>`;
}

function renderNav(G, entry, root) {
  const set = (id, href) => {
    const a = $(id);
    if (href) a.href = href;
    else { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); }
  };
  if (!root) {
    ['prevBranch', 'nextBranch', 'prevCluster', 'nextCluster'].forEach((id) => set(id, null));
    return;
  }
  const order = G.walk(root.id);
  const i = order.findIndex((e) => e.id === entry.id);
  set('prevBranch', i > 0 ? entryHref(order[i - 1].id) : null);
  set('nextBranch', i < order.length - 1 ? entryHref(order[i + 1].id) : null);

  const n = G.nodes.length;
  const ci = G.nodes.indexOf(root);
  set('prevCluster', n > 1 ? zoomHref(G.nodes[(ci - 1 + n) % n].id) : null);
  set('nextCluster', n > 1 ? zoomHref(G.nodes[(ci + 1) % n].id) : null);
}

function renderComments(entry) {
  const c = SITE.giscus;
  const box = $('commentsBody');
  if (!c.repo || !c.repoId || !c.categoryId) {
    box.innerHTML = '<p class="muted">Comments will grow here soon.</p>';
    return;
  }
  const s = document.createElement('script');
  s.src = 'https://giscus.app/client.js';
  Object.entries({
    'data-repo': c.repo, 'data-repo-id': c.repoId, 'data-category': c.category, 'data-category-id': c.categoryId,
    'data-mapping': 'specific', 'data-term': entry.id, 'data-reactions-enabled': '1', 'data-input-position': 'top',
    'data-theme': 'preferred_color_scheme', 'data-lang': 'en', 'data-loading': 'lazy', crossorigin: 'anonymous',
  }).forEach(([k, v]) => s.setAttribute(k, v));
  s.async = true;
  box.appendChild(s);
}
