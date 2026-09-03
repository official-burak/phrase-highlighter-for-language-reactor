/**
 * Isolated-world session: cue scan, observers, navigation, teardown.
 * Gloss cards live in a docked sidebar; .lln-word nodes are never wrapped.
 * Host watchers stay on languagereactor.com so a catalog or word-table
 * detour can start the session again when a player or reader returns.
 */
import { log } from "./debug";
import { refreshScrollRoots, teardownFrame, unwatchVisibility, watchVisibility } from "./frame";
import { disarmHoverHold, HOVER_HOLD_ARMED_CLASS, installHoverHold, uninstallHoverHold } from "./hover-hold";
import { clearGlossPanels, isGlossPanelNode, loadGlossPanelPref, refreshGlossPanels, syncGlossPanels } from "./panel";
import {
  findAllLinePhrases,
  ingestPhrases,
  phraseDictSize,
  phrasePrefetchReady,
  resetPhraseDict,
} from "./phrases";
import {
  isPlayerCueRoot,
  isNonWatchRoute,
  isLearningSurface,
  isLrSaveOrStarControl,
  liveCueFingerprint,
  subtitleRootsWithWords,
  tokensInRoot,
  rememberPointerCue,
  clearPointerCue,
  WORD_SEL,
} from "./selectors";
import { isLanguageReactorHost } from "./host";
import type { PhraseHit } from "./types";

const SCAN_MS = 32;
const CUE_UNSTABLE_MAX = 4;

const state = {
  started: false,
  bootGen: 0,
  scanTimer: 0,
  lastHref: "",
  mediaId: "",
  prefsReady: false,
  observing: false,
  hostBooted: false,
  sessionAttached: false,
  cueSig: "",
  cueBurst: false,
  cueRescanRaf: 0,
  cueUnstableTries: 0,
};

let mo: MutationObserver | null = null;
let observedBody: Element | null = null;
let origPush: History["pushState"] | null = null;
let origReplace: History["replaceState"] | null = null;
let onDomReady: (() => void) | null = null;
let ensuring: Promise<void> | null = null;
const staleCues = new WeakSet<Element>();
const staleCueText = new WeakMap<Element, string>();
let lastPointerUnit: Element | null = null;

function cueKey(root: Element): string {
  return tokensInRoot(root)
    .map((t) => t.surface)
    .join(" ");
}

function markStaleCues(): void {
  try {
    for (const root of subtitleRootsWithWords()) {
      staleCues.add(root);
      staleCueText.set(root, cueKey(root));
    }
  } catch {
    /* ignore */
  }
}

function isStaleCue(root: Element): boolean {
  try {
    return staleCues.has(root) && staleCueText.get(root) === cueKey(root);
  } catch {
    return false;
  }
}

function dropIdleUi(): void {
  try {
    clearGlossPanels();
  } catch {
    /* ignore */
  }
}

function playerCueSignature(): string {
  try {
    return subtitleRootsWithWords()
      .filter((root) => isPlayerCueRoot(root))
      .map((root) => liveCueFingerprint(root))
      .join("\n");
  } catch {
    return "";
  }
}

const SURFACE_LEAVE_MS = 360;
let learningChromeHeld = false;
let learningLeaveTimer = 0;

function cancelLearningLeave(): void {
  if (!learningLeaveTimer) return;
  try {
    window.clearTimeout(learningLeaveTimer);
  } catch {
    /* ignore */
  }
  learningLeaveTimer = 0;
}

function resetLearningChromeHold(): void {
  learningChromeHeld = false;
  cancelLearningLeave();
}

function keepLearningChrome(): boolean {
  try {
    if (isNonWatchRoute()) {
      resetLearningChromeHold();
      return false;
    }
    if (isLearningSurface()) {
      learningChromeHeld = true;
      cancelLearningLeave();
      return true;
    }
    if (!learningChromeHeld) return false;
    if (!learningLeaveTimer) {
      learningLeaveTimer = window.setTimeout(() => {
        learningLeaveTimer = 0;
        if (isNonWatchRoute() || !isLearningSurface()) {
          learningChromeHeld = false;
          dropIdleUi();
        } else {
          learningChromeHeld = true;
        }
      }, SURFACE_LEAVE_MS);
    }
    return true;
  } catch {
    return false;
  }
}

