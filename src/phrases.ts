/**
 * Phrase dictionary + line matching.
 *
 * Language Reactor (pageScript MiniDict) prefetches
 *   POST /base_dict_getHoverDictEntriesForSubs
 * into a closed cache, then on hover looks up the longest n-gram (2-9 tokens)
 * whose concatenated lowercase form.text is in that map.
 *
 * LR 5.1.8 stores that map as `data.phrases[src] = trans[]` (string
 * senses for that n-gram only), then wraps `{ src, trans }` in pageScript.
 * Word/lemma senses are a different call (`/base_dict_getHoverDict_8`) and
 * are concatenated as a later MiniDict entry only after hover. Cards fill
 * from the prefetch `trans[]` as soon as the cue is on screen.
 *
 * Lookup is mirrored against the intercepted map (and any src headers harvested
 * from already-filled .tt nodes). Empty `trans[]` keys are not used for
 * cards (clitic n=2 is the exception). Structured `{ src, trans }` headers
 * map only the phrase group onto the phrase key. A flat `trans[]` uses the
 * first contiguous phrase-sense run (stop at a lemma/token header). `.tt`
 * grouping refines an open popup; it is not a gate for first paint.
 * Nested keys that MiniDict listed for this cue appear as separate gloss
 * cards when they have senses. Single-word keys are never listed. Apostrophe
 * contractions are one tokenize() token but LR splits them across two
 * .lln-word nodes, so they match as n=2 and belong in the panel. Hyphenated
 * compounds (`human-led`) must not start an n-gram on the right-hand piece
 * (`led discovery`); that span is not a MiniDict phrase.
 */
import { log } from "./debug";
import {
  isUnstyledNextHeader,
  multiWordHeaders,
  phraseSenseGroupsFromTooltip,
  sensesFromTooltip,
  visibleFilledTooltips,
} from "./popup";
import {
  collapseWs,
  contractionCueTokens,
  contractionStem,
  hasBrokenCliticSpacing,
  isContractionKey,
  isGlueToken,
  isHyphenBoundNgramStart,
  joinDisplayTokens,
  looksCjk,
  normalize,
  tokenEq,
  tokenize,
} from "./text";
import type { CueToken, PhraseGloss, PhraseHit } from "./types";

const MIN_N = 2;
const MAX_N = 9;
/** Hard cap so a long title cannot keep every prefetch n-gram forever. */
export const PHRASE_DICT_CAP = 8192;

const compactToSrc = new Map<string, string>();
const compactToSenses = new Map<string, string[]>();
const state = {
  prefetchReady: false,
  size: 0,
};

function trimPhraseDict(): void {
  while (compactToSrc.size > PHRASE_DICT_CAP) {
    const oldest = compactToSrc.keys().next().value as string | undefined;
    if (oldest == null) break;
    compactToSrc.delete(oldest);
    compactToSenses.delete(oldest);
  }
  const senseCap = PHRASE_DICT_CAP * 2;
  while (compactToSenses.size > senseCap) {
    const oldest = compactToSenses.keys().next().value as string | undefined;
    if (oldest == null) break;
    compactToSenses.delete(oldest);
  }
  state.size = compactToSrc.size;
}

const POS_LABEL =
  /^(n|v|adj|adv|prep|pron|conj|det|int|interj|noun|verb|adjective|adverb|preposition|pronoun|conjunction|article|particle|aux|auxiliary)\.?$/i;

function uniquePush(out: string[], value: string): void {
  const key = normalize(value);
  if (!key) return;
  if (out.some((item) => normalize(item) === key)) return;
  out.push(value);
}

function isUsableSense(phrase: string, sense: string): boolean {
  const t = collapseWs(sense);
  if (!t || t === "...") return false;
  if (POS_LABEL.test(t)) return false;
  const p = normalize(phrase);
  const s = normalize(t);
  if (p && s === p) return false;
  if (isContractionKey(phrase)) {
    const stem = contractionStem(phrase);
    if (stem && s === stem) return false;
  }
  return true;
}

