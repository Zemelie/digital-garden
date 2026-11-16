import { SITE } from '../../site.config.js';
import { loadGarden, formatDate, escapeHtml } from './data.js';
import { renderDandelion, svgEl } from './dandelion.js';
import { bandedGradient, timeOfDay } from './sky.js';
import { initChrome } from './chrome.js';

const $ = (id) => document.getElementById(id);
const entryHref = (id) => `entry.html?id=${encodeURIComponent(id)}`;

paintLandscape();

init().catch((err) => {
  console.error(err);
  $('title').textContent = 'Something went wrong';
  $('body').textContent = err.message;
});

async function init() {
  const G = await loadGarden();
  initChrome(G);
  const id = new URLSearchParams(location.search).get('id');
  const entry = G.byId.get(id);
  if (!entry) {
    $('title').textContent = 'Nothing planted here';
    $('body').innerHTML = `<p>No entry called “${escapeHtml(id)}”. <a href="./">Back to the garden</a>.</p>`;
    return;
  }
  document.title = `${entry.title} · ${SITE.title}`;
  const root = G.rootOf(entry.id);

  renderCrumbs(G, entry);
  $('title').textContent = entry.title;
  $('stage').textContent = entry.status;
  $('tended').textContent = formatDate(entry.tended);
  $('planted').textContent = formatDate(entry.planted);
  $('kind').textContent = entry.tags.length ? entry.tags.join(', ') : (entry.type === 'node' ? 'idea' : '—');
  renderMedia(entry);
  renderBody(entry);
  if (root) renderViewer(G, root, entry);
  else $('viewerNode').textContent = 'loose seed';
  renderConnected(G, entry);
  renderNav(G, entry, root);
  renderComments(entry);
}

// The pixel landscape, with its sky cut out so the time-of-day sky shows through.
function paintLandscape() {
  const stage = $('entryStage');
  const sky = bandedGradient(timeOfDay(), 18);
  stage.style.backgroundImage = sky;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    const px = data.data;
    const [sr, sg, sb] = [px[0], px[1], px[2]]; // top-left pixel is pure sky
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      if (Math.abs(r - sr) + Math.abs(g - sg) + Math.abs(b - sb) < 18) {
        px[i + 3] = 0;
      } else if (r > 200 && g > 200 && b < 170) {
        // The yellow scrollbar note from the mockup: patch it with the pixel to its left.
        const j = i - 14 * 4;
        px[i] = px[j]; px[i + 1] = px[j + 1]; px[i + 2] = px[j + 2]; px[i + 3] = px[j + 3];
      }
    }
    ctx.putImageData(data, 0, 0);
    stage.style.backgroundImage = `url(${c.toDataURL()}), ${sky}`;
  };
  img.src = 'assets/img/entry-landscape.png';
}

function renderCrumbs(G, entry) {
  const arrow = '<span class="sep" aria-hidden="true"><img src="assets/img/icons/arrow-right.svg" alt=""></span>';
  const parts = ['<a href="./">Garden</a>'];
  const path = G.pathTo(entry.id);
  path.forEach((e, i) => {
    parts.push(i === path.length - 1
      ? `<span aria-current="page">${escapeHtml(e.title)}</span>`
      : `<a href="${entryHref(e.id)}">${escapeHtml(e.title)}</a>`);
  });
  $('crumbs').innerHTML = parts.join(arrow);
}

// Uploaded photos can be huge (phone photos are ~5MB). On the live site, Netlify's
// Image CDN resizes and recompresses them on the fly; locally we show the original.
const ON_NETLIFY = !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
function resized(src, width) {
  if (!ON_NETLIFY || !src.startsWith('/assets/uploads/')) return src;
  return `/.netlify/images?url=${encodeURIComponent(src)}&w=${width}&q=80`;
}
function responsiveImg(src, alt) {
  const s = escapeHtml(src);
  if (!ON_NETLIFY || !src.startsWith('/assets/uploads/')) return `<img src="${s}" alt="${escapeHtml(alt)}" loading="lazy">`;
  const set = [600, 1000, 1600].map((w) => `${escapeHtml(resized(src, w))} ${w}w`).join(', ');
  return `<img src="${escapeHtml(resized(src, 1000))}" srcset="${set}" sizes="(max-width: 700px) 100vw, 620px" alt="${escapeHtml(alt)}" loading="lazy">`;
}

function renderMedia(entry) {
  const out = entry.attachments.map(({ kind, label, file, url }) => {
    const src = escapeHtml(file || url || '');
    const cap = label ? `<figcaption>${escapeHtml(label)}</figcaption>` : '';
    if ((kind === 'photo' || kind === 'drawing') && file) return `<figure>${responsiveImg(file, label || entry.title)}${cap}</figure>`;
    if (kind === 'audio') return `<figure><audio controls preload="none" src="${src}"></audio>${cap}</figure>`;
    if (kind === 'video' && file) return `<figure><video controls preload="metadata" src="${src}"></video>${cap}</figure>`;
    if (url) {
      let host = url;
      try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
      return `<a class="file-link" href="${src}" target="_blank" rel="noopener">${escapeHtml(label || host)} ↗</a>`;
    }
    return `<a class="file-link" href="${src}" download>${escapeHtml(label || src.split('/').pop())} ↓</a>`;
  });
  $('media').innerHTML = out.join('');
}

