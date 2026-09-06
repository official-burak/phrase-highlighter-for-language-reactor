/**
 * One animation-frame loop for the gloss stack.
 * Pauses while the tab is hidden, stops when nothing is registered,
 * and coalesces resize/scroll/fullscreen/media pause-play into a tick.
 * Pause only remeasures the panel if the player box moved.
 */

type TickFn = () => boolean | void;

const tickers = new Set<TickFn>();
const visibleFns = new Set<() => void>();
const extraScrollRoots = new Set<EventTarget>();

/** Light-DOM scrollers Language Reactor uses instead of (or besides) the window. */
const PAGE_SCROLL_SELECTORS = [".media-wrap", "#lln-full-window", "#root", "#app"] as const;

let raf = 0;
let stable = 0;
let displayHooked = false;
let visHooked = false;

export function pageHidden(): boolean {
  try {
    return typeof document !== "undefined" && Boolean(document.hidden);
  } catch {
    return false;
  }
}

function cancelRaf(): void {
  if (!raf) return;
  cancelAnimationFrame(raf);
  raf = 0;
}

function ensureRaf(): void {
  if (raf || pageHidden() || !tickers.size) return;
  raf = requestAnimationFrame(loop);
}

function loop(): void {
  raf = 0;
  if (pageHidden() || !tickers.size) return;
  let changed = false;
  for (const fn of [...tickers]) {
    try {
      if (fn() === true) changed = true;
    } catch {
      /* ignore */
    }
  }
  if (changed) stable = 0;
  else stable += 1;
  if (tickers.size && stable < 2) ensureRaf();
}

function bindScrollTarget(target: EventTarget | null | undefined): void {
  if (!target || extraScrollRoots.has(target)) return;
  try {
    target.addEventListener("scroll", markDirty, true);
    extraScrollRoots.add(target);
  } catch {
    /* ignore */
  }
}

function isDetachedTarget(target: EventTarget): boolean {
  const node = target as { isConnected?: boolean };
  return node.isConnected === false;
}

function pruneScrollRoots(): void {
  for (const target of [...extraScrollRoots]) {
    if (!isDetachedTarget(target)) continue;
    try {
      target.removeEventListener("scroll", markDirty, true);
    } catch {
      /* ignore */
    }
    extraScrollRoots.delete(target);
  }
}

function unbindExtraScroll(): void {
  for (const target of extraScrollRoots) {
    try {
      target.removeEventListener("scroll", markDirty, true);
    } catch {
      /* ignore */
    }
  }
  extraScrollRoots.clear();
}

function hookPageScrollRoots(): void {
  if (typeof document === "undefined") return;
  pruneScrollRoots();
  bindScrollTarget(document);
  try {
    bindScrollTarget(document.documentElement);
    bindScrollTarget(document.body);
    bindScrollTarget(document.scrollingElement);
  } catch {
    /* ignore */
  }
  for (const sel of PAGE_SCROLL_SELECTORS) {
    try {
      const el = document.querySelector(sel);
      if (!el) continue;
      bindScrollTarget(el);
      bindScrollTarget(el.shadowRoot);
    } catch {
      /* ignore */
    }
  }
}

export function markDirty(): void {
  stable = 0;
  ensureRaf();
}

/** Rebind Language Reactor light-DOM scrollers after navigation. Not on every scroll tick. */
export function refreshScrollRoots(): void {
  if (!displayHooked) return;
  hookPageScrollRoots();
}

function onVis(): void {
  if (pageHidden()) {
    cancelRaf();
    return;
  }
  for (const fn of visibleFns) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
  if (displayHooked) hookPageScrollRoots();
  markDirty();
}

function hookVis(): void {
  if (visHooked || typeof document === "undefined" || typeof document.addEventListener !== "function") return;
  visHooked = true;
  document.addEventListener("visibilitychange", onVis);
}

function unhookVis(): void {
  if (!visHooked) return;
  visHooked = false;
  try {
    document.removeEventListener("visibilitychange", onVis);
  } catch {
    /* ignore */
  }
}

function onMediaLayout(event: Event): void {
  const t = event.target as Node | null;
  if (!t || t.nodeName !== "VIDEO") return;
  markDirty();
}

function hookDisplay(): void {
  if (displayHooked || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  displayHooked = true;
  window.addEventListener("resize", markDirty);
  window.addEventListener("scroll", markDirty, true);
  window.addEventListener("fullscreenchange", markDirty);
  window.addEventListener("pause", onMediaLayout, true);
  window.addEventListener("play", onMediaLayout, true);
  try {
    document.addEventListener("fullscreenchange", markDirty);
    document.addEventListener("webkitfullscreenchange", markDirty);
    document.addEventListener("scroll", markDirty, true);
  } catch {
    /* ignore */
  }
  try {
    window.visualViewport?.addEventListener("resize", markDirty);
    window.visualViewport?.addEventListener("scroll", markDirty);
  } catch {
    /* ignore */
  }
  hookPageScrollRoots();
}

function unhookDisplay(): void {
  if (!displayHooked) return;
  displayHooked = false;
  try {
    window.removeEventListener("resize", markDirty);
    window.removeEventListener("scroll", markDirty, true);
    window.removeEventListener("fullscreenchange", markDirty);
    window.removeEventListener("pause", onMediaLayout, true);
    window.removeEventListener("play", onMediaLayout, true);
    document.removeEventListener("fullscreenchange", markDirty);
    document.removeEventListener("webkitfullscreenchange", markDirty);
    document.removeEventListener("scroll", markDirty, true);
  } catch {
    /* ignore */
  }
  try {
    window.visualViewport?.removeEventListener("resize", markDirty);
    window.visualViewport?.removeEventListener("scroll", markDirty);
  } catch {
    /* ignore */
  }
  unbindExtraScroll();
}

export function onTick(fn: TickFn): void {
  tickers.add(fn);
  hookDisplay();
  ensureRaf();
}

export function offTick(fn: TickFn): void {
  tickers.delete(fn);
  if (!tickers.size) {
    cancelRaf();
    unhookDisplay();
  }
}

export function watchVisibility(onShow: () => void): void {
  visibleFns.add(onShow);
  hookVis();
}

export function unwatchVisibility(onShow: () => void): void {
  visibleFns.delete(onShow);
  if (!visibleFns.size) unhookVis();
}

export function isFrameScheduled(): boolean {
  return raf !== 0;
}

export function frameTickerCount(): number {
  return tickers.size;
}

export function teardownFrame(): void {
  tickers.clear();
  visibleFns.clear();
  cancelRaf();
  unhookDisplay();
  unhookVis();
  stable = 0;
}