function cleanSenses(phrase: string, senses: string[]): string[] {
  const out: string[] = [];
  for (const sense of senses) {
    const t = collapseWs(sense);
    if (!isUsableSense(phrase, t)) continue;
    uniquePush(out, t);
  }
  return out;
}

function transFromUnknown(value: unknown, depth = 0): string[] {
  if (value == null || depth > 4) return [];
  if (typeof value === "string") {
    const t = collapseWs(value);
    return t ? [t] : [];
  }
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      for (const piece of transFromUnknown(item, depth + 1)) uniquePush(out, piece);
    }
    return out;
  }
  if (typeof value === "object") {
    const obj = value as { trans?: unknown; translations?: unknown; senses?: unknown; dst?: unknown };
    if (obj.trans != null) return transFromUnknown(obj.trans, depth + 1);
    if (obj.translations != null) return transFromUnknown(obj.translations, depth + 1);
    if (obj.senses != null) return transFromUnknown(obj.senses, depth + 1);
    if (typeof obj.dst === "string") return transFromUnknown(obj.dst, depth + 1);
  }
  return [];
}

function phraseKeyEq(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return compactKey(na) === compactKey(nb);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isHeaderGroupRecord(value: unknown): value is { src: string } {
  return isPlainObject(value) && typeof value.src === "string";
}

function transField(value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  if (value.trans != null) return value.trans;
  if (value.translations != null) return value.translations;
  if (value.senses != null) return value.senses;
  if (typeof value.dst === "string") return value.dst;
  return undefined;
}

/**
 * Translation strings on this node only. Nested `{ src }` headers are other
 * MiniDict groups and must not be concatenated onto this one.
 */
function ownTransFrom(value: unknown, depth = 0): string[] {
  if (value == null || depth > 5) return [];
  if (typeof value === "string") {
    const t = collapseWs(value);
    return t ? [t] : [];
  }
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      if (isHeaderGroupRecord(item)) continue;
      for (const piece of ownTransFrom(item, depth + 1)) uniquePush(out, piece);
    }
    return out;
  }
  if (isPlainObject(value)) {
    const field = transField(value);
    if (field == null) return [];
    return ownTransFrom(field, depth + 1);
  }
  return [];
}

function transLooksGrouped(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(isHeaderGroupRecord);
  return isHeaderGroupRecord(value);
}

function pushHeaderGroup(
  row: { src: string },
  out: { phrase: string; senses: string[] }[],
  seen: Set<string>
): void {
  const phrase = collapseWs(row.src);
  if (!phrase) return;
  const key = compactKey(phrase) || normalize(phrase);
  if (!key || seen.has(key)) return;
  seen.add(key);
  out.push({ phrase, senses: ownTransFrom(row) });
}

/**
 * Structured MiniDict payload: `{ src, trans }` headers (phrase vs word).
 * A flat `trans[]` of strings is not groups; those use firstPhraseSenseRun.
 */
function headerGroupsFromUnknown(value: unknown): { phrase: string; senses: string[] }[] | null {
  if (value == null || typeof value !== "object") return null;
  const found: { phrase: string; senses: string[] }[] = [];
  const keys = new Set<string>();

  const walk = (node: unknown, d: number): void => {
    if (node == null || typeof node !== "object" || d > 6) return;
    if (Array.isArray(node)) {
      const records = node.filter(isHeaderGroupRecord);
      if (records.length) {
        for (const row of records) {
          if (!transLooksGrouped(transField(row))) pushHeaderGroup(row, found, keys);
          walk(row, d + 1);
        }
        return;
      }
      for (const item of node) walk(item, d + 1);
      return;
    }
    if (isHeaderGroupRecord(node) && !transLooksGrouped(transField(node))) {
      pushHeaderGroup(node, found, keys);
    }
    for (const nested of Object.values(node)) {
      if (nested && typeof nested === "object") walk(nested, d + 1);
    }
  };

  walk(value, 0);
  return found.length ? found : null;
}

