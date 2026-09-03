/**
 * MAIN-world hold: Language Reactor's save/star listeners live in the page.
 * Isolated stopPropagation cannot reach them. Capture here at document_start
 * and drop cue/star pointer events until html.lrph-hover-armed.
 */
import {
  HOVER_HOLD_HOST_SELECTORS,
  HOVER_HOLD_STAR_SELECTORS,
  HOVER_HOLD_STYLE_ID,
  hoverHoldCssText,
  installHoverHold,
  isHoverHoldArmed,
} from "./hover-hold";
import { isLrSaveOrStarControl } from "./selectors";

const OUR_CHROME_SEL = ".lrph-glosses, .lrph-toolbar-btn, .lrph-switch, .lrph-layer";
const MEDIA_SEL = "iframe, video, .html5-video-player";

const POINTER_BLOCK_EVENTS = [
  "mouseover",
  "mouseenter",
  "mouseout",
  "mouseleave",
  "pointerover",
  "pointerenter",
  "pointerout",
  "pointerleave",
  "pointerdown",
  "mousedown",
  "mouseup",
  "click",
  "auxclick",
  "dblclick",
  "contextmenu",
] as const;

const PHRASE_SAVE_URL =
  /(?:save(?:d)?(?:[-_]?phrase|[-_]?subtitle|[-_]?expression|[-_]?cue|[-_]?sentence|[-_]?item|[-_]?line|[-_]?context)?|add(?:[-_]?saved)?(?:[-_]?phrase|[-_]?subtitle|[-_]?expression|[-_]?item)|toggle(?:[-_]?saved)?(?:[-_]?phrase|[-_]?star|[-_]?item|Saved)|star(?:[-_]?subtitle|[-_]?phrase|[-_]?cue)|(?:^|[/?&])(?:saved(?:[-_]?item|[-_]?phrase|[-_]?cue|Items)?|saveItem|saveContext|createSavedItem)(?:[/?&]|$)|(?:^|[/_])subs(?:[-_]?save|Save)[-_]?)/i;

const LR_HOST = /(?:languagereactor\.com|dioco\.io)/i;

let starHoldBound = false;
let phraseSaveUntil = 0;

function asElement(target: EventTarget | null | undefined): Element | null {
  if (!target) return null;
  const node = target as Node;
  if (node.nodeType === 1) return node as Element;
  return (node.parentElement as Element | null) || null;
}

function closestAny(el: Element | null | undefined, selectors: readonly string[]): Element | null {
  if (!el || !el.closest) return null;
  for (const sel of selectors) {
    try {
      const hit = el.closest(sel);
      if (hit) return hit;
    } catch {
      /* invalid */
    }
  }
  return null;
}

function bodyLooksLikePhraseSave(body: unknown): boolean {
  if (body == null) return false;
  let text = "";
  try {
    if (typeof body === "string") {
      text = body;
    } else if (typeof FormData !== "undefined" && body instanceof FormData) {
      return false;
    } else if (typeof body === "object") {
      text = JSON.stringify(body);
    } else {
      text = String(body);
    }
  } catch {
    return false;
  }
  const trimmed = text.trim();
  if (!trimmed || trimmed[0] !== "{" && trimmed[0] !== "[") return false;
  return (
    /"itemType"\s*:\s*"PHRASE"/i.test(trimmed) ||
    /"savedPhrase"/i.test(trimmed) ||
    /"save(?:d)?(?:Phrase|Subtitle|Cue|Sentence|Item)"/i.test(trimmed) ||
    /"learningStage"\s*:/i.test(trimmed) && /"subtitleTokens"/i.test(trimmed)
  );
}

export function isPhraseSaveUrl(url: unknown): boolean {
  const s = String(url || "");
  if (!s) return false;
  if (/gethoverdict|base_dict_/i.test(s)) return false;
  return PHRASE_SAVE_URL.test(s);
}

export function shouldBlockPhraseSaveRequest(url: unknown, body?: unknown): boolean {
  if (isPhraseSaveAllowed()) return false;
  if (isPhraseSaveUrl(url)) return true;
  const s = String(url || "");
  if (!s || !LR_HOST.test(s)) return false;
  return bodyLooksLikePhraseSave(body);
}

