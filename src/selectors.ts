/**
 * Language Reactor DOM allowlist on languagereactor.com (player and reader).
 * Not a public API. Keep fallbacks. Catalog grids are not learning surfaces.
 */
import type { CueToken } from "./types";
import { visibleSurface } from "./text";

export const SUBTITLE_ROOT_SELECTORS = [
  "#lln-subs",
  ".lln-subs",
  ".lln-sentence-wrap",
  "#lln-subs-content",
  ".lln-subs-wrap",
  "#lln-subs-container",
  "#lln-main-subs",
  ".sentence-wrap-main",
  ".sentence-wrap",
  ".sentence-row",
  ".svx-row",
  ".svx-sentence-wrap",
  ".sentence-view",
  ".video-subs-wrap-overvideo",
  "#lln-bottom-panel",
  ".lln-bottom-panel",
  ".bottom-panel",
];

export const TRANSLATION_SELECTORS = [
  "#lln-translations",
  ".lln-whole-title-translation",
  ".lln-whole-title-translation-wrap",
  ".translationText",
  ".main-translation-wrap",
  "#lln-vv-translations",
  ".svx-trans-horiz",
  ".svx-trans-vert",
];

/**
 * Playing <video> in this document, if any. On languagereactor.com the
 * picture is usually a cross-origin YouTube iframe, not a <video> here.
 */
export const MAIN_VIDEO_SELECTORS = [
  "video.html5-main-video",
  ".html5-video-player video.html5-main-video",
  ".html5-video-player video",
  ".media-wrap video",
  ".video-subs-wrap-overvideo video",
];

/**
 * languagereactor.com embeds the picture in a cross-origin iframe.
 * Position against that box; do not read into the frame.
 */
export const EMBED_PLAYER_SELECTORS = [
  'iframe[src*="youtube.com/embed"]',
  'iframe[src*="youtube-nocookie.com"]',
  'iframe[src*="youtube.com"]',
  'iframe[src*="youtu.be"]',
  "iframe#movie_player",
  'iframe[id*="player" i]',
  'iframe[title*="youtube" i]',
  'iframe[title*="video player" i]',
  ".media-wrap iframe",
  ".video-subs-wrap-overvideo iframe",
];

export const EMBED_WRAPPER_SELECTORS = [".video-subs-wrap-overvideo", ".media-wrap"];

export const WORD_SEL = ".lln-word";
export const LINE_TOKEN_SEL = ".lln-word, .lln-not-word";
export const HOVER_DICT_SEL = ".tt";

/** Transcript / dictionary / saved-items lists. Not the current dual-line. */
export const TRANSCRIPT_LIST_SELECTORS = [
  "#lln-subs-list",
  ".lln-subs-list",
  "#lln-vertical-view-subs",
  "#lln-vertical-view-words",
  "#lln-vertical-view-saved-items",
  ".lln-vertical-view",
  ".lln-vertical-view-sub",
  ".lln-vertical-view-wrap",
  ".lri-SubsView-wrap",
];

/** One Subtitles/METIN/sentence-view row, not the whole list. */
export const TRANSCRIPT_ROW_SELECTORS = [
  ".lln-sentence-wrap",
  ".lln-vertical-view-sub",
  ".sentence-wrap",
  ".sentence-row",
  ".sentence-view",
  ".svx-row",
];

/** One readable sentence in a book, text, podcast list, or sentence view. */
export const SENTENCE_UNIT_SELECTORS = [
  ".svx-row",
  ".sentence-wrap",
  ".sentence-row",
  ".lln-sentence-wrap",
];

/**
 * Current dual-line on a player (video, Netflix-on-LR, podcast, media file).
 * Side-list wraps share `.lln-sentence-wrap` / `.sentence-view` and must not
 * qualify unless they are the highlighted `.svx-row`.
 */
export const PLAYER_CUE_SELECTORS = [
  "#lln-subs",
  ".lln-subs",
  "#lln-main-subs",
  "#lln-subs-content",
  ".lln-subs-wrap",
  "#lln-subs-container",
  "#lln-bottom-panel",
  ".lln-bottom-panel",
  ".bottom-panel",
  ".video-subs-wrap-overvideo",
  ".sentence-wrap-main",
];

/** Open player or reader layout. Catalog grids use MediaList/DocsList instead. */
export const LEARNING_LAYOUT_SELECTORS = [
  ".lri-MediaPlayer_TEXT-wrap",
  ".lri-MediaPlayer_PODCAST-wrap",
  ".lri-MediaPlayer_DRILLS-wrap",
  ".lri-MediaPlayer_DRILLS-wrap2",
  ".lri-VideoView-wrap",
  ".lri-VideoView-wrap2",
  ".lri-VideoView-wrap3",
  ".lri-videofile-frame",
  ".video-subs-wrap",
  ".video-subs-wrap-overvideo",
];

