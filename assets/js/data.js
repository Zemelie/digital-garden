// Loads data/garden.json and turns the flat entry list into a tree of
// nodes (dandelions) → branches → sub-branches.

export const STATUSES = ['fresh', 'budding', 'bloomed'];
export const TAGS = ['document', 'link', 'photo', 'drawing', 'video', 'audio'];

export async function loadGarden() {
  const res = await fetch('data/garden.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Couldn't load data/garden.json (${res.status}). Run: python3 build.py`);
  const json = await res.json();
  return buildGarden(json.entries || []);
}

const byPlanted = (a, b) =>
  (a.planted || '').localeCompare(b.planted || '') || a.title.localeCompare(b.title);

export function buildGarden(entries) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const children = new Map(entries.map((e) => [e.id, []]));

  for (const e of entries) {
    if (e.type !== 'node' && e.parent && e.parent !== e.id && byId.has(e.parent)) {
      children.get(e.parent).push(e);
    }
  }
  for (const list of children.values()) list.sort(byPlanted);

  // Walk up the parents to find the dandelion an entry belongs to.
  // Returns null for loose entries (missing parent or a loop).
  const rootCache = new Map();
  function rootOf(id) {
    if (rootCache.has(id)) return rootCache.get(id);
    let cur = byId.get(id);
    const seen = new Set();
    while (cur && cur.type !== 'node') {
      if (seen.has(cur.id)) { cur = null; break; }
      seen.add(cur.id);
      cur = byId.get(cur.parent);
    }
    rootCache.set(id, cur || null);
    return cur || null;
  }

  const nodes = entries.filter((e) => e.type === 'node').sort(byPlanted);
  const loose = entries.filter((e) => e.type !== 'node' && !rootOf(e.id)).sort(byPlanted);

  // "related" is stored one way in the CMS but shown both ways.
  const related = new Map(entries.map((e) => [e.id, new Set()]));
  for (const e of entries) {
    for (const r of e.related || []) {
      if (byId.has(r) && r !== e.id) {
        related.get(e.id).add(r);
        related.get(r).add(e.id);
      }
    }
  }

  const leafMemo = new Map();
  function leafCount(id) {
    if (leafMemo.has(id)) return leafMemo.get(id);
    const ch = children.get(id) || [];
    const n = ch.length ? ch.reduce((s, c) => s + leafCount(c.id), 0) : 1;
    leafMemo.set(id, n);
    return n;
  }

  const heightMemo = new Map();
  function height(id) {
    if (heightMemo.has(id)) return heightMemo.get(id);
    const ch = children.get(id) || [];
    const h = ch.length ? 1 + Math.max(...ch.map((c) => height(c.id))) : 0;
    heightMemo.set(id, h);
    return h;
  }

  // Node → main branch → sub-branch → entry, for breadcrumbs.
  function pathTo(id) {
    const path = [];
    const seen = new Set();
    let cur = byId.get(id);
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      path.unshift(cur);
      if (cur.type === 'node') break;
      cur = byId.get(cur.parent);
    }
    return path;
  }

  // Depth-first order of a dandelion: the reading order for "next branch".
  function walk(nodeId) {
    const out = [];
    const visit = (id) => {
      out.push(byId.get(id));
      for (const c of children.get(id) || []) visit(c.id);
    };
    visit(nodeId);
    return out;
  }

  const lastTended = entries.reduce((best, e) => {
    const t = parseDate(e.tended)?.getTime() ?? 0;
    return !best || t > (parseDate(best.tended)?.getTime() ?? 0) ? e : best;
  }, null);

  return { entries, byId, children, nodes, loose, related, rootOf, leafCount, height, pathTo, walk, lastTended };
}

// filters.tag may be one tag or a list (any of them matches).
export function matchesFilters(entry, filters) {
  if (filters.status && entry.status !== filters.status) return false;
  const tags = [].concat(filters.tag || []).filter(Boolean);
  if (tags.length && !tags.some((t) => (entry.tags || []).includes(t))) return false;
  return true;
}

export const STATUS_LABELS = { fresh: 'freshly planted', budding: 'budding idea', bloomed: 'fully bloomed' };

// Dates arrive as 'YYYY-MM-DD' (older entries) or full ISO timestamps (CMS saves).
export function parseDate(iso) {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, 12);
  }
  const d = new Date(iso);
  return isNaN(d) ? null : d;
}

// DD.MM.YYYY, as in the mockups.
export function formatDate(iso) {
  const d = parseDate(iso);
  if (!d) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function timeAgo(iso, now = new Date()) {
  const d = parseDate(iso);
  if (!d) return '';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const mins = Math.max(0, (now - d) / 60000);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'} ago`;
  if (!dateOnly && mins < 60) return mins < 2 ? 'just now' : plural(Math.round(mins), 'minute');
  if (!dateOnly && mins < 60 * 24) return plural(Math.round(mins / 60), 'hour');
  const days = dateOnly
    ? Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12) - d) / 86400000)
    : Math.round(mins / 1440);
  if (days <= 0) return 'today';
  if (days < 14) return plural(days, 'day');
  if (days < 60) return plural(Math.round(days / 7), 'week');
  return plural(Math.round(days / 30), 'month');
}

export const byTitle = (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