export function isPhraseSaveAllowed(): boolean {
  try {
    return Date.now() < phraseSaveUntil;
  } catch {
    return false;
  }
}

export function noteTrustedPhraseSaveGesture(): void {
  try {
    phraseSaveUntil = Date.now() + 800;
  } catch {
    phraseSaveUntil = 0;
  }
}

export function shouldBlockCuePointer(target: EventTarget | null | undefined, armed?: boolean): boolean {
  try {
    if (armed ?? isHoverHoldArmed()) return false;
    const el = asElement(target);
    if (!el) return false;
    if (el.closest?.(OUR_CHROME_SEL)) return false;
    const tag = String((el as HTMLElement).tagName || "");
    if (tag === "IFRAME" || tag === "VIDEO") return false;
    if (el.closest?.(MEDIA_SEL)) return false;
    if (isLrSaveOrStarControl(el)) return true;
    if (closestAny(el, HOVER_HOLD_STAR_SELECTORS)) return true;
    if (closestAny(el, HOVER_HOLD_HOST_SELECTORS)) return true;
    return false;
  } catch {
    return false;
  }
}

function onBlockedPointer(event: Event): void {
  try {
    if (shouldBlockCuePointer(event.target)) {
      event.stopImmediatePropagation();
      event.preventDefault();
      return;
    }
    if (event.type !== "click" || !event.isTrusted) return;
    if (!isHoverHoldArmed()) return;
    const el = asElement(event.target);
    if (el && (isLrSaveOrStarControl(el) || closestAny(el, HOVER_HOLD_STAR_SELECTORS))) {
      noteTrustedPhraseSaveGesture();
    }
  } catch {
    /* ignore */
  }
}

/** LR binds bare R to save the current subtitle (Kaydedilen Ifadeler). */
export function isBareSaveShortcutKey(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const key = String(event.key || "");
  return key === "r" || key === "R";
}

export function shouldBlockSaveShortcutKey(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "isTrusted">,
  armed?: boolean
): boolean {
  try {
    if (!event.isTrusted) return false;
    if (armed ?? isHoverHoldArmed()) return false;
    return isBareSaveShortcutKey(event);
  } catch {
    return false;
  }
}

function onSaveShortcutKeydown(event: Event): void {
  try {
    const ev = event as KeyboardEvent;
    if (!ev.isTrusted) return;
    if (!isBareSaveShortcutKey(ev)) return;
    if (!isHoverHoldArmed()) {
      ev.stopImmediatePropagation();
      ev.preventDefault();
      return;
    }
    noteTrustedPhraseSaveGesture();
  } catch {
    /* ignore */
  }
}

export function injectHoverHoldStyle(): void {
  try {
    const doc = typeof document !== "undefined" ? document : null;
    if (!doc || typeof doc.createElement !== "function") return;
    if (doc.getElementById?.(HOVER_HOLD_STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = HOVER_HOLD_STYLE_ID;
    style.textContent = hoverHoldCssText();
    const root = doc.documentElement;
    if (!root) return;
    if (root.firstChild) root.insertBefore(style, root.firstChild);
    else root.appendChild(style);
  } catch {
    /* ignore */
  }
}

function installSaveTransportGuards(): void {
  try {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    const origBeacon = nav?.sendBeacon?.bind(nav);
    if (origBeacon && nav) {
      nav.sendBeacon = function (url: string | URL, data?: BodyInit | null) {
        if (shouldBlockPhraseSaveRequest(url, data)) return false;
        return origBeacon(url, data);
      };
    }
  } catch {
    /* ignore */
  }
}

export function installStarHold(): void {
  if (starHoldBound) return;
  if (typeof document === "undefined" || typeof document.addEventListener !== "function") return;
  starHoldBound = true;
  injectHoverHoldStyle();
  installHoverHold();
  installSaveTransportGuards();
  for (const type of POINTER_BLOCK_EVENTS) {
    document.addEventListener(type, onBlockedPointer, true);
  }
  document.addEventListener("keydown", onSaveShortcutKeydown, true);
}
