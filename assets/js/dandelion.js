// Draws one dandelion: a bright seed head with a dot for every entry that
// grows from it. Dot colour = stage (mint fresh, lavender budding, white bloomed).
// Sub-branches sit further out along their parent's direction. The layout is
// computed from the data, so the head fills out as entries are planted.

const NS = 'http://www.w3.org/2000/svg';

export function svgEl(name, attrs = {}, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

// Stable 0–1 pseudo-random number per string, so things look hand-placed
// but don't jump around between visits.
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

const rad = (deg) => (deg * Math.PI) / 180;

// Pixel seed icons from the Figma file (assets/img/icons).
const ICON = {
  fresh: 'assets/img/icons/seed-fresh.svg',
  budding: 'assets/img/icons/seed-budding.svg',
  bloomed: 'assets/img/icons/seed-bloomed.svg',
  head: 'assets/img/icons/seed-head.svg',
};

function seedIcon(parent, href, x, y, r) {
  return svgEl('image', {
    href, x: (x - r).toFixed(1), y: (y - r).toFixed(1), width: (r * 2).toFixed(1), height: (r * 2).toFixed(1),
    class: 'dot-icon', preserveAspectRatio: 'xMidYMid meet',
  }, parent);
}

const spanFor = (leaves) => Math.min(360, 60 + leaves * 55);

/**
 * Radial layout in rings. Each branch gets a slice of the circle proportional
 * to how many tips it carries; branches sit on ring 1, sub-branches on ring 2,
 * and so on. Each ring is pushed out until its dots can't touch each other,
 * and rings are spaced so neighbouring rings can't touch either.
 *
 * Returns { pos: Map<id, {x, y, angle, depth, parent}>, extent } relative to
 * the head at (0,0); extent is the radius of the outermost dot's edge.
 */
export function layoutDandelion(g, nodeId, { dot, head, gap = 6 }) {
  const pos = new Map([[nodeId, { x: 0, y: 0, angle: -90, depth: 0, parent: null }]]);
  if (!(g.children.get(nodeId) || []).length) return { pos, extent: head };

  const span = spanFor(g.leafCount(nodeId));
  const start = -90 - span / 2 + (span === 360 ? hash(nodeId) * 40 : 0);

  // 1. Angles: wedge per subtree, by number of tips.
  const angles = [];
  const place = (id, a0, a1, depth) => {
    const ch = g.children.get(id) || [];
    const tot = ch.reduce((s, c) => s + g.leafCount(c.id), 0);
    let a = a0;
    for (const c of ch) {
      const w = ((a1 - a0) * g.leafCount(c.id)) / tot;
      const mid = a + w / 2 + (hash(c.id) - 0.5) * Math.min(6, w * 0.2);
      angles.push({ id: c.id, parent: id, angle: mid, depth: depth + 1 });
      place(c.id, a, a + w, depth + 1);
      a += w;
    }
  };
  place(nodeId, start, start + span, 0);

  // 2. Ring radii: far enough out that same-ring neighbours clear each other.
  const need = 2 * dot + gap; // centre-to-centre distance for two dots not to touch
  const maxDepth = Math.max(...angles.map((a) => a.depth));
  const ring = [0];
  for (let d = 1; d <= maxDepth; d++) {
    const onRing = angles.filter((a) => a.depth === d).map((a) => a.angle).sort((x, y) => x - y);
    let minSep = Math.PI;
    for (let i = 0; i < onRing.length; i++) {
      const next = i + 1 < onRing.length ? onRing[i + 1] : onRing[0] + 360;
      if (onRing.length > 1) minSep = Math.min(minSep, rad(next - onRing[i]));
    }
    // chord = 2r·sin(sep/2) ≥ need
    const forSpacing = need / (2 * Math.sin(Math.min(minSep, Math.PI) / 2));
    const fromInside = d === 1 ? head + dot + gap + 4 : ring[d - 1] + need + 4;
    ring.push(Math.max(fromInside, forSpacing));
  }

  for (const a of angles) {
    const r = ring[a.depth];
    pos.set(a.id, { x: Math.cos(rad(a.angle)) * r, y: Math.sin(rad(a.angle)) * r, angle: a.angle, depth: a.depth, parent: a.parent });
  }
  return { pos, extent: ring[maxDepth] + dot };
}

/**
 * Render a dandelion head into an SVG group.
 * opts:
 *   dot, head         seed dot radius, head radius
 *   hrefFor(id)       link for each dot / the head
 *   mode              'garden' (all dots in colour) or 'viewer' (dots off the
 *                     current path are dimmed, and the path is drawn dotted)
 *   currentId         the entry being viewed
 */
export function renderDandelion(parent, g, nodeId, opts) {
  const { dot = 10, head = 16, hrefFor, mode = 'garden', currentId } = opts;
  const { pos, extent } = layoutDandelion(g, nodeId, { dot, head });
  const path = new Set(currentId ? g.pathTo(currentId).map((e) => e.id) : []);
  const wrap = svgEl('g', { class: `dandelion mode-${mode}` }, parent);

  const linkTo = (id, layer, cls) => {
    const entry = g.byId.get(id);
    const el = hrefFor ? svgEl('a', { href: hrefFor(id) }, layer) : svgEl('g', {}, layer);
    el.setAttribute('class', `${cls} st-${entry.status}`);
    el.dataset.id = id;
    el.dataset.title = entry.title;
    el.setAttribute('aria-label', `${entry.title} (${entry.status})`);
    return el;
  };

  if (mode === 'viewer' && path.size > 1) {
    const lines = svgEl('g', { class: 'path-lines' }, wrap);
    for (const id of path) {
      const p = pos.get(id);
      if (!p?.parent) continue;
      const from = pos.get(p.parent);
      svgEl('line', { x1: from.x, y1: from.y, x2: p.x, y2: p.y, class: 'path-line' }, lines);
    }
  }

  const seeds = svgEl('g', { class: 'seeds' }, wrap);
  // Draw outer dots first so inner (parent) dots sit on top.
  const order = [...pos.entries()].filter(([, p]) => p.parent).sort((a, b) => b[1].depth - a[1].depth);
  for (const [id, p] of order) {
    const onPath = path.has(id);
    const cls = ['seed', mode === 'viewer' && !onPath ? 'is-muted' : '', id === currentId ? 'is-current' : ''].join(' ');
    const a = linkTo(id, seeds, cls.trim());
    const entry = g.byId.get(id);
    svgEl('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: dot + 3, class: 'hit' }, a);
    svgEl('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: dot + 2.5, class: 'hover-ring' }, a);
    if (mode === 'viewer' && !onPath) {
      // Off-path seeds in the viewer are plain shadow dots.
      svgEl('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: dot, class: 'dot' }, a);
    } else {
      seedIcon(a, ICON[entry.status], p.x, p.y, dot);
    }
  }

  const h = linkTo(nodeId, wrap, `seed-head ${nodeId === currentId ? 'is-current' : ''}`.trim());
  svgEl('circle', { r: head + 4, class: 'hit' }, h);
  svgEl('circle', { r: head + 2.5, class: 'hover-ring' }, h);
  seedIcon(h, ICON.head, 0, 0, head);

  return { pos, extent, el: wrap };
}

// A straight pixel stem from the head down to the ground.
export function renderStem(parent, length, width = 3) {
  return svgEl('rect', { x: -width / 2, y: 0, width, height: length, class: 'stem' }, parent);
}