/** Named MiniDict headers, plus this map key’s own trans when it is not itself a header. */
function groupsForPrefetchKey(mapKey: string, trans: unknown): { phrase: string; senses: string[] }[] | null {
  const groups = headerGroupsFromUnknown(trans);
  if (!groups || !groups.length) return null;
  if (mapKey && !groups.some((g) => phraseKeyEq(g.phrase, mapKey))) {
    const own = ownTransFrom(trans);
    if (own.length) groups.unshift({ phrase: collapseWs(mapKey) || mapKey, senses: own });
  }
  return groups;
}

/**
 * Compact type sketch for lrph-debug. Live ingest logs this once per payload
 * when `trans` has no `{ src }` groups, not a per-key console dump.
 */
function prefetchValueShape(value: unknown, depth = 0): unknown {
  if (depth > 2) return typeof value;
  if (value == null) return value;
  if (typeof value === "string") return "string";
  if (typeof value !== "object") return typeof value;
  if (Array.isArray(value)) {
    return {
      arrayLen: value.length,
      head: value.slice(0, 4).map((item) => prefetchValueShape(item, depth + 1)),
    };
  }
  return { keys: Object.keys(value as object).slice(0, 8) };
}

/**
 * Phrase senses from a flat `trans[]`. Stop at the next MiniDict header
 * (contraction stem / token of the phrase) so lemma lines stay off the card.
 * With no header in the list, the run is the whole usable array: that is
 * how prefetch stores phrase-only senses on the n-gram key.
 */
function firstPhraseSenseRun(phrase: string, senses: string[]): string[] {
  const out: string[] = [];
  for (const sense of senses) {
    const t = collapseWs(sense);
    if (!t) continue;
    if (isUnstyledNextHeader(phrase, t)) break;
    if (!isUsableSense(phrase, t)) continue;
    uniquePush(out, t);
  }
  return out;
}

function rememberSenses(src: string, senses: string[], replace = false): void {
  const cleaned = cleanSenses(src, senses);
  if (!cleaned.length) return;
  remember(src, true);
  const compact = compactKey(src);
  if (!compact) return;
  const apply = (key: string) => {
    if (replace) {
      compactToSenses.set(key, cleaned.slice());
      return;
    }
    const prev = compactToSenses.get(key) || [];
    const merged: string[] = prev.slice();
    for (const sense of cleaned) uniquePush(merged, sense);
    compactToSenses.set(key, merged);
  };
  apply(compact);
  const spaced = normalize(src);
  if (spaced && spaced !== compact) apply(spaced);
}

function ingestHeaderGroups(mapKey: string, groups: { phrase: string; senses: string[] }[]): void {
  const match = groups.find((g) => phraseKeyEq(g.phrase, mapKey));
  if (match && admitPhraseKey(match.phrase, match.senses)) {
    remember(match.phrase, false);
    rememberSenses(match.phrase, match.senses, true);
  } else if (isMultiWordKey(normalize(mapKey), compactKey(mapKey))) {
    remember(mapKey, false);
  }
  for (const g of groups) {
    if (match && phraseKeyEq(g.phrase, match.phrase)) continue;
    if (!g.senses.length) continue;
    if (!isMultiWordKey(normalize(g.phrase), compactKey(g.phrase))) continue;
    if (!admitPhraseKey(g.phrase, g.senses)) continue;
    remember(g.phrase, false);
    rememberSenses(g.phrase, g.senses, true);
  }
}

export function compactKey(s: string): string {
  return normalize(s).replace(/\s+/g, "");
}

function isMultiWordKey(norm: string, compact: string): boolean {
  const tokens = tokenize(norm);
  if (tokens.length >= MIN_N) return true;
  if (isContractionKey(norm)) return true;
  if (looksCjk(norm) && compact.length >= MIN_N) return true;
  return false;
}

