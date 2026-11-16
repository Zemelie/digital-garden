// Shared bits around every page: the top bar (fish + last tended) and the
// "IT'S 3 O'CLOCK-ISH" footer.
import { timeAgo, escapeHtml } from './data.js';
import { oclockIsh, timeOfDay } from './sky.js';

// Pixel icons from the Figma file (assets/img/icons).
const icon = (name) => `<img src="assets/img/icons/${name}.svg" alt="" aria-hidden="true">`;
export const ICONS = {
  fish: icon('fish'), // Chamcham the fish. Also the secret door to the CMS.
  sprout: icon('last-tended'),
  day: icon('time'),
  night: icon('time'),
};

export function initChrome(G) {
  document.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = ICONS[el.dataset.icon]));

  const clock = () => {
    document.querySelectorAll('[data-clock]').forEach((el) => {
      const tod = timeOfDay();
      // Hydrophilia's numerals sit lower than its capitals, so the hour gets a size bump.
      const text = oclockIsh().replace(/\d+/, (n) => `<span class="num">${n}</span>`);
      el.innerHTML = `<span class="weather">${tod === 'night' ? ICONS.night : ICONS.day}</span><span>${text}</span>`;
    });
  };
  clock();
  setInterval(clock, 60000);

  const e = G?.lastTended;
  const el = document.getElementById('lastTended');
  if (e && el) {
    el.innerHTML = `<span class="icon">${ICONS.sprout}</span><span class="label">Last tended:</span>` +
      `<a href="entry.html?id=${encodeURIComponent(e.id)}">${escapeHtml(e.title)}</a>` +
      `<span class="ago">${escapeHtml(timeAgo(e.tended))}</span>`;
  }
}

export function setupFilterForm(form, G, { onApply, byTitle }) {
  const opt = (v, label) => `<option value="${escapeHtml(v)}">${escapeHtml(label)}</option>`;
  const nodes = [...G.nodes].sort(byTitle);
  form.node.innerHTML = opt('', 'all nodes') + nodes.map((n) => opt(n.id, n.title)).join('');
  form.status.innerHTML = opt('', 'all stages') + ['fresh', 'budding', 'bloomed'].map((s) => opt(s, s)).join('');
  form.tag.innerHTML = opt('', 'all types') + ['document', 'link', 'photo', 'drawing', 'video', 'audio'].map((t) => opt(t, t)).join('');
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    onApply({ node: form.node.value, status: form.status.value, tag: form.tag.value });
  });
}