function renderBody(entry) {
  const md = entry.body || '';
  $('body').innerHTML = window.marked && window.DOMPurify
    ? DOMPurify.sanitize(marked.parse(md))
    : md.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  // Images dropped into the notes get resized too.
  $('body').querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (src.startsWith('/assets/uploads/')) {
      img.src = resized(src, 1000);
      img.loading = 'lazy';
    }
  });
}

function renderViewer(G, root, entry) {
  $('viewerNode').textContent = root.title;
  const svg = $('viewer');
  const plant = svgEl('g', { class: 'plant' }, svg);
  const stem = svgEl('rect', { x: -1.5, y: 0, width: 3, height: 0, class: 'viewer-stem' }, plant);
  const dot = 11;
  const { pos, extent } = renderDandelion(plant, G, root.id, { dot, head: 18, hrefFor: entryHref, mode: 'viewer', currentId: entry.id });

  // Frame the whole seed head, however big it has grown, with room for the stem below.
  const half = Math.max(105, extent + 14);
  const below = Math.max(110, half * 0.75);
  svg.setAttribute('viewBox', `${-half} ${-half} ${half * 2} ${half + below}`);
  stem.setAttribute('height', below);

  // A dotted arrow from the card below up to this entry's dot.
  const p = pos.get(entry.id);
  if (p) {
    const isHead = entry.id === root.id;
    const x = isHead ? 28 : p.x;
    const top = isHead ? 24 : p.y + dot + 5;
    svgEl('path', { d: `M${x} ${below} V${top + 4}`, class: 'pointer' }, svg);
    svgEl('path', { d: `M${x - 5} ${top + 9} L${x} ${top + 3} L${x + 5} ${top + 9}`, class: 'pointer-head' }, svg);
  }
}

function renderConnected(G, entry) {
  const rows = [];
  const add = (e, note) => rows.push(
    `<li><a href="${entryHref(e.id)}">${escapeHtml(e.title)}</a><span class="kind">${escapeHtml(note || e.tags[0] || (e.type === 'node' ? 'node' : ''))}</span></li>`
  );
  const parent = entry.parent && G.byId.get(entry.parent);
  if (parent) add(parent, 'grows from');
  (G.children.get(entry.id) || []).forEach((e) => add(e));
  [...(G.related.get(entry.id) || [])].forEach((rid) => add(G.byId.get(rid), 'thread'));

  $('connected').innerHTML = `<h3>${escapeHtml(entry.title)} ${entry.type === 'node' ? 'node' : 'branch'}</h3>` +
    (rows.length ? `<span class="label">Connected to</span><ul>${rows.join('')}</ul>` : '<p class="none">Nothing connected yet.</p>');
}

function renderNav(G, entry, root) {
  const set = (id, href, title) => {
    const a = $(id);
    if (href) { a.href = href; if (title) a.title = title; }
    else { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); }
  };
  if (!root) { ['prevBranch', 'nextBranch', 'prevNode', 'nextNode'].forEach((id) => set(id, null)); return; }

  const order = G.walk(root.id);
  const i = order.findIndex((e) => e.id === entry.id);
  set('prevBranch', i > 0 ? entryHref(order[i - 1].id) : null, order[i - 1]?.title);
  set('nextBranch', i < order.length - 1 ? entryHref(order[i + 1].id) : null, order[i + 1]?.title);

  const n = G.nodes.length;
  const ci = G.nodes.indexOf(root);
  const prev = G.nodes[(ci - 1 + n) % n];
  const next = G.nodes[(ci + 1) % n];
  set('prevNode', n > 1 ? entryHref(prev.id) : null, prev.title);
  set('nextNode', n > 1 ? entryHref(next.id) : null, next.title);
}

function renderComments(entry) {
  const c = SITE.giscus;
  const box = $('commentsBody');
  if (!c.repo || !c.repoId || !c.categoryId) {
    box.innerHTML = '<p class="empty">Comments are coming soon.</p>';
    return;
  }
  const s = document.createElement('script');
  s.src = 'https://giscus.app/client.js';
  Object.entries({
    'data-repo': c.repo, 'data-repo-id': c.repoId, 'data-category': c.category, 'data-category-id': c.categoryId,
    'data-mapping': 'specific', 'data-term': entry.id, 'data-reactions-enabled': '0', 'data-input-position': 'bottom',
    'data-theme': 'light', 'data-lang': 'en', 'data-loading': 'lazy', crossorigin: 'anonymous',
  }).forEach(([k, v]) => s.setAttribute(k, v));
  s.async = true;
  box.appendChild(s);
}
