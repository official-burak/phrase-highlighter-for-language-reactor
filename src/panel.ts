/** Cue-scoped gloss cards in a docked sidebar, opened from LR's .main-toolbar. */
import { glossEntriesFor } from "./phrases";
import { SIDEBAR_OPEN_KEY, sidebarOpenFromStored, readSidebarOpen, writeSidebarOpen } from "./prefs";
import {
  findMainToolbar,
  isNonWatchRoute,
  isPlayerCueRoot,
  isLearningSurface,
} from "./selectors";
import { disarmHoverHold } from "./hover-hold";
import type { PhraseGloss, PhraseHit } from "./types";

export { SIDEBAR_OPEN_KEY, sidebarOpenFromStored };

const PANEL = "lrph-glosses";
const TOOLBAR_BTN = "lrph-toolbar-btn";
const ICON = "lrph-glosses-icon";
const LIST = "lrph-glosses-list";
const ITEM = "lrph-glosses-item";
const PHRASE = "lrph-glosses-phrase";
const MEANINGS = "lrph-glosses-meanings";
const SENSE = "lrph-glosses-sense";
const ON = "is-on";
const DOCK = "lrph-dock";
const EMPTY = "lrph-glosses-empty";
const EMPTY_ICON = "lrph-glosses-empty-icon";

/** Extension toolbar icon, shown in Language Reactor's learning toolbar. */
export const GLOSS_ICON_PATH = "icons/icon48.png";
/** Empty-cue mark in the dock. 128px raster, shown at 80 CSS px. */
export const EMPTY_GLOSS_ICON_PATH = "icons/icon128.png";

const live = {
  panel: null as HTMLElement | null,
  toolbarBtn: null as HTMLElement | null,
  toolbar: null as Element | null,
  sidebarOpen: false,
  lastEntries: [] as PhraseGloss[],
};

function chromeForbidden(): boolean {
  return isNonWatchRoute();
}

function learningChromeAllowed(): boolean {
  return isLearningSurface();
}

function hasPhraseCards(): boolean {
  return live.lastEntries.length > 0;
}

/** Learning surface and preference open. Empty cue still keeps the dock. */
function dockShouldShow(): boolean {
  return !chromeForbidden() && learningChromeAllowed() && live.sidebarOpen;
}

function panelSignature(entries: PhraseGloss[]): string {
  if (!entries.length) return "";
  return entries.map((e) => `${e.phrase}\n${e.senses.join("\n")}`).join("\n\n");
}

function existingPanel(): HTMLElement | null {
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc || typeof doc.querySelector !== "function") return null;
  return (doc.querySelector(`.${PANEL}`) as HTMLElement | null) || null;
}

function panelHost(mount?: Element | null): Element | null {
  if (typeof document !== "undefined" && document.body) return document.body;
  return mount || null;
}

function glossIconUrl(path: string): string {
  try {
    const g = globalThis as typeof globalThis & {
      chrome?: { runtime?: { getURL?: (path: string) => string } };
    };
    return g.chrome?.runtime?.getURL?.(path) || "";
  } catch {
    return "";
  }
}

function setDocked(on: boolean): void {
  try {
    const root = typeof document !== "undefined" ? document.documentElement : null;
    if (!root || !root.classList) return;
    const was = root.classList.contains(DOCK);
    if (was === on) return;
    disarmHoverHold();
    root.classList.toggle(DOCK, on);
  } catch {
    /* ignore */
  }
}

/** Full-height side column. Cards start at the top of the pane. */
const DOCK_TOP_PX = 0;

function viewportHeight(): number {
  try {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const h = (vv && vv.height) || (typeof window !== "undefined" ? window.innerHeight : 0) || 0;
    if (h > 0) return h;
  } catch {
    /* ignore */
  }
  try {
    if (typeof document !== "undefined") return document.documentElement?.clientHeight || 0;
  } catch {
    /* ignore */
  }
  return 0;
}