function playerCueHasWords(): boolean {
  try {
    const roots = subtitleRootsWithWords().filter((root) => isPlayerCueRoot(root));
    if (!roots.length) return false;
    for (const root of roots) {
      const tokens = tokensInRoot(root);
      const words = tokens.filter((t) => !t.isNotWord);
      if (tokens.length >= 2 && words.length) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function playerCueUnstable(): boolean {
  if (!state.cueBurst) return false;
  return !playerCueHasWords();
}

function isWordishNode(node: Node | null | undefined): boolean {
  if (!node || node.nodeType !== 1) return false;
  const el = node as Element;
  try {
    if (el.classList?.contains("lln-word")) return true;
    return Boolean(el.querySelector?.(".lln-word"));
  } catch {
    return false;
  }
}

function nodeTouchesPlayerCue(node: Node | null | undefined): boolean {
  if (!node) return false;
  const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
  if (!el || el.nodeType !== 1) return false;
  try {
    if (isPlayerCueRoot(el)) return true;
    return Boolean(
      el.closest?.(
        "#lln-subs, .lln-subs, #lln-main-subs, #lln-subs-content, .lln-subs-wrap, #lln-subs-container, #lln-bottom-panel, .lln-bottom-panel, .video-subs-wrap-overvideo, .sentence-wrap-main, .sentence-wrap, .sentence-row, .svx-row, .svx-sentence-wrap, .lri-MediaPlayer_TEXT-wrap, .lri-SubsView-wrap"
      )
    );
  } catch {
    return false;
  }
}

function isCueChildListBurst(records: MutationRecord[]): boolean {
  let addedWords = 0;
  let removedWords = 0;
  let cueTouches = 0;
  for (const rec of records || []) {
    const nodes = [...(rec.addedNodes || []), ...(rec.removedNodes || []), rec.target];
    if (!nodes.some((n) => nodeTouchesPlayerCue(n))) continue;
    cueTouches += 1;
    for (const n of rec.addedNodes || []) {
      if (isWordishNode(n)) addedWords += 1;
    }
    for (const n of rec.removedNodes || []) {
      if (isWordishNode(n)) removedWords += 1;
    }
  }
  if (!cueTouches) return false;
  return addedWords > 0 && removedWords > 0;
}

function cancelScanTimer(): void {
  if (!state.scanTimer) return;
  window.clearTimeout(state.scanTimer);
  state.scanTimer = 0;
}

function cancelCueRescan(): void {
  if (!state.cueRescanRaf) return;
  try {
    cancelAnimationFrame(state.cueRescanRaf);
  } catch {
    /* ignore */
  }
  state.cueRescanRaf = 0;
}

function scheduleStableRescan(): void {
  if (state.cueRescanRaf) return;
  const run = () => {
    state.cueRescanRaf = 0;
    const finish = () => {
      if (playerCueUnstable() && state.cueUnstableTries < CUE_UNSTABLE_MAX) {
        state.cueUnstableTries += 1;
        scheduleStableRescan();
        return;
      }
      state.cueBurst = false;
      state.cueUnstableTries = 0;
      state.cueSig = playerCueSignature();
      scan();
    };
    if (typeof queueMicrotask === "function") queueMicrotask(finish);
    else Promise.resolve().then(finish);
  };
  if (typeof requestAnimationFrame === "function") {
    state.cueRescanRaf = requestAnimationFrame(run);
  } else {
    run();
  }
}

function onCueInvalidated(): void {
  disarmHoverHold();
  cancelScanTimer();
  scheduleStableRescan();
  scheduleScan();
}

function onMediaSeek(event: Event): void {
  const t = event.target as Node | null;
  if (!t || t.nodeName !== "VIDEO") return;
  try {
    void (t as HTMLVideoElement).currentTime;
  } catch {
    return;
  }
  disarmHoverHold();
  state.cueBurst = true;
  onCueInvalidated();
}

function lineHitsForRoot(root: Element): PhraseHit[] {
  const tokens = tokensInRoot(root);
  if (tokens.length < 2) return [];
  const words = tokens.filter((t) => !t.isNotWord);
  if (!words.length) return [];
  return findAllLinePhrases(tokens);
}

function extensionInvalid(): boolean {
  try {
    const g = globalThis as typeof globalThis & { chrome?: { runtime?: { id?: string } } };
    const rt = g.chrome?.runtime;
    if (!rt) return false;
    void rt.id;
    return false;
  } catch {
    return true;
  }
}

/** Learning-page media key. Empty on catalogs, word tables, and other non-learning routes. */
function watchMediaId(href?: string): string {
  try {
    const u = new URL(href || location.href);
    const path = String(u.pathname || "");
    const cue = path.match(/^\/c\/[^/]+\/[^/]+\/([^/]+)/);
    if (cue) return `c:${cue[1]}`;
    const v = u.searchParams.get("v");
    if (v) return `v:${v}`;
  } catch {
    /* ignore */
  }
  return "";
}

function rememberHref(): void {
  state.lastHref = location.href;
  const next = watchMediaId();
  if (next) state.mediaId = next;
}

function onMediaChange(): void {
  disarmHoverHold();
  markStaleCues();
  resetPhraseDict();
  state.cueSig = "";
  state.cueBurst = false;
  state.cueUnstableTries = 0;
  cancelCueRescan();
  try {
    clearPointerCue();
  } catch {
    /* ignore */
  }
  lastPointerUnit = null;
  try {
    syncGlossPanels([]);
  } catch {
    /* hide cards for the new media; preference is unchanged */
  }
}

function checkHref(): void {
  const href = location.href;
  const hrefChanged = href !== state.lastHref;
  if (hrefChanged) disarmHoverHold();
  const prevMedia = state.mediaId;
  rememberHref();
  if (hrefChanged && state.mediaId && state.mediaId !== prevMedia) onMediaChange();
  if (!keepLearningChrome()) dropIdleUi();
  void ensureRuntime();
}

function scan(): void {
  if (!isLanguageReactorHost()) {
    teardownRuntime();
    return;
  }
  if (!state.started || !state.prefsReady) {
    void ensureRuntime();
    return;
  }
  if (extensionInvalid()) {
    teardownRuntime();
    return;
  }
  if (document.hidden) return;
  if (!keepLearningChrome()) {
    dropIdleUi();
    return;
  }
  const liveMedia = watchMediaId();
  if (liveMedia && liveMedia !== state.mediaId) {
    rememberHref();
    onMediaChange();
  }
  let roots: Element[] = [];
  try {
    roots = subtitleRootsWithWords().filter((root) => !isStaleCue(root));
  } catch {
    roots = [];
  }
  if (!roots.length) {
    if (keepLearningChrome()) {
      try {
        syncGlossPanels([]);
        refreshGlossPanels();
      } catch {
        try {
          refreshGlossPanels();
        } catch {
          /* ignore */
        }
      }
    } else {
      dropIdleUi();
    }
    return;
  }
  const glossHits = new Map<Element, PhraseHit[]>();
  for (const root of roots) {
    try {
      const all = lineHitsForRoot(root);
      if (all.length && isPlayerCueRoot(root)) glossHits.set(root, all);
    } catch {
      /* one bad cue must not block the rest */
    }
  }
  try {
    syncGlossPanels(glossHits);
  } catch {
    /* gloss must not block the next scan */
  }
  log(
    "scan",
    `dict=${phraseDictSize()} prefetch=${phrasePrefetchReady()}`,
    [...glossHits.values()].map((s) => s.map((x) => x.phrase))
  );
  state.cueSig = playerCueSignature();
}

function scheduleScan(): void {
  if (!isLanguageReactorHost()) return;
  if (!state.started || !state.prefsReady) {
    void ensureRuntime();
    return;
  }
  if (document.hidden) return;
  if (state.scanTimer) return;
  state.scanTimer = window.setTimeout(() => {
    state.scanTimer = 0;
    scan();
  }, SCAN_MS);
}

interface PrefetchMessage {
  source?: string;
  type?: string;
  phrases?: unknown;
}

function onPrefetchMessage(event: MessageEvent<PrefetchMessage>): void {
  try {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "lrph" || data.type !== "phrases") return;
    const n = ingestPhrases(data.phrases);
    log("prefetch phrases", n, "dict", phraseDictSize());
    scheduleScan();
  } catch {
    /* a bad payload must not kill the isolated world */
  }
}

function isIgnorable(node: Node | null): boolean {
  try {
    if (!node) return true;
    const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
    if (!el || el.nodeType !== 1) return false;
    if (isGlossPanelNode(el)) return true;
    return Boolean(el.closest?.(".lrph-glosses, .lrph-switch, .lrph-layer, .lrph-toolbar-btn"));
  } catch {
    return false;
  }
}

function onMutations(records: MutationRecord[]): void {
  try {
    if (!isLanguageReactorHost()) {
      teardownRuntime();
      return;
    }
    if (!keepLearningChrome()) {
      dropIdleUi();
      return;
    }
    if (!state.started || !state.prefsReady) {
      void ensureRuntime();
      return;
    }
    let meaningful = false;
    for (const rec of records || []) {
      const added = rec?.addedNodes ? [...rec.addedNodes] : [];
      const removed = rec?.removedNodes ? [...rec.removedNodes] : [];
      const nodes = [...added, ...removed, rec.target];
      if (nodes.every(isIgnorable)) continue;
      meaningful = true;
      break;
    }
    if (!meaningful) return;
    const burst = isCueChildListBurst(records);
    let sig = "";
    try {
      sig = playerCueSignature();
    } catch {
      sig = "";
    }
    const cueChanged = sig !== state.cueSig;
    if (cueChanged) {
      state.cueSig = sig;
      state.cueBurst = burst || !sig || !playerCueHasWords();
      onCueInvalidated();
      return;
    }
    scheduleScan();
  } catch {
    scheduleScan();
  }
}

function ensureMo(): MutationObserver | null {
  if (mo) return mo;
  if (typeof MutationObserver !== "function") return null;
  mo = new MutationObserver(onMutations);
  return mo;
}

function observeBody(): void {
  if (!document.body) return;
  const observer = ensureMo();
  if (!observer) {
    if (state.started && state.prefsReady) scheduleScan();
    return;
  }
  try {
    if (observedBody !== document.body || !state.observing) {
      observer.disconnect();
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      observedBody = document.body;
    }
    state.observing = true;
  } catch {
    state.observing = false;
  }
  refreshScrollRoots();
  if (state.started && state.prefsReady) scheduleScan();
}

function wrapHistory(): void {
  if (origPush) return;
  try {
    origPush = history.pushState.bind(history);
    origReplace = history.replaceState.bind(history);
    history.pushState = function (this: History, ...args: Parameters<History["pushState"]>) {
      const ret = origPush!.apply(this, args);
      onHostNav();
      return ret;
    };
    history.replaceState = function (this: History, ...args: Parameters<History["replaceState"]>) {
      const ret = origReplace!.apply(this, args);
      onHostNav();
      return ret;
    };
  } catch {
    origPush = null;
    origReplace = null;
  }
}

function unwrapHistory(): void {
  try {
    if (origPush) history.pushState = origPush;
    if (origReplace) history.replaceState = origReplace;
  } catch {
    /* ignore */
  }
  origPush = null;
  origReplace = null;
}

function sweepLrphDom(): void {
  try {
    for (const el of document.querySelectorAll(".lrph-layer, .lrph-glosses, .lrph-switch, .lrph-toolbar-btn")) {
      el.remove();
    }
    try {
      document.documentElement?.classList?.remove("lrph-dock", HOVER_HOLD_ARMED_CLASS);
    } catch {
      /* ignore */
    }
    for (const el of document.querySelectorAll(".lrph-host")) {
      el.classList.remove("lrph-host");
    }
  } catch {
    /* ignore */
  }
}

function signalMainWorld(type: "stop" | "start"): void {
  try {
    window.postMessage({ source: "lrph", type }, "*");
  } catch {
    /* ignore */
  }
}

function onPageHide(): void {
  clearGlossPanels();
  if (!isLanguageReactorHost()) teardownRuntime();
}

function onPageShow(): void {
  onHostNav();
}

function onHostNav(): void {
  disarmHoverHold();
  if (!isLanguageReactorHost()) {
    teardownRuntime();
    return;
  }
  bootHost();
  checkHref();
}

function bootHost(): void {
  if (state.hostBooted) return;
  if (!isLanguageReactorHost()) return;
  state.hostBooted = true;
  installHoverHold();
  window.addEventListener("popstate", onHostNav, true);
  window.addEventListener("hashchange", onHostNav, true);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  wrapHistory();
  observeBody();
}

function unbootHost(): void {
  if (!state.hostBooted) return;
  state.hostBooted = false;
  window.removeEventListener("popstate", onHostNav, true);
  window.removeEventListener("hashchange", onHostNav, true);
  window.removeEventListener("pagehide", onPageHide);
  window.removeEventListener("pageshow", onPageShow);
  unwrapHistory();
  try {
    mo?.disconnect();
  } catch {
    /* ignore */
  }
  mo = null;
  observedBody = null;
  state.observing = false;
}

function onPointerCue(event: Event): void {
  try {
    const t = event.target as Node | null;
    if (!t || isIgnorable(t)) return;
    const el = t.nodeType === 1 ? (t as Element) : t.parentElement;
    if (!el || el.nodeType !== 1) return;
    if (isLrSaveOrStarControl(el)) return;
    const hit =
      (typeof el.closest === "function" &&
        (el.closest(WORD_SEL) || el.closest(".sentence-wrap, .sentence-row, .svx-row, .lln-sentence-wrap"))) ||
      null;
    if (!hit || isLrSaveOrStarControl(hit)) return;
    const unit = rememberPointerCue(hit);
    if (unit === lastPointerUnit) return;
    lastPointerUnit = unit;
    scheduleScan();
  } catch {
    /* ignore */
  }
}

function attachSession(): void {
  if (state.sessionAttached) return;
  state.sessionAttached = true;
  installHoverHold();
  window.addEventListener("message", onPrefetchMessage);
  window.addEventListener("seeking", onMediaSeek, true);
  window.addEventListener("seeked", onMediaSeek, true);
  document.addEventListener("mouseover", onPointerCue, true);
  watchVisibility(onHostNav);
}

function detachSession(): void {
  if (!state.sessionAttached) return;
  state.sessionAttached = false;
  window.removeEventListener("message", onPrefetchMessage);
  window.removeEventListener("seeking", onMediaSeek, true);
  window.removeEventListener("seeked", onMediaSeek, true);
  try {
    document.removeEventListener("mouseover", onPointerCue, true);
  } catch {
    /* ignore */
  }
  uninstallHoverHold();
  unwatchVisibility(onHostNav);
}

export function ensureRuntime(): Promise<void> | void {
  if (!isLanguageReactorHost()) {
    teardownRuntime();
    return;
  }
  bootHost();
  if (state.started && state.prefsReady) {
    observeBody();
    scheduleScan();
    return;
  }
  if (ensuring) return ensuring;
  ensuring = startRuntime().finally(() => {
    ensuring = null;
  });
  return ensuring;
}

export function isRuntimeActive(): boolean {
  return state.started;
}

export function isRuntimeObserving(): boolean {
  return state.observing;
}

export function isRuntimeProbing(): boolean {
  return false;
}

export async function startRuntime(): Promise<void> {
  if (!isLanguageReactorHost()) return;
  bootHost();
  if (state.started) {
    observeBody();
    if (state.prefsReady) scheduleScan();
    return;
  }
  state.started = true;
  const gen = ++state.bootGen;
  rememberHref();
  await loadGlossPanelPref();
  if (gen !== state.bootGen || !state.started) return;
  state.prefsReady = true;
  attachSession();
  signalMainWorld("start");
  observeBody();
  if (!document.body) {
    onDomReady = () => {
      onDomReady = null;
      observeBody();
    };
    document.addEventListener("DOMContentLoaded", onDomReady, { once: true });
  }
  log("content script ready", location.hostname);
}

export function teardownRuntime(): void {
  resetLearningChromeHold();
  const stayOnHost = isLanguageReactorHost();
  if (!state.started && !state.observing && !mo && !state.hostBooted) {
    teardownFrame();
    return;
  }
  state.started = false;
  state.bootGen += 1;
  state.prefsReady = false;
  cancelCueRescan();
  state.cueBurst = false;
  state.cueSig = "";
  state.cueUnstableTries = 0;
  if (state.scanTimer) {
    window.clearTimeout(state.scanTimer);
    state.scanTimer = 0;
  }
  if (onDomReady) {
    try {
      document.removeEventListener("DOMContentLoaded", onDomReady);
    } catch {
      /* ignore */
    }
    onDomReady = null;
  }
  detachSession();
  resetPhraseDict();
  try {
    clearPointerCue();
  } catch {
    /* ignore */
  }
  lastPointerUnit = null;
  clearGlossPanels();
  teardownFrame();
  sweepLrphDom();
  if (stayOnHost) {
    bootHost();
    observeBody();
    return;
  }
  unbootHost();
  signalMainWorld("stop");
}