function remember(src: string, requireMulti: boolean): void {
  const norm = normalize(src);
  if (!norm) return;
  const compact = compactKey(norm);
  if (!compact) return;
  if (requireMulti && !isMultiWordKey(norm, compact)) return;
  const prev = compactToSrc.get(compact);
  if (!prev || norm.length > prev.length) compactToSrc.set(compact, norm);
  if (norm !== compact) {
    const prevSpaced = compactToSrc.get(norm);
    if (!prevSpaced || norm.length >= prevSpaced.length) compactToSrc.set(norm, norm);
  }
  if (compactToSrc.size > PHRASE_DICT_CAP) trimPhraseDict();
  else state.size = compactToSrc.size;
}

type PhraseEntry = { src: string; trans: unknown };

function collectPhraseEntries(phrases: unknown): PhraseEntry[] {
  const out: PhraseEntry[] = [];
  if (Array.isArray(phrases)) {
    for (const item of phrases) {
      if (typeof item === "string") out.push({ src: item, trans: [] });
      else if (item && typeof item === "object" && typeof (item as { src?: unknown }).src === "string") {
        out.push({ src: (item as { src: string }).src, trans: item });
      }
    }
    return out;
  }
  if (phrases && typeof phrases === "object") {
    const map = phrases as Record<string, unknown>;
    for (const key of Object.keys(map)) out.push({ src: key, trans: map[key] });
  }
  return out;
}

function entryHasSenses(src: string, trans: unknown): boolean {
  return cleanSenses(src, transFromUnknown(trans)).length > 0;
}

function admitPhraseKey(src: string, trans: unknown): boolean {
  return isContractionKey(src) || entryHasSenses(src, trans);
}

export function ingestPhrases(phrases: unknown): number {
  if (!phrases) return 0;
  state.prefetchReady = true;
  const before = compactToSrc.size;
  let loggedUnstructured = false;
  for (const { src, trans } of collectPhraseEntries(phrases)) {
    const groups = groupsForPrefetchKey(src, trans);
    if (groups && groups.length) {
      ingestHeaderGroups(src, groups);
      continue;
    }
    if (!loggedUnstructured && trans != null && trans !== true && trans !== false) {
      loggedUnstructured = true;
      log("prefetch trans shape", src, prefetchValueShape(trans));
    }
    if (!admitPhraseKey(src, trans)) continue;
    remember(src, false);
    const run = firstPhraseSenseRun(src, transFromUnknown(trans));
    if (run.length) rememberSenses(src, run, true);
  }
  if (compactToSrc.size > PHRASE_DICT_CAP) trimPhraseDict();
  return compactToSrc.size - before;
}

export function ingestPhraseSenses(phrase: string, senses: string[] | null | undefined): void {
  if (!phrase || !senses || !senses.length) return;
  rememberSenses(phrase, senses);
}

export function ingestTooltipSenses(tt: Element | null | undefined): void {
  for (const group of phraseSenseGroupsFromTooltip(tt)) {
    rememberSenses(group.phrase, group.senses, true);
  }
}

export function ingestPhraseKeys(keys: string[] | null | undefined): number {
  if (!keys || !keys.length) return 0;
  const before = compactToSrc.size;
  for (const k of keys) {
    if (!k) continue;
    if (isContractionKey(k) || lookupSenses(k).length) remember(k, true);
  }
  return compactToSrc.size - before;
}

function lookupCompact(joined: string): string | null {
  if (!joined) return null;
  return compactToSrc.get(joined) || compactToSrc.get(normalize(joined)) || null;
}

/**
 * Panel / hit label: prefer the dict key when it is already "don't", else
 * join LR word tokens without a space before clitics (`n't`, `'s`, …).
 */
