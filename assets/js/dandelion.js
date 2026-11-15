// Draws one dandelion: a node (the seed head) with branches radiating out,
// sub-branches forking from branch tips, and a pappus tuft on every tip.
// The shape grows on its own as entries are added — no manual layout.

const NS = 'http://www.w3.org/2000/svg';

export function svgEl(name, attrs = {}, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

// Stable 0–1 pseudo-random number per string, so the garden looks hand-placed
// but doesn't jump around between visits.
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

const rad = (deg) => (deg * Math.PI) / 180;

/**
 * Radial layout. Each branch gets a slice of the circle proportional to how
 * many tips it carries; leaves sit on the outer ring, forks partway out.
 * Returns Map<id, {x, y, angle, depth, parent}> relative to the head at (0,0).
 */
export function layoutDandelion(g, nodeId, R) {
  const pos = new Map([[nodeId, { x: 0, y: 0, angle: -90, depth: 0, parent: null }]]);
  const top = g.children.get(nodeId) || [];
  if (!top.length) return pos;

  const total = g.leafCount(nodeId);
  // Few branches cluster upward; many fill out the sphere (leaving room for the stem).
  const span = Math.min(300, 70 + total * 48);

  const place = (id, a0, a1, depth) => {
    const ch = g.children.get(id) || [];
    const tot = ch.reduce((s, c) => s + g.leafCount(c.id), 0);
    let a = a0;
    for (const c of ch) {
      const w = ((a1 - a0) * g.leafCount(c.id)) / tot;
      const jitter = (hash(c.id) - 0.5) * Math.min(10, w * 0.3);
      const mid = a + w / 2 + jitter;
      const d = depth + 1;
      const r = R * Math.pow(d / (d + g.height(c.id)), 0.7) * (0.93 + hash(c.id + ':r') * 0.1);
      pos.set(c.id, { x: Math.cos(rad(mid)) * r, y: Math.sin(rad(mid)) * r, angle: mid, depth: d, parent: id });
      place(c.id, a, a + w, d);
      a += w;
    }
  };
  place(nodeId, -90 - span / 2, -90 + span / 2, 0);
  return pos;
}

/**
 * Render a dandelion into an SVG group.
 * opts: R, labels (bool), hrefFor(id), currentId, pathIds (Set), headLabel (string)
 */
export function renderDandelion(parent, g, nodeId, opts) {
  const { R, labels = false, hrefFor, currentId, pathIds } = opts;
  const pos = layoutDandelion(g, nodeId, R);
  const node = g.byId.get(nodeId);
  const pappusLen = Math.max(5, R * 0.1);

  const wrap = svgEl('g', { class: 'dandelion' }, parent);
  const branchLayer = svgEl('g', { class: 'branches' }, wrap);
  const labelLayer = svgEl('g', { class: 'labels' }, wrap);

  const link = (id, layer) => {
    if (!hrefFor) return svgEl('g', {}, layer);
    const a = svgEl('a', { href: hrefFor(id), class: 'entry-link' }, layer);
    a.dataset.id = id;
    return a;
  };

  for (const [id, p] of pos) {
    if (!p.parent) continue;
    const entry = g.byId.get(id);
    const from = pos.get(p.parent);
    const isLeaf = !(g.children.get(id) || []).length;
    const cls = [
      'branch-group',
      `st-${entry.status}`,
      pathIds?.has(id) ? 'on-path' : '',
      currentId === id ? 'is-current' : '',
    ].join(' ');

    const grp = link(id, branchLayer);
    grp.setAttribute('class', `${grp.getAttribute('class') || ''} ${cls}`.trim());
    grp.dataset.id = id;
    grp.dataset.title = entry.title;

    // A gentle, stable bend so lines feel drawn rather than ruled.
    const mx = (from.x + p.x) / 2;
    const my = (from.y + p.y) / 2;
    const len = Math.hypot(p.x - from.x, p.y - from.y);
    const bend = (hash(id + ':bend') - 0.5) * len * 0.22;
    const nx = -(p.y - from.y) / (len || 1);
    const ny = (p.x - from.x) / (len || 1);
    const d = `M${from.x.toFixed(1)} ${from.y.toFixed(1)} Q${(mx + nx * bend).toFixed(1)} ${(my + ny * bend).toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;

    svgEl('path', { d, class: 'hit' }, grp);
    svgEl('path', { d, class: 'branch' }, grp);

    if (isLeaf) {
      // Pappus: the little seed parachute at each tip.
      const tuft = [-36, -18, 0, 18, 36]
        .map((off) => {
          const a = rad(p.angle + off);
          const l = pappusLen * (off === 0 ? 1 : 0.82);
          return `M${p.x.toFixed(1)} ${p.y.toFixed(1)} l${(Math.cos(a) * l).toFixed(1)} ${(Math.sin(a) * l).toFixed(1)}`;
        })
        .join(' ');
      svgEl('path', { d: tuft, class: 'pappus' }, grp);
    } else {
      svgEl('circle', { cx: p.x, cy: p.y, r: Math.max(1.8, R * 0.018), class: 'joint' }, grp);
    }

    if (labels) {
      const a = rad(p.angle);
      const off = isLeaf ? pappusLen + 8 : 10;
      const tx = p.x + Math.cos(a) * off;
      const ty = p.y + Math.sin(a) * off;
      const anchor = Math.cos(a) > 0.25 ? 'start' : Math.cos(a) < -0.25 ? 'end' : 'middle';
      const dy = Math.sin(a) > 0.5 ? '0.9em' : Math.sin(a) < -0.5 ? '-0.2em' : '0.35em';
      const lg = link(id, labelLayer);
      lg.setAttribute('class', `${lg.getAttribute('class') || ''} label-group st-${entry.status}`.trim());
      lg.dataset.id = id;
      const t = svgEl('text', { x: tx.toFixed(1), y: ty.toFixed(1), 'text-anchor': anchor, dy, class: `tip-label ${isLeaf ? '' : 'fork-label'}` }, lg);
      t.textContent = entry.title;
    }
  }

  // Seed head
  const head = link(nodeId, wrap);
  head.setAttribute('class', `${head.getAttribute('class') || ''} head-group st-${node.status} ${currentId === nodeId ? 'is-current' : ''}`.trim());
  head.dataset.id = nodeId;
  head.dataset.title = node.title;
  const hr = Math.max(3.5, R * 0.065);
  const fluff = [];
  for (let i = 0; i < 16; i++) {
    const a = rad(i * 22.5 + hash(nodeId) * 20);
    fluff.push(`M${(Math.cos(a) * hr).toFixed(1)} ${(Math.sin(a) * hr).toFixed(1)} l${(Math.cos(a) * hr * 0.55).toFixed(1)} ${(Math.sin(a) * hr * 0.55).toFixed(1)}`);
  }
  svgEl('circle', { r: hr * 2.2, class: 'hit-head' }, head);
  svgEl('path', { d: fluff.join(' '), class: 'head-fluff' }, head);
  svgEl('circle', { r: hr, class: 'head' }, head);

  if (labels && opts.headLabel) {
    // Sits beside the stem, just under the head — the one gap branches never use.
    const t = svgEl('text', { x: 12, y: Math.max(hr * 3, R * 0.42), class: 'head-label' }, head);
    t.textContent = opts.headLabel;
  }

  return { pos, el: wrap };
}

// A stem from the ground up to the head, with a leaf near the base.
export function renderStem(parent, length, seed) {
  const g = svgEl('g', { class: 'stem-group' }, parent);
  const sway = (hash(seed + ':stem') - 0.5) * length * 0.12;
  svgEl('path', { d: `M0 ${length} C${sway} ${length * 0.66} ${-sway} ${length * 0.33} 0 0`, class: 'stem' }, g);
  const side = hash(seed + ':leaf') > 0.5 ? 1 : -1;
  const ly = length * (0.78 + hash(seed + ':ly') * 0.12);
  const lw = Math.min(26, length * 0.13);
  svgEl('path', {
    d: `M0 ${ly} q${side * lw * 0.5} ${-lw * 0.4} ${side * lw} ${-lw * 1.3} q${-side * lw * 0.15} ${lw * 0.95} ${-side * lw} ${lw * 1.3}`,
    class: 'leaf',
  }, g);
  return g;
}
