// Small atmospheric touches: a sky that follows the visitor's time of day,
// and a watering-can cursor that sprinkles a few drops on click.

export function skyFor(hour) {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

export function applySky(frame, mark) {
  const sky = skyFor(new Date().getHours());
  frame.dataset.sky = sky;
  if (!mark) return;
  const sun = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="7"/><path d="M20 4v6M20 30v6M4 20h6M30 20h6M8.7 8.7l4.2 4.2M27.1 27.1l4.2 4.2M8.7 31.3l4.2-4.2M27.1 12.9l4.2-4.2"/></svg>';
  const moon = '<svg viewBox="0 0 40 40"><path d="M26 8a13 13 0 1 0 6 20A11 11 0 0 1 26 8z"/></svg>';
  const cloud = '<svg class="cloud" viewBox="0 0 60 30"><path d="M12 26h34a8 8 0 0 0 0-16 11 11 0 0 0-21-2 8 8 0 0 0-13 7 6 6 0 0 0 0 11z"/></svg>';
  mark.innerHTML = (sky === 'night' ? moon : sun) + cloud;
  mark.title = `${sky} in the garden`;
}

export function enableWateringCan(frame) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  frame.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = frame.getBoundingClientRect();
    for (let i = 0; i < 4; i++) {
      const drop = document.createElement('span');
      drop.className = 'drop';
      drop.style.left = `${e.clientX - r.left - 2 + (Math.random() - 0.5) * 10}px`;
      drop.style.top = `${e.clientY - r.top + 4}px`;
      drop.style.animationDelay = `${i * 60}ms`;
      frame.appendChild(drop);
      drop.addEventListener('animationend', () => drop.remove());
    }
  });
}