function dockMaxHeightPx(): number {
  return viewportHeight();
}

function applyDockLayout(panel: HTMLElement | null): void {
  if (!panel) return;
  panel.style.top = `${DOCK_TOP_PX}px`;
  panel.style.bottom = "0px";
  panel.style.height = "100%";
  panel.style.paddingTop = "0px";
  const px = dockMaxHeightPx();
  if (px > 0) {
    const value = `${Math.round(px)}px`;
    panel.style.maxHeight = value;
    try {
      panel.style.setProperty("--lrph-dock-max-h", value);
    } catch {
      /* ignore */
    }
  } else {
    panel.style.maxHeight = "";
  }
}

function syncToolbarUi(btn: HTMLElement | null | undefined): void {
  if (!btn) return;
  const on = live.sidebarOpen;
  btn.classList.toggle(ON, on);
  btn.classList.remove("is-off", "is-open");
  btn.setAttribute("aria-expanded", on ? "true" : "false");
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.setAttribute("aria-label", on ? "Hide phrases" : "Show phrases");
  btn.title = "Phrase Highlighter";
}

function applyOpenState(panel: HTMLElement | null): void {
  if (panel) {
    const list = panel.querySelector(`.${LIST}`) as HTMLElement | null;
    if (list) list.setAttribute("aria-hidden", "false");
    panel.setAttribute("aria-hidden", "false");
    applyDockLayout(panel);
  }
  setDocked(Boolean(panel));
  syncToolbarUi(live.toolbarBtn);
}

export function isGlossSidebarOpen(): boolean {
  return live.sidebarOpen;
}

/** Same as sidebar open. Kept so older tests and callers have one toggle. */
export function isGlossPanelOpen(): boolean {
  return live.sidebarOpen;
}

export function setGlossSidebarOpen(open: boolean): void {
  live.sidebarOpen = Boolean(open);
  writeSidebarOpen(live.sidebarOpen);
  if (chromeForbidden()) {
    clearGlossPanels();
    return;
  }
  if (!learningChromeAllowed()) {
    syncToolbarUi(live.toolbarBtn);
    return;
  }
  syncVisibleDock();
}

export function setGlossPanelOpen(open: boolean): void {
  setGlossSidebarOpen(open);
}

export async function loadGlossPanelPref(): Promise<boolean> {
  const open = await readSidebarOpen();
  live.sidebarOpen = open;
  if (dockShouldShow()) syncVisibleDock();
  else {
    unmountSidebar();
    syncToolbarUi(live.toolbarBtn);
  }
  return open;
}

function onToolbarClick(event: Event): void {
  try {
    event.preventDefault();
    event.stopPropagation();
  } catch {
    /* ignore */
  }
  setGlossSidebarOpen(!live.sidebarOpen);
}

function iconImg(className = ICON, path = GLOSS_ICON_PATH): HTMLImageElement {
  const img = document.createElement("img");
  img.className = className;
  img.alt = "";
  img.draggable = false;
  img.dataset.lrphIcon = path;
  const url = glossIconUrl(path);
  if (url) img.src = url;
  return img;
}

function buildToolbarButton(): HTMLElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = TOOLBAR_BTN;
  btn.title = "Phrase Highlighter";
  btn.addEventListener("click", onToolbarClick, true);
  btn.appendChild(iconImg());
  return btn;
}

function prependToolbarButton(bar: Element, btn: HTMLElement): void {
  const first = bar.firstElementChild || bar.firstChild;
  if (first === btn) return;
  const host = bar as HTMLElement;
  if (typeof host.prepend === "function") {
    host.prepend(btn);
    return;
  }
  bar.insertBefore(btn, bar.firstChild);
}

/**
 * Put our icon in Language Reactor's `.main-toolbar` on a learning surface.
 * Always the first child so LR's own buttons can shift without moving us.
 * Re-prepend on every call; React remounts must not leave us last or duplicated.
 */