export function phraseLabelFromTokens(
  tokens: Array<{ surface?: string } | string | null | undefined>,
  dictSrc?: string | null
): string {
  const surfaces = tokens.map((t) => (typeof t === "string" ? t : t?.surface));
  const glued = joinDisplayTokens(surfaces);
  const src = collapseWs(dictSrc);
  if (!src || compactKey(src) !== compactKey(glued)) return glued;
  const srcIsCompact = src === compactKey(src);
  if (srcIsCompact && src !== glued) {
    if (hasBrokenCliticSpacing(glued) && /['\u2019]/.test(src) && !hasBrokenCliticSpacing(src)) {
      return src;
    }
    return glued;
  }
  if (hasBrokenCliticSpacing(src) && !hasBrokenCliticSpacing(glued)) return glued;
  return src;
}

export function phraseLabelFromText(phrase: string, dictSrc?: string | null): string {
  return phraseLabelFromTokens(tokenize(phrase), dictSrc ?? lookupCompact(compactKey(phrase)));
}

function wordRow(items: CueToken[]): CueToken[] {
  return items.filter((it) => {
    if (!it || !it.el || !it.surface) return false;
    if (!it.isNotWord) return true;
    return isGlueToken(it.surface);
  });
}

function hyphenBoundStart(items: CueToken[], start: CueToken): boolean {
  const idx = items.indexOf(start);
  return idx >= 0 && isHyphenBoundNgramStart(items, idx);
}

function windowMatchesSrc(window: CueToken[], src: string, joined: string): boolean {
  if (compactKey(src) !== joined) return false;
  return window.map((it) => compactKey(it.surface)).join("") === joined;
}

/**
 * Every n-gram window (2-9) that exists in the phrase map, including nested
 * and overlapping keys MiniDict listed for this cue.
 */
export function collectLinePhrases(items: CueToken[]): PhraseHit[] {
  const row = wordRow(items);
  if (row.length < MIN_N) return [];

  const surfaces = row.map((it) => compactKey(it.surface));
  const raw: PhraseHit[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < row.length; i++) {
    if (hyphenBoundStart(items, row[i])) continue;
    const maxN = Math.min(MAX_N, row.length - i);
    for (let n = maxN; n >= MIN_N; n--) {
      const window = row.slice(i, i + n);
      const joined = surfaces.slice(i, i + n).join("");
      const src = lookupCompact(joined);
      if (!src || !windowMatchesSrc(window, src, joined)) continue;
      const phrase = phraseLabelFromTokens(window, src);
      const key = `${i}:${n}:${compactKey(phrase)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      raw.push({
        start: i,
        n,
        phrase,
        els: window.map((it) => it.el),
      });
    }
  }

  return raw;
}

/**
 * Longest n-gram windows (2-9) that exist in the phrase map.
 * Returns a non-overlapping subset: longest first, then left-to-right.
 * Nested keys for cards come from findAllLinePhrases.
 */
export function findLinePhrases(items: CueToken[]): PhraseHit[] {
  return pickNonOverlapping(collectLinePhrases(items));
}

/** All MiniDict phrase keys on this cue, nested included, longest first per start. */
export function findAllLinePhrases(items: CueToken[]): PhraseHit[] {
  return collectLinePhrases(items).sort((a, b) => a.start - b.start || b.n - a.n);
}

export function pickNonOverlapping(hits: PhraseHit[]): PhraseHit[] {
  const sorted = hits.slice().sort((a, b) => b.n - a.n || a.start - b.start);
  const taken: PhraseHit[] = [];
  for (const h of sorted) {
    const end = h.start + h.n;
    const overlap = taken.some((t) => h.start < t.start + t.n && end > t.start);
    if (overlap) continue;
    taken.push(h);
  }
  taken.sort((a, b) => a.start - b.start);
  return taken;
}

/**
 * Map a known spaced phrase string (hover-dict header) onto the line
 * without a hovered token.
 */
export function matchPhraseOnLine(items: CueToken[], phrase: string): PhraseHit[] {
  if (!phrase || !items.length) return [];
  const normPhrase = normalize(phrase);
  const tokens = tokenize(normPhrase);
  if (!tokens.length) return [];
  const cjk = looksCjk(normPhrase);
  const pieces = contractionCueTokens(normPhrase);
  const spacedPhrase = tokens.length > 1 || Boolean(pieces);
  if (!cjk && !spacedPhrase) return [];

  const hits: PhraseHit[] = [];
  if (!cjk || spacedPhrase) {
    const matchTokens = pieces || tokens;
    const row = items.filter((it) => {
      if (!it.isNotWord) return true;
      if (!it.surface) return false;
      if (isGlueToken(it.surface)) return true;
      const blob = matchTokens.join(" ");
      return blob.includes(it.surface) || matchTokens.some((t) => t.includes(it.surface) || it.surface.includes(t));
    });
    const n = matchTokens.length;
    for (let start = 0; start <= row.length - n; start++) {
      if (hyphenBoundStart(items, row[start])) continue;
      let ok = true;
      for (let j = 0; j < n; j++) {
        if (!tokenEq(row[start + j].surface, matchTokens[j])) {
          ok = false;
          break;
        }
      }
      if (ok) {
        const window = row.slice(start, start + n);
        hits.push({
          start,
          n,
          phrase: phraseLabelFromText(normPhrase),
          els: window.map((it) => it.el),
        });
      }
    }
  }
  return pickNonOverlapping(hits);
}

export function phraseDictSize(): number {
  return compactToSrc.size;
}

export function phrasePrefetchReady(): boolean {
  return state.prefetchReady;
}

function lookupSenses(phrase: string): string[] {
  if (!phrase) return [];
  const compact = compactKey(phrase);
  const spaced = normalize(phrase);
  const found = (compact && compactToSenses.get(compact)) || (spaced && compactToSenses.get(spaced)) || [];
  return cleanSenses(phrase, found);
}

/**
 * Ingest gold headers + trans lines from any filled MiniDict in `document`,
 * including MiniDict `.tt` nodes that are not under `.lln-word`.
 */
export function harvestFilledTooltips(word?: Element | null): boolean {
  let found = false;
  for (const tt of visibleFilledTooltips(word)) {
    ingestTooltipSenses(tt);
    const keys = multiWordHeaders(tt);
    if (keys.length) {
      ingestPhraseKeys(keys);
      found = true;
    }
  }
  return found;
}

/**
 * Sense lines for one current-cue phrase. A filled MiniDict is grouped by
 * header: only the group whose header matches this phrase is used, never
 * later headers and never every `.tt` line in `document`. That grouping
 * refines an already-open popup. Structured prefetch headers and the first
 * contiguous run of a flat `trans[]` fill the card without a `.tt`.
 */
export function sensesForPhrase(phrase: string, els?: Element[] | null): string[] {
  const seen = new Set<Element>();
  const take = (tt: Element | null | undefined): string[] => {
    if (!tt || seen.has(tt)) return [];
    seen.add(tt);
    const fromTt = sensesFromTooltip(tt, phrase);
    if (!fromTt.length) return [];
    rememberSenses(phrase, fromTt, true);
    return cleanSenses(phrase, fromTt);
  };
  for (const el of els || []) {
    for (const tt of visibleFilledTooltips(el)) {
      const got = take(tt);
      if (got.length) return got;
    }
  }
  for (const tt of visibleFilledTooltips()) {
    const got = take(tt);
    if (got.length) return got;
  }
  return lookupSenses(phrase);
}

/**
 * Stacked list model for the current cue only. Phrases without senses are omitted.
 */
export function glossEntriesFor(hits: PhraseHit[] | null | undefined): PhraseGloss[] {
  if (!hits || !hits.length) return [];
  const out: PhraseGloss[] = [];
  const seen = new Set<string>();
  const ordered = hits.slice().sort((a, b) => a.start - b.start || b.n - a.n);
  for (const hit of ordered) {
    if (!hit || !hit.phrase) continue;
    const key = compactKey(hit.phrase) || normalize(hit.phrase);
    if (!key || seen.has(key)) continue;
    const senses = sensesForPhrase(hit.phrase, hit.els);
    if (!senses.length) continue;
    seen.add(key);
    out.push({ phrase: phraseLabelFromText(hit.phrase), senses });
  }
  return out;
}

export function resetPhraseDict(): void {
  compactToSrc.clear();
  compactToSenses.clear();
  state.prefetchReady = false;
  state.size = 0;
}