/** Dual-line / sentence-view hosts. Presence means a current unit can exist. */
export const CURRENT_LINE_HOST_SELECTORS = [
  ".sentence-wrap-main",
  ".sentence-wrap",
  ".sentence-row",
  ".svx-row",
  ".svx-sentence-wrap",
  "#lln-subs",
  ".lln-subs",
  "#lln-main-subs",
  "#lln-subs-content",
  ".lln-subs-wrap",
  "#lln-subs-container",
  ".lri-MediaPlayer_TEXT-wrap",
  ".lri-SubsView-wrap",
];

/** Player cue plus per-line wraps used when grouping current-unit tokens. */
export const LIVE_CUE_SELECTORS = [
  ...PLAYER_CUE_SELECTORS,
  ".sentence-view",
  ".lln-sentence-wrap",
];

/**
 * Language Reactor MuiToolbar (`.main-toolbar` in MainToolbar).
 * Hardcoded className in their bundle, not a CSS-module hash.
 */
export const MAIN_TOOLBAR_SEL = ".main-toolbar";
export const SVX_ROW_SEL = ".svx-row";

export const LR_CORNER_CONTROL_SELECTORS = [
  "#lln-options-btn",
  "#lln-options-button",
  "#lln-option-btn",
  "#lln-menu-btn",
  "#lln-menu-button",
  "#lln-toggle-btn",
  "#lln-toggle",
  "#lln-over-video-btn",
  "#lln-over-video-menu",
  "#lln-player-btn",
  ".lln-options-btn",
  ".lln-option-btn",
  ".lln-menu-btn",
  ".lln-toggle-btn",
  ".lln-over-video-btn",
  ".lln-player-btn",
  ".lln-settings-btn",
  ".lln-hamburger",
  "button[id^='lln-options']",
  "button[id^='lln-menu']",
  "button[id^='lln-toggle']",
];

function closestMatching(el: Element | null | undefined, selectors: readonly string[]): Element | null {
  if (!el || !el.closest) return null;
  for (const sel of selectors) {
    const hit = el.closest(sel);
    if (hit) return hit;
  }
  return null;
}

export function isInTranslation(el: Element | null | undefined): boolean {
  return Boolean(closestMatching(el, TRANSLATION_SELECTORS));
}

export function isInTranscriptList(el: Element | null | undefined): boolean {
  return Boolean(closestMatching(el, TRANSCRIPT_LIST_SELECTORS));
}

function closestSvxRow(el: Element | null | undefined): Element | null {
  if (!el || !el.closest) return null;
  try {
    return el.closest(SVX_ROW_SEL);
  } catch {
    return null;
  }
}

function closestSentenceWrapMain(el: Element | null | undefined): Element | null {
  if (!el || !el.closest) return null;
  try {
    return el.closest(".sentence-wrap-main");
  } catch {
    return null;
  }
}

function closestSentenceUnit(el: Element | null | undefined): Element | null {
  return closestMatching(el, SENTENCE_UNIT_SELECTORS);
}

/** Last sentence the user pointed at in a reader (books, texts, sentence lists). */
let pointerSentence: Element | null = null;

export function clearPointerCue(): void {
  pointerSentence = null;
}

/**
 * Remember the sentence under the pointer so books/texts have a current unit
 * even when Language Reactor does not set `.svx-row.active` (no timed playback).
 */
export function rememberPointerCue(from: Element | null | undefined): Element | null {
  if (!from) return pointerSentence && pointerSentence.isConnected ? pointerSentence : null;
  const unit = closestSentenceUnit(from) || overlayHostFor(from);
  if (unit && !isSavedItemsNode(unit)) pointerSentence = unit;
  return pointerSentence && pointerSentence.isConnected ? pointerSentence : null;
}

function unitHasWords(el: Element | null | undefined): boolean {
  if (!el || !el.querySelector) return false;
  try {
    return Boolean(el.querySelector(WORD_SEL));
  } catch {
    return false;
  }
}

function isSideListHost(el: Element | null | undefined): boolean {
  return Boolean(closestMatching(el, TRANSCRIPT_LIST_SELECTORS));
}

const DOCK_TOP_HINT = 48;

function cueBoxVisible(el: Element): boolean {
  try {
    if (typeof el.getBoundingClientRect !== "function") return true;
    const r = el.getBoundingClientRect();
    if (!(r.width >= 8) || !(r.height >= 8)) return false;
    return rectIntersectsViewport(r);
  } catch {
    return true;
  }
}

/**
 * Dual-line on a timed player, not the Subtitles/METIN/book sentence list.
 */