export function ensureToolbarButton(): HTMLElement | null {
  if (chromeForbidden()) {
    clearGlossPanels();
    return null;
  }
  if (!learningChromeAllowed()) {
    return live.toolbarBtn;
  }
  const bar = findMainToolbar();
  live.toolbar = bar;
  if (!bar) {
    return live.toolbarBtn;
  }
  let btn = bar.querySelector(`:scope > .${TOOLBAR_BTN}`) as HTMLElement | null;
  if (!btn) {
    btn = live.toolbarBtn || buildToolbarButton();
  } else if (live.toolbarBtn && live.toolbarBtn !== btn) {
    try {
      live.toolbarBtn.remove();
    } catch {
      /* ignore */
    }
  }
  try {
    for (const extra of [...bar.querySelectorAll(`:scope > .${TOOLBAR_BTN}`)]) {
      if (extra !== btn) extra.remove();
    }
  } catch {
    /* ignore */
  }
  prependToolbarButton(bar, btn);
  live.toolbarBtn = btn;
  syncToolbarUi(btn);
  applyDockLayout(live.panel);
  return btn;
}

function paintList(list: HTMLElement, entries: PhraseGloss[]): void {
  list.classList.remove("is-empty");
  list.replaceChildren();
  for (const entry of entries) {
    const item = document.createElement("div");
    item.className = ITEM;
    const phrase = document.createElement("div");
    phrase.className = PHRASE;
    phrase.textContent = entry.phrase;
    item.appendChild(phrase);
    const meanings = document.createElement("div");
    meanings.className = MEANINGS;
    for (const sense of entry.senses) {
      const line = document.createElement("div");
      line.className = SENSE;
      line.textContent = sense;
      meanings.appendChild(line);
    }
    item.appendChild(meanings);
    list.appendChild(item);
  }
}

function paintEmpty(list: HTMLElement): void {
  list.classList.add("is-empty");
  list.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = EMPTY;
  wrap.setAttribute("aria-hidden", "true");
  wrap.appendChild(iconImg(EMPTY_ICON, EMPTY_GLOSS_ICON_PATH));
  list.appendChild(wrap);
}

function ensureList(panel: HTMLElement): HTMLElement {
  for (const leftover of panel.querySelectorAll(
    `:scope > .lrph-sidebar-header, :scope > .lrph-switch, :scope > .lrph-glosses-bar`
  )) {
    leftover.remove();
  }
  let list = panel.querySelector(`:scope > .${LIST}`) as HTMLElement | null;
  if (!list) {
    list = document.createElement("div");
    list.className = LIST;
    panel.appendChild(list);
  }
  return list;
}

function ensurePanel(host: Element | null): HTMLElement | null {
  if (!host) return live.panel;
  let panel = existingPanel() || live.panel;
  let created = false;
  if (!panel || !panel.isConnected) {
    panel = document.createElement("aside");
    panel.className = PANEL;
    panel.setAttribute("aria-label", "Phrases");
    panel.setAttribute("data-lrph-fresh", "");
    host.appendChild(panel);
    created = true;
    window.setTimeout(() => {
      try {
        panel?.removeAttribute("data-lrph-fresh");
      } catch {
        /* ignore */
      }
    }, 200);
  } else if (panel.parentElement !== host) {
    host.appendChild(panel);
  }
  if (!created) {
    try {
      panel.style.animation = "none";
    } catch {
      /* ignore */
    }
  }
  live.panel = panel;
  const list = ensureList(panel);
  const sig = panelSignature(live.lastEntries) || "empty";
  if (panel.dataset.lrphGloss !== sig) {
    if (hasPhraseCards()) paintList(list, live.lastEntries);
    else paintEmpty(list);
    panel.dataset.lrphGloss = sig;
  } else if (!list.childElementCount) {
    if (hasPhraseCards()) paintList(list, live.lastEntries);
    else paintEmpty(list);
    panel.dataset.lrphGloss = sig;
  }
  applyOpenState(panel);
  return panel;
}

