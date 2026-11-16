// The watering-can cursor sprinkles a few drops on click.
export function enableWateringCan(el) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    for (let i = 0; i < 4; i++) {
      const drop = document.createElement('span');
      drop.className = 'drop';
      drop.style.left = `${e.clientX - r.left - 2 + (Math.random() - 0.5) * 10}px`;
      drop.style.top = `${e.clientY - r.top + 4}px`;
      drop.style.animationDelay = `${i * 60}ms`;
      el.appendChild(drop);
      drop.addEventListener('animationend', () => drop.remove());
    }
  });
}
