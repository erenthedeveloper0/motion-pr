// One requestAnimationFrame loop for every continuous visualization, running only while at least
// one listener is active (and the tab is visible). Visualizations add themselves while playing
// and remove themselves when paused, off screen or destroyed, so an idle page runs no frame loop.
const listeners = new Set();
let raf = 0;
let last = 0;

function frame(now) {
  const dt = Math.min(64, now - (last || now));
  last = now;
  for (const fn of [...listeners]) fn(dt, now);
  raf = listeners.size && !document.hidden ? requestAnimationFrame(frame) : 0;
}
function wake() {
  if (!raf && listeners.size && !document.hidden) {
    last = 0;
    raf = requestAnimationFrame(frame);
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden && raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  } else wake();
});

export const ticker = {
  add(fn) {
    listeners.add(fn);
    wake();
    return () => ticker.remove(fn);
  },
  remove(fn) {
    listeners.delete(fn);
    if (!listeners.size && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  },
  /** Active loops (exposed for the site's own browser tests). */
  get size() {
    return listeners.size;
  },
  get running() {
    return raf !== 0;
  },
};
