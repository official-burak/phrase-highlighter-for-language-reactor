/**
 * Visible-surface extraction and normalization for LR subtitle tokens.
 * Hidden gloss / translit / mini-dict nodes must never leak into matching.
 */

const STRIP_SEL = [".lln-tt-hidden", ".tt", ".translit", ".dc-translit", ".dc-up"].join(",");

const PREFER_SEL = ".dc-orig, .dc-down";

const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/;

export function collapseWs(s: string | null | undefined): string {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalize(s: string | null | undefined): string {
  return collapseWs(s)
    .normalize("NFC")
    .toLowerCase()
    .replace(/['’]/g, "'");
}

export function tokenize(s: string | null | undefined): string[] {
  const n = normalize(s);
  if (!n) return [];
  return n.match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*|[^\s]/gu) || [];
}

const APOSTROPHE_RE = /['\u2019]/;
const CLITIC_REMAINDER = /^(s|ll|re|ve|d|m|t)$/i;
const NT_CLITIC = /^n['\u2019]t$/i;
const BROKEN_CLITIC = / (n['\u2019]t|['\u2019](?:t|s|ll|re|ve|d|m)?)\b/i;

/**
 * LR splits contractions across .lln-word nodes (`do` + `n't`). Glue those
 * pieces; keep a space between ordinary words (`get` + `started`).
 */
export function isGlueToken(token: string | null | undefined): boolean {
  const t = collapseWs(token);
  if (!t) return false;
  if (APOSTROPHE_RE.test(t.charAt(0))) return true;
  return NT_CLITIC.test(t);
}

/** ASCII hyphen, en dash, em dash, and Unicode hyphen as a punct token. */
const HYPHEN_PUNCT_RE = /^[-–—‐‑]$/u;
const STARTS_HYPHEN_WORD_RE = /^[-–—‐‑][\p{L}\p{N}]/u;
const ENDS_HYPHEN_WORD_RE = /[\p{L}\p{N}][-–—‐‑]$/u;

export function isHyphenPunct(token: string | null | undefined): boolean {
  return HYPHEN_PUNCT_RE.test(collapseWs(token));
}

function surfaceOf(token: { surface?: string } | string | null | undefined): string {
  return typeof token === "string" ? token : String(token?.surface || "");
}

/**
 * True when an n-gram must not start here: the token is the right-hand piece
 * of a hyphenated compound (`led` after `human-` / `-` / `–`), or the hyphen
 * itself. Apostrophe clitics (`'re`, `n't`) are not hyphens.
 */
export function isHyphenBoundNgramStart(
  tokens: Array<{ surface?: string } | string | null | undefined>,
  startIndex: number
): boolean {
  if (startIndex < 0 || startIndex >= tokens.length) return false;
  const cur = collapseWs(surfaceOf(tokens[startIndex]));
  if (!cur) return false;
  if (isHyphenPunct(cur) || STARTS_HYPHEN_WORD_RE.test(cur)) return true;
  for (let i = startIndex - 1; i >= 0; i--) {
    const prev = collapseWs(surfaceOf(tokens[i]));
    if (!prev) continue;
    return isHyphenPunct(prev) || ENDS_HYPHEN_WORD_RE.test(prev);
  }
  return false;
}

/** Two cue tokens that form an apostrophe contraction (`we` + `'re`). */
export function isCliticBigram(
  tokens: Array<{ surface?: string } | string | null | undefined>
): boolean {
  if (!tokens || tokens.length !== 2) return false;
  const first = surfaceOf(tokens[0]);
  const second = surfaceOf(tokens[1]);
  if (isGlueToken(second)) return true;
  return isContractionKey(joinDisplayTokens([first, second]));
}

export function joinDisplayTokens(tokens: Array<string | null | undefined>): string {
  const parts = tokens.map((t) => collapseWs(t)).filter(Boolean);
  if (!parts.length) return "";
  let out = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const next = parts[i];
    const prevCh = out.charAt(out.length - 1);
    const glue = isGlueToken(next) || (APOSTROPHE_RE.test(prevCh) && CLITIC_REMAINDER.test(next));
    out += glue ? next : ` ${next}`;
  }
  return out;
}

export function hasBrokenCliticSpacing(s: string | null | undefined): boolean {
  return BROKEN_CLITIC.test(collapseWs(s));
}

/**
 * One tokenize() token with an internal apostrophe (`we're`, `don't`).
 * Language Reactor still splits those across two .lln-word nodes.
 */
export function isContractionKey(s: string | null | undefined): boolean {
  const tokens = tokenize(s);
  if (tokens.length !== 1) return false;
  return /[\p{L}\p{N}]+'[\p{L}\p{N}]+/u.test(tokens[0]);
}

/** Stem before `'re` / `n't` / `'s` / … (`we're` → `we`, `don't` → `do`). */
export function contractionStem(s: string | null | undefined): string {
  const n = normalize(s);
  if (!n) return "";
  const nt = n.match(/^(.+)n't$/);
  if (nt) return nt[1];
  const clitic = n.match(/^(.+)'(?:re|ll|ve|d|m|s|t)$/);
  if (clitic) return clitic[1];
  const i = n.indexOf("'");
  return i > 0 ? n.slice(0, i) : "";
}

/**
 * LR cue pieces for a one-token contraction key (`we're` → `we` + `'re`).
 * tokenize() keeps the apostrophe inside one token; the subtitle row does not.
 */
export function contractionCueTokens(s: string | null | undefined): string[] | null {
  if (!isContractionKey(s)) return null;
  const n = normalize(s);
  const nt = n.match(/^(.+)(n't)$/);
  if (nt) return [nt[1], nt[2]];
  const clitic = n.match(/^(.+)('(?:re|ll|ve|d|m|s|t))$/);
  if (clitic) return [clitic[1], clitic[2]];
  const i = n.indexOf("'");
  if (i > 0 && i < n.length - 1) return [n.slice(0, i), n.slice(i)];
  return null;
}

function stripEdgePunct(s: string): string {
  return s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

export function tokenEq(a: string, b: string): boolean {
  if (a === b) return true;
  const sa = stripEdgePunct(a);
  const sb = stripEdgePunct(b);
  return sa.length > 0 && sa === sb;
}

export function looksCjk(s: string): boolean {
  return CJK_RE.test(s);
}

function cloneVisibleRaw(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll(STRIP_SEL).forEach((n) => n.remove());
  const preferred = clone.querySelector(PREFER_SEL);
  return preferred ? preferred.textContent || "" : clone.textContent || "";
}

/**
 * Clone-based surface string for an LR word (or punct) node.
 * Prefer original-language slots when Language Reactor nests them.
 */
export function visibleSurface(el: Element | null | undefined): string {
  if (!el || el.nodeType !== 1) return "";
  return normalize(cloneVisibleRaw(el));
}

/**
 * Normalize an element's own text. Unlike visibleSurfaceShallow this does
 * not blank nodes that live inside the hover dictionary (.tt).
 */
export function rawText(el: Element | null | undefined): string {
  if (!el || el.nodeType !== 1) return "";
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll(".translit, .dc-translit, .dc-up").forEach((n) => n.remove());
  return normalize(clone.textContent);
}

/** Own visible text of a subtitle token; skips gloss and mini-dict chrome. */
export function visibleSurfaceShallow(el: Element | null | undefined): string {
  if (!el || el.nodeType !== 1) return "";
  if (el.matches(STRIP_SEL) || el.closest(STRIP_SEL)) return "";
  return visibleSurface(el);
}