export function findPlayerDualLineRoots(): Element[] {
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc || typeof doc.querySelectorAll !== "function") return [];
  const out: Element[] = [];
  const seen = new Set<Element>();
  for (const sel of PLAYER_CUE_SELECTORS) {
    let nodes: NodeListOf<Element> | Element[];
    try {
      nodes = doc.querySelectorAll(sel);
    } catch {
      continue;
    }
    for (const el of nodes) {
      if (seen.has(el)) continue;
      if (isSideListHost(el)) continue;
      if (!unitHasWords(el)) continue;
      if (!cueBoxVisible(el)) continue;
      seen.add(el);
      out.push(el);
    }
  }
  return out;
}

export function findPlayerDualLineRoot(): Element | null {
  return findPlayerDualLineRoots()[0] || null;
}

function pickVisibleSentenceUnit(): Element | null {
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc || typeof doc.querySelectorAll !== "function") return null;
  const units: Element[] = [];
  const seen = new Set<Element>();
  for (const sel of SENTENCE_UNIT_SELECTORS) {
    let nodes: NodeListOf<Element> | Element[];
    try {
      nodes = doc.querySelectorAll(sel);
    } catch {
      continue;
    }
    for (const el of nodes) {
      if (seen.has(el)) continue;
      if (!unitHasWords(el)) continue;
      seen.add(el);
      units.push(el);
    }
  }
  units.sort((a, b) => {
    try {
      return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
    } catch {
      return 0;
    }
  });
  const header = Math.max(64, DOCK_TOP_HINT);
  let vh = 800;
  try {
    vh = (typeof window !== "undefined" && window.innerHeight) || doc.documentElement?.clientHeight || 800;
  } catch {
    /* ignore */
  }
  for (const el of units) {
    try {
      const r = el.getBoundingClientRect();
      if (r.bottom > header && r.top < vh - 24) return el;
    } catch {
      return el;
    }
  }
  return units[0] || null;
}

/**
 * Current sentence on a reader (books, my texts, untimed lists).
 * Null when a player dual-line already exists so the METIN list is not harvested.
 */
export function findReaderSentenceRoot(): Element | null {
  if (findPlayerDualLineRoot()) return null;
  if (pointerSentence && pointerSentence.isConnected && unitHasWords(pointerSentence)) {
    return pointerSentence;
  }
  const doc = typeof document !== "undefined" ? document : null;
  if (doc && typeof doc.querySelector === "function") {
    try {
      const active = doc.querySelector(".svx-row.active");
      if (active && unitHasWords(active)) return active;
    } catch {
      /* ignore */
    }
  }
  return pickVisibleSentenceUnit();
}

/** Player dual-line, highlighted sentence-view row, and/or reader sentence. */
export function currentCueRoots(): Element[] {
  const roots = new Set<Element>();
  for (const player of findPlayerDualLineRoots()) roots.add(player);
  const doc = typeof document !== "undefined" ? document : null;
  if (doc && typeof doc.querySelector === "function") {
    try {
      const active = doc.querySelector(".svx-row.active");
      if (active && unitHasWords(active)) roots.add(active);
    } catch {
      /* ignore */
    }
  }
  const reader = findReaderSentenceRoot();
  if (reader) roots.add(reader);
  return [...roots];
}

function isSavedItemsNode(el: Element | null | undefined): boolean {
  if (!el || !el.closest) return false;
  try {
    return Boolean(el.closest("#lln-vertical-view-saved-items"));
  } catch {
    return false;
  }
}

const LR_SAVE_HINT =
  /\b(?:save|saved|star|bookmark|favorite|favourite|unsave|remove\s+from\s+saved|kaydet|kayded|yildiz|yıldız|ifade|kaldir|kaldır)\b/i;

const LR_SAVE_CLASS_SEL =
  ".lln-save, .lln-save-btn, .lln-save-cue, [class*='save-cue'], [class*='SaveCue'], [class*='saveCue'], [class*='SavedCue'], [class*='saved-cue']";

const LR_STAR_ICON_SEL =
  "svg[data-testid*='Star' i], svg[data-testid*='Bookmark' i], [data-testid='StarIcon'], [data-testid='StarBorderIcon'], [data-testid='StarRateIcon']";

