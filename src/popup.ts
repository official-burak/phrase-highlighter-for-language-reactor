/**
 * Read Language Reactor's hover mini-dictionary (LR 5.1.8).
 *
 * On dual subtitles, each .lln-word.lln-hover-tooltip carries a child
 *   <span class="tt lln-tt-hidden">...</span>
 * Mouseenter loads /base_dict_getHoverDict_8 for the word. Multi-word `src`
 * headers come from a prefetch of /base_dict_getHoverDictEntriesForSubs.
 * Filling .tt removes lln-tt-hidden; the popup is still CSS-hidden until :hover.
 *
 * When a multi-word phrase exists, entries.length > 1 and each entry's `src` is
 * rendered as an inline-block header (color:#ff89; background:#ffffff18; width:100%).
 * Single-word-only popups omit those headers and must not be treated as a phrase.
 * Apostrophe contractions (`we're`) are one tokenize() token but LR still emits
 * a gold `src` header and splits the cue across two .lln-word nodes.
 *
 * Language Reactor may portal the MiniDict (`.tt` is not a child of `.lln-word`).
 * Query `document` for filled tooltips, not only descendants of the hovered word.
 */
import { log } from "./debug";
import { HOVER_DICT_SEL, hoverDictEl } from "./selectors";
import {
  collapseWs,
  contractionCueTokens,
  contractionStem,
  isContractionKey,
  isGlueToken,
  looksCjk,
  normalize,
  rawText,
  tokenEq,
  tokenize,
} from "./text";
import type { PhraseFromTooltip, PhrasePopupHit } from "./types";

const FULL_DICT_SEL = ".lln-full-dict, #lln-full-dict";

export function tooltipHasDict(tt: Element | null | undefined): boolean {
  if (!tt || !tt.isConnected) return false;
  const text = collapseWs(tt.textContent);
  return Boolean(text && text !== "...");
}

function compactPhrase(s: string): string {
  return normalize(s).replace(/\s+/g, "");
}

/** Do not walk every subtitle `.tt` (often one per word in the transcript). */
const DOCUMENT_TT_CAP = 24;

/**
 * Filled MiniDict nodes. With `word`, only that word's `.tt` (cheap).
 * Without `word`, a short document scan of visible/filled popups, not every
 * hidden per-word tooltip. Language Reactor may portal the open MiniDict.
 */
