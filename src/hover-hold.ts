/**
 * Disarm Language Reactor cue hover until the user actually moves the pointer.
 * Default (no html.lrph-hover-armed) is disarmed: CSS pointer-events none on
 * cue/translation hosts AND their descendants, plus sentence star/save controls.
 * Isolated JS only ADDS lrph-hover-armed after a real move. Layout mousemove
 * with movementX/Y 0 must not arm (clientX can change on dock reflow).
 */
import { PLAYER_CUE_SELECTORS, TRANSLATION_SELECTORS } from "./selectors";

export const HOVER_HOLD_ARMED_CLASS = "lrph-hover-armed";
export const HOVER_HOLD_STYLE_ID = "lrph-hover-hold-css";

/** Overlay wrap that contains the YouTube iframe. Never descendant-none this. */
const IFRAME_WRAP_SEL = ".video-subs-wrap-overvideo";

/** Reader/player wraps that host cues but are not in PLAYER_CUE_SELECTORS. */
const LEARNING_CUE_WRAP_SELECTORS = [
  ".lri-MediaPlayer_TEXT-wrap",
  ".lri-MediaPlayer_PODCAST-wrap",
  ".lri-SubsView-wrap",
  ".lri-VideoView-wrap",
  ".lri-VideoView-wrap2",
  ".lri-VideoView-wrap3",
  ".video-subs-wrap",
];

/** Cue + translation hosts for hover-hold CSS (not sidebar, toolbar, or video). */
export const HOVER_HOLD_HOST_SELECTORS = [
  ...PLAYER_CUE_SELECTORS.filter((sel) => sel !== IFRAME_WRAP_SEL),
  ...LEARNING_CUE_WRAP_SELECTORS,
  ...TRANSLATION_SELECTORS,
  ".svx-row",
  ".sentence-wrap",
  ".sentence-row",
  ".sentence-view",
  ".lln-sentence-wrap",
  ".svx-sentence-wrap",
  ".lln-word",
  ".lln-hover-tooltip",
  ".dc-orig",
  ".dc-hover",
  ".dc-layer",
];

/** Same list; kept so older callers keep working. */
export const HOVER_HOLD_TARGET_SELECTORS = HOVER_HOLD_HOST_SELECTORS;

/**
 * Sentence star / save-expression controls. May sit beside the cue or be
 * portaled; hover on these is what Language Reactor uses to reveal/save.
 */
export const HOVER_HOLD_STAR_SELECTORS = [
  ".lln-save",
  ".lln-save-btn",
  ".lln-save-cue",
  "[class*='save-cue']",
  "[class*='SaveCue']",
  "[class*='saveCue']",
  "[class*='SavedCue']",
  "[class*='saved-cue']",
  "svg[data-testid*='Star' i]",
  "svg[data-testid*='Bookmark' i]",
  "[data-testid='StarIcon']",
  "[data-testid='StarBorderIcon']",
  "[data-testid='StarRateIcon']",
  "button[aria-label*='Save subtitle' i]",
  "button[aria-label*='Save phrase' i]",
  "button[aria-label*='Save sentence' i]",
  "button[aria-label*='Save current' i]",
  "button[title*='Save subtitle' i]",
  "button[title*='Save phrase' i]",
  "button[aria-label*='Kaydet' i]",
  "button[aria-label*='kaydet' i]",
  "button[title*='Kaydet' i]",
  "button[aria-label*='ifade' i]",
  "button[title*='ifade' i]",
];

/** Pixels of trusted movementX/Y after disarm before MiniDict/star hover is allowed. */
export const HOVER_HOLD_ARM_PX = 8;

let travel = 0;
let bound = false;

function htmlRoot(): HTMLElement | null {
  return typeof document !== "undefined" ? document.documentElement : null;
}

function axisDelta(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** movementX/Y only. clientX changes on reflow must not count. */
export function pointerMovePixels(event: MouseEvent): number {
  return Math.hypot(axisDelta(event.movementX), axisDelta(event.movementY));
}

export function isRealPointerMove(event: MouseEvent): boolean {
  return pointerMovePixels(event) > 0;
}

export function isHoverHoldArmed(): boolean {
  try {
    return Boolean(htmlRoot()?.classList?.contains(HOVER_HOLD_ARMED_CLASS));
  } catch {
    return false;
  }
}

export function disarmHoverHold(): void {
  try {
    htmlRoot()?.classList?.remove(HOVER_HOLD_ARMED_CLASS);
  } catch {
    /* ignore */
  }
  travel = 0;
}

export function armHoverHold(): void {
  try {
    htmlRoot()?.classList?.add(HOVER_HOLD_ARMED_CLASS);
  } catch {
    /* ignore */
  }
}

function cssIsList(selectors: readonly string[]): string {
  return selectors.join(",\n  ");
}

/** Always-on until html.lrph-hover-armed. Descendants need none !important. */
export function hoverHoldCssText(): string {
  const hosts = cssIsList(HOVER_HOLD_HOST_SELECTORS);
  const stars = cssIsList(HOVER_HOLD_STAR_SELECTORS);
  const armed = HOVER_HOLD_ARMED_CLASS;
  return `html:not(.${armed}) :is(
  ${hosts}
),
html:not(.${armed}) :is(
  ${hosts}
) *,
html:not(.${armed}) :is(
  ${stars}
),
html:not(.${armed}) :is(
  ${stars}
) * {
  pointer-events: none !important;
}
`;
}

function onPointerMove(event: Event): void {
  try {
    if (!event.isTrusted) return;
    const ev = event as MouseEvent;
    const px = pointerMovePixels(ev);
    if (!(px > 0)) return;
    travel += px;
    if (travel < HOVER_HOLD_ARM_PX) return;
    armHoverHold();
  } catch {
    /* ignore */
  }
}

export function installHoverHold(): void {
  if (bound) return;
  bound = true;
  disarmHoverHold();
  window.addEventListener("mousemove", onPointerMove, true);
  window.addEventListener("pointermove", onPointerMove, true);
}

export function uninstallHoverHold(): void {
  if (!bound) return;
  bound = false;
  window.removeEventListener("mousemove", onPointerMove, true);
  window.removeEventListener("pointermove", onPointerMove, true);
  disarmHoverHold();
}