/** Language Reactor save/star controls on cue or translation rows. Never pointer-track these. */
export function isLrSaveOrStarControl(el: Element | null | undefined): boolean {
  if (!el || !el.closest) return false;
  try {
    if (isSavedItemsNode(el)) return true;
    if (el.closest(".lrph-glosses, .lrph-toolbar-btn, .lrph-switch")) return false;
    if (el.closest(LR_SAVE_CLASS_SEL)) return true;
    if (el.closest(LR_STAR_ICON_SEL)) return true;
    const btn = el.closest(
      "button, [role='button'], a.MuiIconButton-root, .MuiIconButton-root"
    ) as Element | null;
    if (!btn) return false;
    const label = `${btn.getAttribute("aria-label") || ""} ${btn.getAttribute("title") || ""}`.trim();
    if (label && LR_SAVE_HINT.test(label)) return true;
    if (btn.querySelector?.(LR_STAR_ICON_SEL)) return true;
    const iconLabel = btn.querySelector?.("[aria-label], [title]") as Element | null;
    if (iconLabel) {
      const nested = `${iconLabel.getAttribute("aria-label") || ""} ${iconLabel.getAttribute("title") || ""}`.trim();
      if (nested && LR_SAVE_HINT.test(nested)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Current sentence / dual-line only: player cue, highlighted `.svx-row`,
 * or the reader sentence under the pointer / in view. Not the whole book.
 */
export function isCurrentUnitRoot(el: Element | null | undefined): boolean {
  if (!el) return false;
  if (isSavedItemsNode(el)) return false;
  const svx = closestSvxRow(el);
  if (svx) {
    if (svx.classList.contains("active")) return true;
    const roots = currentCueRoots();
    return roots.some((root) => root === svx || root.contains(el) || svx.contains(root));
  }
  if (closestMatching(el, PLAYER_CUE_SELECTORS) && !isInTranscriptList(el)) return true;
  if (isInTranscriptList(el) && findPlayerDualLineRoot()) return false;
  const unit = closestSentenceUnit(el);
  if (!unit) return false;
  const roots = currentCueRoots();
  if (!roots.length) return false;
  return roots.some((root) => root === unit || root === el || root.contains(el) || unit.contains(root));
}

/** Same as isCurrentUnitRoot. Kept for callers that still say "player cue". */
export function isPlayerCueRoot(el: Element | null | undefined): boolean {
  return isCurrentUnitRoot(el);
}

/**
 * Token host for a word: current dual-line, active sentence row, or one
 * transcript row. Never the whole Subtitles/METIN list or book page.
 */
export function overlayHostFor(el: Element | null | undefined): Element | null {
  if (!el) return null;
  const svx = closestSvxRow(el);
  if (svx) return svx;
  const main = closestSentenceWrapMain(el);
  if (main) return main;
  const unit = closestSentenceUnit(el);
  if (unit) return unit;
  if (isInTranscriptList(el)) {
    return closestMatching(el, TRANSCRIPT_ROW_SELECTORS) || subtitleRootFor(el);
  }
  return subtitleRootFor(el);
}

export function subtitleRootFor(el: Element | null | undefined): Element | null {
  return closestMatching(el, SUBTITLE_ROOT_SELECTORS);
}

export function isInSubtitleRoot(el: Element | null | undefined): boolean {
  return Boolean(subtitleRootFor(el));
}

export function hoverDictEl(word: Element | null | undefined): Element | null {
  if (!word || !word.querySelector) return null;
  return word.querySelector(HOVER_DICT_SEL);
}

/** Word/punct token on a cue or transcript row. Not translation, dict, or helper chrome. */
export function isLineToken(el: Element | null | undefined): boolean {
  if (!el || el.nodeType !== 1) return false;
  if ((el as HTMLElement).isConnected === false) return false;
  if (el.classList.contains("lrph-layer") || el.classList.contains("lrph-band")) return false;
  if (el.classList.contains("lrph-glosses") || el.classList.contains("lrph-switch") || el.classList.contains("lrph-toolbar-btn")) {
    return false;
  }
  if (el.closest(".tt, .lrph-layer, .lrph-glosses, .lrph-switch, .lrph-toolbar-btn")) return false;
  if (isInTranslation(el)) return false;
  if (el.closest(".lln-full-dict, #lln-full-dict")) return false;
  return true;
}

/** Current-unit token. Side-list and inactive sentence rows are not used for cards. */
export function isCueToken(el: Element | null | undefined): boolean {
  return isLineToken(el) && isCurrentUnitRoot(el);
}

function videoArea(el: Element): number {
  if (typeof el.getBoundingClientRect !== "function") return 0;
  const r = el.getBoundingClientRect();
  const w = r.width || (el as HTMLElement).clientWidth || 0;
  const h = r.height || (el as HTMLElement).clientHeight || 0;
  return w * h;
}

/** True when a client rect overlaps the window (or visual viewport if present). */
export function rectIntersectsViewport(r: {
  top: number;
  right: number;
  width: number;
  height: number;
  left?: number;
  bottom?: number;
}): boolean {
  const width = r.width;
  const height = r.height;
  if (!(width >= 8) || !(height >= 8)) return false;
  const left = r.left ?? r.right - width;
  const bottom = r.bottom ?? r.top + height;
  let vw = 0;
  let vh = 0;
  try {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    vw = (vv && vv.width) || (typeof window !== "undefined" ? window.innerWidth : 0) || 0;
    vh = (vv && vv.height) || (typeof window !== "undefined" ? window.innerHeight : 0) || 0;
    if (!vw && typeof document !== "undefined") vw = document.documentElement?.clientWidth || 0;
    if (!vh && typeof document !== "undefined") vh = document.documentElement?.clientHeight || 0;
  } catch {
    return true;
  }
  if (vw <= 0 || vh <= 0) return true;
  return bottom > 0 && r.top < vh && r.right > 0 && left < vw;
}

function isVisibleBox(el: Element, minArea = 80 * 80): boolean {
  if (!el || (el as HTMLElement).isConnected === false) return false;
  if (el.classList?.contains("lrph-glosses") || el.classList?.contains("lrph-toolbar-btn")) return false;
  const area = videoArea(el);
  if (area < minArea) return false;
  try {
    const s = typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
    if (s && (s.display === "none" || s.visibility === "hidden" || s.opacity === "0")) return false;
  } catch {
    /* ignore */
  }
  try {
    if (typeof el.getBoundingClientRect === "function" && !rectIntersectsViewport(el.getBoundingClientRect())) {
      return false;
    }
  } catch {
    /* ignore */
  }
  return true;
}

function isVisibleVideo(el: Element): boolean {
  if (!el || (el as HTMLElement).tagName !== "VIDEO") return false;
  return isVisibleBox(el, 80 * 80);
}

function iframeSrc(el: Element): string {
  const node = el as HTMLIFrameElement;
  return String(node.src || el.getAttribute?.("src") || "").toLowerCase();
}

function iframeTitle(el: Element): string {
  return String(el.getAttribute?.("title") || "").toLowerCase();
}

export function isPlayerIframe(el: Element | null | undefined): boolean {
  if (!el || (el as HTMLElement).tagName !== "IFRAME") return false;
  const src = iframeSrc(el);
  const title = iframeTitle(el);
  const id = String(el.id || el.getAttribute?.("id") || "").toLowerCase();
  if (/youtube|youtu\.be|youtube-nocookie|netflix|player|embed/.test(src)) return true;
  if (/youtube|netflix|video player/.test(title)) return true;
  if (/player|youtube|netflix/.test(id)) return true;
  try {
    if (el.closest?.(".media-wrap, .video-subs-wrap-overvideo")) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Largest on-screen embed/player box (iframe or LR wrapper). Skips tiny nodes.
 */
export function pickPlayerSurface(els: ArrayLike<Element>): Element | null {
  const list = Array.from(els).filter((el) => isVisibleBox(el, 160 * 90));
  if (!list.length) return null;
  list.sort((a, b) => {
    const aI = isPlayerIframe(a) ? 1 : 0;
    const bI = isPlayerIframe(b) ? 1 : 0;
    if (bI !== aI) return bI - aI;
    return videoArea(b) - videoArea(a);
  });
  return list[0] || null;
}

function queryAll(doc: Document, selectors: readonly string[]): Element[] {
  const out: Element[] = [];
  for (const sel of selectors) {
    try {
      out.push(...Array.from(doc.querySelectorAll(sel)));
    } catch {
      /* invalid */
    }
  }
  return out;
}

/**
 * Picture to pin the gloss card to. Prefer a real <video> in this document.
 * Dual subs live in the languagereactor.com parent; the picture is often a
 * cross-origin YouTube iframe, so fall back to that visible box.
 */
export function findGlossSurface(): Element | null {
  const video = findPlayingVideo();
  if (video) return video;
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc || typeof doc.querySelectorAll !== "function") return null;
  const named = pickPlayerSurface(queryAll(doc, EMBED_PLAYER_SELECTORS));
  if (named) return named;
  const frames = [...doc.querySelectorAll("iframe")].filter(isPlayerIframe);
  const iframe = pickPlayerSurface(frames);
  if (iframe) return iframe;
  const wrap = pickPlayerSurface(queryAll(doc, EMBED_WRAPPER_SELECTORS));
  if (wrap) return wrap;
  return pickPlayerSurface([...doc.querySelectorAll("iframe")]);
}

export interface CornerRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function asCornerRect(r: {
  top: number;
  right: number;
  width: number;
  height: number;
  left?: number;
  bottom?: number;
}): CornerRect {
  const left = r.left ?? r.right - r.width;
  const bottom = r.bottom ?? r.top + r.height;
  return { top: r.top, left, right: r.right, bottom, width: r.width, height: r.height };
}

/** True if a control-sized box sits in the video picture's top-right band. */
export function isTopRightPlayerControl(video: CornerRect, el: CornerRect): boolean {
  if (!video || !el) return false;
  if (el.width < 22 || el.width > 80 || el.height < 22 || el.height > 80) return false;
  const ratio = el.width / Math.max(1, el.height);
  if (ratio < 0.65 || ratio > 1.55) return false;
  const topBand = video.top + Math.max(80, video.height * 0.24);
  const rightBand = video.right - Math.max(80, video.width * 0.24);
  const cx = (el.left + el.right) / 2;
  const cy = (el.top + el.bottom) / 2;
  if (cy < video.top - 12 || cy > topBand) return false;
  if (cx > video.right + 12 || cx < rightBand) return false;
  return true;
}

export function pickTopRightControl<T extends CornerRect>(video: CornerRect, rects: T[]): T | null {
  const ok = rects.filter((r) => isTopRightPlayerControl(video, r));
  if (!ok.length) return null;
  ok.sort((a, b) => {
    const da = (video.right - a.right) ** 2 + (a.top - video.top) ** 2;
    const db = (video.right - b.right) ** 2 + (b.top - video.top) ** 2;
    return da - db;
  });
  return ok[0] || null;
}

function isShownControl(el: Element): boolean {
  if (!el || (el as HTMLElement).isConnected === false) return false;
  if (el.closest?.(".lrph-glosses, .lrph-switch, .lrph-layer, .lrph-toolbar-btn")) return false;
  if (isInTranscriptList(el) || isInTranslation(el)) return false;
  if (el.closest?.("#lln-subs, #lln-main-subs, #lln-bottom-panel, .lln-bottom-panel, .lln-sentence-wrap, .tt, .lln-full-dict, #lln-full-dict")) {
    return false;
  }
  try {
    const s = typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
    if (s && (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0)) return false;
  } catch {
    /* ignore */
  }
  return true;
}

function controlHit(el: Element): Element {
  if ((el as HTMLElement).tagName === "BUTTON" || el.getAttribute?.("role") === "button") return el;
  const inner = el.querySelector?.("button, [role='button']");
  return inner || el;
}

/**
 * Visible Language Reactor (or similar) control in the top-right of the
 * playing picture. Null when that overlay button is absent.
 */
export function findLrCornerControl(surface: Element | null | undefined): Element | null {
  const doc = typeof document !== "undefined" ? document : null;
  if (!surface || !doc || typeof doc.querySelectorAll !== "function") return null;
  if (typeof surface.getBoundingClientRect !== "function") return null;
  const video = asCornerRect(surface.getBoundingClientRect());
  const seen = new Set<Element>();
  const rects: Array<CornerRect & { el: Element }> = [];

  const consider = (raw: Element | null | undefined): void => {
    if (!raw) return;
    const el = controlHit(raw);
    if (seen.has(el) || !isShownControl(el)) return;
    seen.add(el);
    if (typeof el.getBoundingClientRect !== "function") return;
    const r = asCornerRect(el.getBoundingClientRect());
    if (!isTopRightPlayerControl(video, r)) return;
    rects.push({ ...r, el });
  };

  for (const el of queryAll(doc, LR_CORNER_CONTROL_SELECTORS)) consider(el);
  try {
    for (const el of doc.querySelectorAll(
      "button[id^='lln-'], button[class*='lln-'], [id^='lln-'][role='button'], [class*='lln-'][role='button']"
    )) {
      consider(el);
    }
  } catch {
    /* ignore */
  }

  const picked = pickTopRightControl(video, rects);
  return picked?.el || null;
}

function toolbarControlLabel(el: Element): string {
  try {
    return `${el.getAttribute?.("aria-label") || ""} ${el.getAttribute?.("title") || ""}`;
  } catch {
    return "";
  }
}

function toolbarChildLooksLikePlayer(el: Element): boolean {
  if (/pause|playback|speed/i.test(toolbarControlLabel(el))) return true;
  try {
    const kids = el.children;
    if (!kids || !kids.length) return false;
    for (let i = 0; i < kids.length; i++) {
      const child = kids[i];
      if (child && toolbarChildLooksLikePlayer(child as Element)) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function toolbarLooksLikePlayerChrome(el: Element): boolean {
  if (toolbarChildLooksLikePlayer(el)) return true;
  try {
    const raw = String(el.textContent || "");
    if (/(?:^|\s)(?:0\.\d+x|1x|1\.\d+x|2x)(?:\s|$)/i.test(raw)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Language Reactor toolbar (AP / speed / reader cluster).
 * Null when `.main-toolbar` is not in the document.
 */
export function findMainToolbar(): HTMLElement | null {
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc || typeof doc.querySelectorAll !== "function") return null;
  const nodes = [...doc.querySelectorAll(MAIN_TOOLBAR_SEL)] as HTMLElement[];
  const shown = nodes.filter((el) => {
    if (!el || el.isConnected === false) return false;
    if (el.closest?.(".lrph-glosses")) return false;
    try {
      const s = typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
      if (s && (s.display === "none" || s.visibility === "hidden")) return false;
    } catch {
      /* ignore */
    }
    return true;
  });
  if (!shown.length) return null;
  return shown.find(toolbarLooksLikePlayerChrome) || shown[shown.length - 1];
}

function watchPageLocation(href?: string): { path: string; search: string } {
  try {
    const raw = href || (typeof location !== "undefined" ? location.href : "");
    const u = new URL(String(raw || ""), "https://languagereactor.com");
    return { path: String(u.pathname || "/"), search: String(u.search || "") };
  } catch {
    return { path: "/", search: "" };
  }
}

/** Saved-items, settings, dictionary, home, and other non-learning routes. */
export function isNonWatchRoute(href?: string): boolean {
  const path = watchPageLocation(href).path.replace(/\/+$/, "") || "/";
  if (path === "/") return true;
  if (/^\/saved(?:-items)?$/i.test(path)) return true;
  if (/^\/(?:library|vocabulary|words|dictionary|dict|home|settings|help|chatbot|account)(?:\/|$)/i.test(path)) return true;
  if (/^\/[a-z]{2}(?:-[A-Za-z]{2})?$/i.test(path)) return true;
  return false;
}

/** Watch URLs: /c/lang/lang/id, /video, or ?v=. SPA path can lag behind the DOM. */
export function isWatchRoute(href?: string): boolean {
  if (isNonWatchRoute(href)) return false;
  const { path, search } = watchPageLocation(href);
  if (/^\/c\/[^/]+\/[^/]+\/[^/]+/i.test(path)) return true;
  if (/\/video(?:\/|$)/i.test(path)) return true;
  try {
    if (new URLSearchParams(search).get("v")) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function toolbarIsShown(el: Element): boolean {
  if (!el || (el as HTMLElement).isConnected === false) return false;
  if (el.closest?.(".lrph-glosses")) return false;
  try {
    const s = typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
    if (s && (s.display === "none" || s.visibility === "hidden")) return false;
  } catch {
    /* ignore */
  }
  return true;
}

function hasPlayerToolbar(): boolean {
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc || typeof doc.querySelectorAll !== "function") return false;
  for (const el of doc.querySelectorAll(MAIN_TOOLBAR_SEL)) {
    if (!toolbarIsShown(el)) continue;
    if (toolbarLooksLikePlayerChrome(el)) return true;
  }
  return false;
}

function hasSavedItemsView(): boolean {
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc) return false;
  try {
    if (typeof doc.getElementById === "function" && doc.getElementById("lln-vertical-view-saved-items")) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function hasWatchPlayerBox(): boolean {
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc || typeof doc.querySelector !== "function") return false;
  try {
    if (doc.querySelector(".video-subs-wrap-overvideo")) return true;
  } catch {
    /* ignore */
  }
  try {
    const wrap = doc.querySelector(".media-wrap");
    if (wrap && wrap.querySelector?.("iframe, video")) return true;
  } catch {
    /* ignore */
  }
  try {
    if (findGlossSurface()) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function hasAnySelector(selectors: readonly string[]): boolean {
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc || typeof doc.querySelector !== "function") return false;
  for (const sel of selectors) {
    try {
      if (doc.querySelector(sel)) return true;
    } catch {
      /* invalid */
    }
  }
  return false;
}

function hasLearningLayout(): boolean {
  return hasAnySelector(LEARNING_LAYOUT_SELECTORS);
}

function hasCurrentLineHost(): boolean {
  return hasAnySelector(CURRENT_LINE_HOST_SELECTORS);
}

/**
 * Dual-language player or reader with a current line (or player chrome that
 * will host one). True for video without waiting for `#lln-subs`. True for
 * books/texts/podcasts when a sentence-view or player/reader wrap is on
 * screen. False on catalog grids, saved-items, and settings.
 */
export function isLearningSurface(): boolean {
  try {
    if (isNonWatchRoute()) return false;
    if (hasCurrentLineHost()) return true;
    if (hasPlayerToolbar()) return true;
    if (hasLearningLayout()) return true;
    if (hasWatchPlayerBox()) return true;
    if (hasSavedItemsView()) return false;
    return false;
  } catch {
    return false;
  }
}

/** Same as isLearningSurface. Kept so older callers keep working. */
export function isWatchPlayerSurface(): boolean {
  return isLearningSurface();
}

/**
 * Prefer a named main video if present, else the largest on-screen video.
 * Paused is fine: the current cue should stay pinned. Skips tiny previews.
 * Playing is only a tie-breaker among equal sizes.
 */
export function pickPlayingVideo(videos: ArrayLike<Element>): HTMLVideoElement | null {
  const list = Array.from(videos).filter(isVisibleVideo) as HTMLVideoElement[];
  if (!list.length) return null;
  const main = list.filter((v) => {
    try {
      return v.classList?.contains("html5-main-video") || (typeof v.matches === "function" && v.matches("video.html5-main-video"));
    } catch {
      return false;
    }
  });
  const pool = main.length ? main : list;
  pool.sort((a, b) => {
    const area = videoArea(b) - videoArea(a);
    if (area) return area;
    const aPlay = a.paused === false && a.ended !== true ? 1 : 0;
    const bPlay = b.paused === false && b.ended !== true ? 1 : 0;
    return bPlay - aPlay;
  });
  return pool[0] || null;
}

export function findPlayingVideo(): HTMLVideoElement | null {
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc || typeof doc.querySelectorAll !== "function") return null;
  const named: Element[] = [];
  for (const sel of MAIN_VIDEO_SELECTORS) {
    try {
      named.push(...doc.querySelectorAll(sel));
    } catch {
      /* invalid */
    }
  }
  const picked = pickPlayingVideo(named);
  if (picked) return picked;
  return pickPlayingVideo(doc.querySelectorAll("video"));
}

function toToken(el: Element): CueToken {
  return {
    el,
    surface: visibleSurface(el),
    isNotWord: el.classList.contains("lln-not-word") && !el.classList.contains("lln-word"),
  };
}

/**
 * Word / punct tokens in a subtitle root (DOM order). Helper chrome skipped.
 */
export function tokensInRoot(root: Element | null | undefined): CueToken[] {
  if (!root || !root.querySelectorAll) return [];
  return [...root.querySelectorAll(LINE_TOKEN_SEL)]
    .filter((el) => {
      if (!isLineToken(el)) return false;
      try {
        if (el.querySelector(WORD_SEL)) return false;
      } catch {
        /* keep */
      }
      return true;
    })
    .map(toToken);
}

/**
 * Line identity for this cue root: token surfaces in DOM order.
 * Node ids are not part of this. Language Reactor often recycles .lln-word
 * nodes on the same line, and that must not look like a cue change.
 */
export function liveCueFingerprint(root: Element | null | undefined): string {
  if (!root) return "";
  try {
    return tokensInRoot(root)
      .map((t) => t.surface)
      .join("|");
  } catch {
    return "";
  }
}

/**
 * Word / punct tokens on the same visual line as the hovered node.
 * Mini-dict descendants and translation-line tokens are excluded.
 */
export function lineTokens(hoveredEl: Element | null | undefined): CueToken[] {
  const root = subtitleRootFor(hoveredEl);
  if (!root) return [];

  const all = tokensInRoot(root);
  if (!hoveredEl || !hoveredEl.getBoundingClientRect) return all;

  const hoveredTop = hoveredEl.getBoundingClientRect().top;
  const sameLine = all.filter((it) => Math.abs(it.el.getBoundingClientRect().top - hoveredTop) <= 8);
  return sameLine.length ? sameLine : all;
}

export function subtitleRootsWithWords(): Element[] {
  const roots = new Set<Element>();
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc || typeof doc.querySelectorAll !== "function") return [];

  const addRoot = (el: Element | null | undefined) => {
    if (!el) return;
    roots.add(el);
  };

  for (const cue of currentCueRoots()) addRoot(cue);

  if (!roots.size) {
    const scopes: Element[] = [];
    const seenScope = new Set<Element>();
    const addScope = (el: Element) => {
      if (!el || seenScope.has(el)) return;
      seenScope.add(el);
      scopes.push(el);
    };

    for (const el of queryAll(doc, LIVE_CUE_SELECTORS)) {
      if (isInTranscriptList(el) && !findPlayerDualLineRoot()) addScope(el);
      else if (!isInTranscriptList(el)) addScope(el);
    }
    for (const el of queryAll(doc, [SVX_ROW_SEL])) {
      if (el.classList?.contains("active")) addScope(el);
    }
    for (const scope of scopes) {
      let words: NodeListOf<Element> | Element[];
      try {
        words = scope.querySelectorAll(WORD_SEL);
      } catch {
        continue;
      }
      for (const word of words) {
        if (!isLineToken(word)) continue;
        const root = overlayHostFor(word);
        if (root && isCurrentUnitRoot(root)) roots.add(root);
      }
    }
  }

  const out: Element[] = [];
  for (const root of roots) {
    if (!unitHasWords(root)) continue;
    out.push(root);
  }
  return out;
}