export function visibleFilledTooltips(word?: Element | null): Element[] {
  const seen = new Set<Element>();
  const out: Element[] = [];
  const add = (tt: Element | null | undefined, skipHidden: boolean) => {
    if (!tt || seen.has(tt)) return;
    try {
      if (skipHidden && tt.classList?.contains("lln-tt-hidden")) return;
    } catch {
      /* ignore */
    }
    if (!tooltipHasDict(tt)) return;
    seen.add(tt);
    out.push(tt);
  };
  if (word) {
    add(hoverDictEl(word), false);
    if (typeof word.querySelectorAll === "function") {
      try {
        for (const tt of word.querySelectorAll(HOVER_DICT_SEL)) add(tt, false);
      } catch {
        /* ignore */
      }
    }
    return out;
  }
  const doc = typeof document !== "undefined" ? document : null;
  if (doc && typeof doc.querySelectorAll === "function") {
    try {
      for (const tt of doc.querySelectorAll(HOVER_DICT_SEL)) {
        add(tt, true);
        if (out.length >= DOCUMENT_TT_CAP) break;
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}

export function isTtReady(tt: Element | null | undefined): boolean {
  if (!tt || !tooltipHasDict(tt)) return false;
  if (tt.classList.contains("lln-tt-hidden")) return false;
  const s = getComputedStyle(tt);
  if (s.display === "none") return false;
  return true;
}

/**
 * Src headers from LR's hover MiniDict template.
 * Translations use white-space:nowrap and no width:100% header chrome.
 */
export function isDictSrcHeader(el: Element | null | undefined): boolean {
  if (!el || el.nodeType !== 1) return false;
  if (el.tagName !== "SPAN") return false;
  const style = (el.getAttribute("style") || "").replace(/\s+/g, "").toLowerCase();
  if (style.includes("color:#ff89")) return true;
  if (style.includes("background:#ffffff18")) return true;
  if (style.includes("width:100%") && style.includes("display:inline-block")) return true;
  const cs = getComputedStyle(el);
  if (cs.display !== "inline-block") return false;
  const parent = el.parentElement;
  if (!parent) return false;
  const pr = parent.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (pr.width < 24) return false;
  return r.width >= pr.width * 0.82 && r.height >= 10;
}

function srcHeaderTexts(tt: Element): string[] {
  const texts: string[] = [];
  for (const el of tt.querySelectorAll("span")) {
    if (isDictTranslitChrome(el) || !isDictSrcHeader(el)) continue;
    const text = rawText(el);
    if (!text || text === "...") continue;
    if (!texts.includes(text)) texts.push(text);
  }
  return texts;
}

function spanDisplay(el: Element): string {
  return collapseWs(el.textContent);
}

/**
 * Transliteration chrome in the mini-dict (color #ff8a, full-width bar).
 * Not a translation sense.
 */
export function isDictTranslitChrome(el: Element | null | undefined): boolean {
  if (!el || el.nodeType !== 1) return false;
  const style = (el.getAttribute("style") || "").replace(/\s+/g, "").toLowerCase();
  if (style.includes("color:#ff8a")) return true;
  return false;
}

function isDictChromeWrap(el: Element): boolean {
  if (typeof el.closest !== "function") return false;
  return Boolean(el.closest(".lln-hover-stage-picker-wrap, button, .lln-full-dict, #lln-full-dict"));
}

/**
 * Translation sense line in `.tt` (`white-space:nowrap`, fading opacity).
 * Src headers and translit bars are excluded.
 */
export function isDictSenseLine(el: Element | null | undefined): boolean {
  if (!el || el.nodeType !== 1) return false;
  if (el.tagName !== "SPAN") return false;
  if (isDictChromeWrap(el)) return false;
  if (isDictTranslitChrome(el) || isDictSrcHeader(el)) return false;
  const style = (el.getAttribute("style") || "").replace(/\s+/g, "").toLowerCase();
  if (style.includes("white-space:nowrap")) return true;
  return false;
}

/**
 * Phrase headers in a mini-dict. Each gold/src header owns only the
 * translation lines that follow it until the next header. The next header
 * is a new group even when it is a single-word lemma and not a phrase card.
 * Those lemma lines must not merge into the previous header’s senses.
 */
export function phraseSenseGroupsFromTooltip(
  tt: Element | null | undefined
): { phrase: string; senses: string[] }[] {
  if (!tt || !tooltipHasDict(tt)) return [];
  const groups: { phrase: string; senses: string[] }[] = [];
  let current: { phrase: string; senses: string[] } | null = null;
  for (const el of tt.querySelectorAll("span")) {
    if (isDictChromeWrap(el)) continue;
    if (isDictTranslitChrome(el)) continue;
    if (isDictSrcHeader(el)) {
      const phrase = spanDisplay(el);
      if (!phrase || phrase === "...") {
        current = null;
        continue;
      }
      if (isPhrasePattern(phrase, "")) {
        current = { phrase, senses: [] };
        groups.push(current);
        continue;
      }
      current = null;
      continue;
    }
    if (!current || !isDictSenseLine(el)) continue;
    const sense = spanDisplay(el);
    if (!sense || sense === "...") continue;
    if (normalize(sense) === normalize(current.phrase)) continue;
    if (isUnstyledNextHeader(current.phrase, sense)) {
      current = null;
      continue;
    }
    if (!current.senses.some((item) => normalize(item) === normalize(sense))) {
      current.senses.push(sense);
    }
  }
  return groups.filter((g) => g.senses.length > 0);
}

export function sensesFromTooltip(tt: Element | null | undefined, phrase: string): string[] {
  const want = normalize(phrase);
  if (!want) return [];
  const compact = want.replace(/\s+/g, "");
  for (const group of phraseSenseGroupsFromTooltip(tt)) {
    const gNorm = normalize(group.phrase);
    if (gNorm === want || gNorm.replace(/\s+/g, "") === compact) return group.senses.slice();
  }
  return [];
}

function containsHovered(phrase: string, hoveredSurface: string): boolean {
  if (!hoveredSurface) return false;
  const p = normalize(phrase);
  const w = normalize(hoveredSurface);
  if (!p || !w) return false;
  if (p === w) return isContractionKey(p);
  if (tokenize(p).some((t) => tokenEq(t, w))) return true;
  if (!isContractionKey(p)) return false;
  const pieces = contractionCueTokens(p);
  if (pieces && pieces.some((t) => tokenEq(t, w))) return true;
  const stem = contractionStem(p);
  if (stem && tokenEq(stem, w)) return true;
  return isGlueToken(w) && compactPhrase(p).endsWith(compactPhrase(w));
}

function pickPhrase(headers: string[], hoveredSurface: string): string | null {
  const hits = headers.filter((h) => isPhrasePattern(h, hoveredSurface) && containsHovered(h, hoveredSurface));
  if (!hits.length) return null;
  hits.sort((a, b) => tokenize(b).length - tokenize(a).length || b.length - a.length);
  return hits[0];
}

function fallbackSnippets(tt: Element): string[] {
  const texts: string[] = [];
  for (const el of tt.querySelectorAll("span")) {
    if ([...el.children].some((c) => c.tagName !== "BR" && c.tagName !== "WBR")) continue;
    const text = rawText(el);
    if (!text || text.length > 80) continue;
    if (!texts.includes(text)) texts.push(text);
  }
  return texts;
}

/**
 * Next src header that LR did not paint with gold-header chrome. A single
 * token that is the current header’s contraction stem (`we're` → `we`) or a
 * token of a multi-word header (`get accepted` → `get`) starts a new group.
 */
export function isUnstyledNextHeader(phrase: string, header: string): boolean {
  const h = normalize(header);
  if (!h) return false;
  if (tokenize(h).length !== 1) return false;
  if (isPhrasePattern(h, "")) return false;
  const p = normalize(phrase);
  if (isContractionKey(p)) {
    const stem = contractionStem(p);
    if (stem && stem === h) return true;
  }
  const tokens = tokenize(p);
  return tokens.length > 1 && tokens.some((t) => tokenEq(t, h));
}

export function isPhrasePattern(phrase: string, word: string): boolean {
  const p = normalize(phrase);
  const w = normalize(word);
  if (!p) return false;
  const tokens = tokenize(p);
  if (tokens.length > 10) return false;
  if (tokens.length > 1) return true;
  if (isContractionKey(p)) return true;
  if (looksCjk(p) && w && p !== w && p.includes(w)) return true;
  return false;
}

export function multiWordHeaders(tt: Element | null | undefined): string[] {
  if (!tt || !tooltipHasDict(tt)) return [];
  const headers = srcHeaderTexts(tt);
  const extras = fallbackSnippets(tt);
  const all: string[] = [];
  for (const h of headers.concat(extras)) {
    if (!isPhrasePattern(h, "")) continue;
    if (!all.includes(h)) all.push(h);
  }
  all.sort((a, b) => tokenize(b).length - tokenize(a).length || b.length - a.length);
  return all;
}

export function phraseFromTooltip(
  tt: Element | null | undefined,
  hoveredSurface: string | null | undefined
): PhraseFromTooltip | null {
  if (!tt || (!isTtReady(tt) && !tooltipHasDict(tt))) return null;
  const headers = srcHeaderTexts(tt);
  let phrase = hoveredSurface ? pickPhrase(headers, hoveredSurface) : multiWordHeaders(tt)[0] || null;
  if (!phrase && hoveredSurface) phrase = pickPhrase(fallbackSnippets(tt), hoveredSurface);
  if (!phrase) return null;
  const word = headers.find((h) => tokenEq(h, hoveredSurface || "")) || hoveredSurface || "";
  return { phrase, word };
}

export function findPhrasePopup(
  hoveredEl: Element | null | undefined,
  hoveredSurface: string | null | undefined
): PhrasePopupHit | null {
  if (!hoveredEl || !hoveredSurface) return null;
  if (hoveredEl.closest?.(FULL_DICT_SEL)) return null;

  for (const tt of visibleFilledTooltips(hoveredEl)) {
    const parsed = phraseFromTooltip(tt, hoveredSurface);
    if (!parsed) continue;
    log("hover-dict phrase", parsed.phrase);
    return { popup: tt, phrase: parsed.phrase, word: parsed.word };
  }

  const own = hoverDictEl(hoveredEl);
  if (own && !isTtReady(own) && !tooltipHasDict(own)) {
    log("hover-dict not ready yet");
  }

  return null;
}