function syncVisibleDock(host?: Element | null): HTMLElement | null {
  ensureToolbarButton();
  if (!dockShouldShow()) {
    unmountSidebar();
    syncToolbarUi(live.toolbarBtn);
    return null;
  }
  const nextHost = host || panelHost(null);
  if (!nextHost) return null;
  return ensurePanel(nextHost);
}

export function fillGlossPanel(mount: Element, entries: PhraseGloss[]): HTMLElement | null {
  try {
    live.lastEntries = Array.isArray(entries) ? entries : [];
    if (chromeForbidden()) {
      clearGlossPanels();
      return null;
    }
    if (!learningChromeAllowed()) {
      return live.panel && live.panel.isConnected ? live.panel : null;
    }
    return syncVisibleDock(panelHost(mount));
  } catch {
    return null;
  }
}

function mergeGlossLists(a: PhraseGloss[], b: PhraseGloss[]): PhraseGloss[] {
  const out = a.slice();
  const seen = new Set(a.map((e) => e.phrase));
  for (const entry of b) {
    if (seen.has(entry.phrase)) continue;
    seen.add(entry.phrase);
    out.push(entry);
  }
  return out;
}

export function syncGlossPanels(rootToSpans: Iterable<[Element, PhraseHit[]]> | null | undefined): void {
  try {
    let entries: PhraseGloss[] = [];
    if (rootToSpans) {
      for (const pair of rootToSpans) {
        if (!pair) continue;
        const root = pair[0];
        const spans = pair[1];
        if (!root || !root.isConnected) continue;
        if (!isPlayerCueRoot(root)) continue;
        const next = glossEntriesFor(spans);
        if (!next.length) continue;
        entries = entries.length ? mergeGlossLists(entries, next) : next;
      }
    }

    live.lastEntries = entries;
    if (chromeForbidden()) {
      clearGlossPanels();
      return;
    }
    if (!learningChromeAllowed()) {
      return;
    }
    syncVisibleDock();
  } catch {
    try {
      ensureToolbarButton();
    } catch {
      /* ignore */
    }
  }
}

export function refreshGlossPanels(): void {
  if (chromeForbidden()) {
    clearGlossPanels();
    return;
  }
  if (!learningChromeAllowed()) {
    return;
  }
  ensureToolbarButton();
  if (dockShouldShow()) ensurePanel(panelHost(null));
  else {
    unmountSidebar();
    syncToolbarUi(live.toolbarBtn);
  }
}

function unmountSidebar(): void {
  if (live.panel) {
    live.panel.remove();
  } else {
    for (const el of document.querySelectorAll?.(".lrph-glosses") || []) {
      el.remove();
    }
  }
  live.panel = null;
  setDocked(false);
}

export function clearGlossPanels(): void {
  unmountSidebar();
  if (live.toolbarBtn) {
    live.toolbarBtn.remove();
  } else {
    for (const el of document.querySelectorAll?.(".lrph-toolbar-btn") || []) {
      el.remove();
    }
  }
  live.toolbarBtn = null;
  live.toolbar = null;
}

export function glossObserverActive(): boolean {
  return false;
}

export function isGlossPanelNode(node: Node | null | undefined): boolean {
  if (!node || node.nodeType !== 1) return false;
  const el = node as Element;
  const cl = el.classList;
  if (cl && typeof cl.contains === "function") {
    if (
      cl.contains(PANEL) ||
      cl.contains(TOOLBAR_BTN) ||
      cl.contains(ICON) ||
      cl.contains(LIST) ||
      cl.contains(ITEM) ||
      cl.contains(PHRASE) ||
      cl.contains(MEANINGS) ||
      cl.contains(SENSE) ||
      cl.contains("lrph-switch")
    ) {
      return true;
    }
  }
  return Boolean(el.closest?.(".lrph-glosses, .lrph-toolbar-btn, .lrph-switch"));
}
