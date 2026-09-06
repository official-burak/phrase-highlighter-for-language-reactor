/**
 * Map a phrase-pattern string onto the current subtitle token row.
 * Never returns a range that does not include the hovered node.
 * Never paints a single non-CJK token (that is LR's own word hover).
 */
import type { CueToken } from "./types";
import {
  contractionCueTokens,
  isHyphenBoundNgramStart,
  looksCjk,
  normalize,
  tokenEq,
  tokenize,
} from "./text";

function usableForSpaced(items: CueToken[], phraseTokens: string[]): CueToken[] {
  const phraseBlob = phraseTokens.join(" ");
  return items.filter((it) => {
    if (!it.isNotWord) return true;
    if (!it.surface) return false;
    return phraseBlob.includes(it.surface) || phraseTokens.some((t) => t.includes(it.surface) || it.surface.includes(t));
  });
}

function matchSpaced(items: CueToken[], phraseTokens: string[], hoveredEl: Element): Element[] | null {
  const row = usableForSpaced(items, phraseTokens);
  const hoveredIndex = row.findIndex((it) => it.el === hoveredEl);
  if (hoveredIndex < 0) return null;

  const n = phraseTokens.length;
  if (n < 2) return null;

  const startMin = Math.max(0, hoveredIndex - n + 1);
  const startMax = hoveredIndex;

  for (let start = startMin; start <= startMax; start++) {
    const end = start + n;
    if (end > row.length) continue;
    const origIndex = items.indexOf(row[start]);
    if (origIndex >= 0 && isHyphenBoundNgramStart(items, origIndex)) continue;
    let ok = true;
    for (let j = 0; j < n; j++) {
      if (!tokenEq(row[start + j].surface, phraseTokens[j])) {
        ok = false;
        break;
      }
    }
    if (ok) return row.slice(start, end).map((it) => it.el);
  }
  return null;
}

function matchCjk(items: CueToken[], phrase: string, hoveredEl: Element): Element[] | null {
  const compactPhrase = normalize(phrase).replace(/\s+/g, "");
  if (!compactPhrase || compactPhrase.length < 2) return null;

  const surfaces = items.map((it) => it.surface.replace(/\s+/g, ""));
  let concat = "";
  const spans: { start: number; end: number; el: Element }[] = [];
  for (let i = 0; i < items.length; i++) {
    const start = concat.length;
    concat += surfaces[i];
    spans.push({ start, end: concat.length, el: items[i].el });
  }

  const hoveredSpan = spans.find((s) => s.el === hoveredEl);
  if (!hoveredSpan) return null;

  let from = 0;
  let hit: { idx: number; end: number } | null = null;
  while (from <= concat.length - compactPhrase.length) {
    const idx = concat.indexOf(compactPhrase, from);
    if (idx === -1) break;
    const end = idx + compactPhrase.length;
    if (idx <= hoveredSpan.start && end >= hoveredSpan.end) {
      hit = { idx, end };
      break;
    }
    from = idx + 1;
  }
  if (!hit) return null;

  const found = hit;
  const els = spans
    .filter((s) => s.end > found.idx && s.start < found.end && s.end > s.start)
    .map((s) => s.el);
  return els.length >= 2 || compactPhrase.length >= 2 ? els : null;
}

export function matchPhrase(
  items: CueToken[],
  phrase: string,
  hoveredEl: Element | null | undefined
): Element[] | null {
  if (!hoveredEl || !items.length) return null;
  const normPhrase = normalize(phrase);
  const tokens = tokenize(normPhrase);
  if (!tokens.length) return null;

  const cjk = looksCjk(normPhrase);
  const pieces = contractionCueTokens(normPhrase);
  const spacedPhrase = tokens.length > 1 || Boolean(pieces);

  if (!cjk && !spacedPhrase) return null;

  if (!cjk || spacedPhrase) {
    const spaced = matchSpaced(items, pieces || tokens, hoveredEl);
    if (spaced) return spaced;
  }

  if (cjk) return matchCjk(items, normPhrase, hoveredEl);
  return null;
}
