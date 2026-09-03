/**
 * Headless checks for phrase matching, hover-dict headers, and gloss cards.
 */
import * as esbuild from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const bundled = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["test/globals.ts"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: ["es2022"],
});

const code = bundled.outputFiles[0].text;

function mockEl(tag, className = "") {
  const children = [];
  const classSet = new Set(String(className).split(/\s+/).filter(Boolean));
  const listeners = {};
  const attrs = {};
  const adopt = (child) => {
    if (!child) return;
    const from = child.parentElement;
    if (from && Array.isArray(from.children)) {
      const i = from.children.indexOf(child);
      if (i >= 0) from.children.splice(i, 1);
    }
    child.parentElement = node;
  };
  const node = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    id: "",
    get className() {
      return [...classSet].join(" ");
    },
    set className(value) {
      classSet.clear();
      String(value)
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => classSet.add(c));
    },
    classList: {
      contains: (c) => classSet.has(c),
      add: (c) => classSet.add(c),
      remove: (c) => classSet.delete(c),
      toggle(c, force) {
        if (force === true) classSet.add(c);
        else if (force === false) classSet.delete(c);
        else if (classSet.has(c)) classSet.delete(c);
        else classSet.add(c);
        return classSet.has(c);
      },
    },
    children,
    childNodes: children,
    get childElementCount() {
      return children.length;
    },
    parentElement: null,
    textContent: "",
    dataset: {},
    style: {
      setProperty(key, value) {
        this[key] = value;
      },
    },
    isConnected: true,
    getBoundingClientRect() {
      return { top: 0, left: 0, right: 40, bottom: 20, width: 40, height: 20, x: 0, y: 0 };
    },
    removeAttribute(name) {
      delete attrs[name];
      if (name === "class") node.className = "";
      if (name.startsWith("data-")) delete node.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
    },
    matches() {
      return false;
    },
    get firstChild() {
      return children[0] || null;
    },
    get firstElementChild() {
      return children[0] || null;
    },
    prepend(child) {
      if (!children.length) return node.appendChild(child);
      return node.insertBefore(child, children[0]);
    },
    get nextSibling() {
      const p = node.parentElement;
      if (!p || !Array.isArray(p.children)) return null;
      const i = p.children.indexOf(node);
      return i >= 0 ? p.children[i + 1] || null : null;
    },
    get previousElementSibling() {
      const p = node.parentElement;
      if (!p || !Array.isArray(p.children)) return null;
      const i = p.children.indexOf(node);
      return i > 0 ? p.children[i - 1] : null;
    },
    contains(el) {
      let cur = el;
      while (cur) {
        if (cur === node) return true;
        cur = cur.parentElement;
      }
      return false;
    },
    after(el) {
      const p = node.parentElement;
      if (!p) return;
      const next = node.nextSibling;
      if (next) p.insertBefore(el, next);
      else p.appendChild(el);
    },
    appendChild(child) {
      adopt(child);
      children.push(child);
      return child;
    },
    insertBefore(child, ref) {
      if (!ref) return node.appendChild(child);
      adopt(child);
      const i = children.indexOf(ref);
      if (i < 0) {
        children.push(child);
        return child;
      }
      children.splice(i, 0, child);
      return child;
    },
    remove() {
      const p = node.parentElement;
      if (!p || !p.children) return;
      const i = p.children.indexOf(node);
      if (i >= 0) p.children.splice(i, 1);
      node.parentElement = null;
    },
    replaceChildren(...nodes) {
      for (const child of children) child.parentElement = null;
      children.length = 0;
      for (const next of nodes) node.appendChild(next);
    },
    setAttribute(name, value) {
      attrs[name] = String(value);
      if (name === "class") node.className = value;
      if (name === "id") node.id = String(value);
    },
    getAttribute(name) {
      if (name === "class") return node.className;
      if (name === "id") return node.id || null;
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    addEventListener(type, fn) {
      (listeners[type] || (listeners[type] = [])).push(fn);
    },
    removeEventListener(type, fn) {
      const list = listeners[type];
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    dispatchEvent(ev) {
      const type = ev && ev.type;
      for (const fn of listeners[type] || []) fn(ev);
      return true;
    },
    click() {
      const ev = { type: "click", currentTarget: node, target: node, preventDefault() {}, stopPropagation() {} };
      for (const fn of listeners.click || []) fn(ev);
    },
    closest(sel) {
      const parts = String(sel)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      let cur = node;
      while (cur) {
        if (parts.some((want) => matchSimpleSel(cur, want))) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    matches(sel) {
      return String(sel)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .some((want) => matchSimpleSel(node, want));
    },
    cloneNode(deep) {
      const copy = mockEl(tag, node.className);
      copy.id = node.id;
      copy.textContent = node.textContent;
      copy.dataset = { ...node.dataset };
      if (deep) {
        for (const child of children) {
          if (typeof child.cloneNode === "function") copy.appendChild(child.cloneNode(true));
        }
      }
      return copy;
    },
    querySelector(sel) {
      return node.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      const parts = String(sel)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!parts.length) return [];
      const out = [];
      const scoped = parts.some((part) => part.includes(":scope"));
      const walk = (el, top) => {
        for (const child of el.children || []) {
          if (parts.some((part) => matchQueryPart(child, part))) out.push(child);
          if (!scoped || !top) walk(child, false);
        }
      };
      walk(node, true);
      return out;
    },
  };
  return node;
}

function assertGlossDockHidden() {
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-glosses")), false);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-glosses-empty")), false);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-glosses-scan")), false);
  assert.equal(sandbox.document.documentElement.classList.contains("lrph-dock"), false);
}

function assertGlossDockEmpty() {
  const panel = sandbox.document.body.querySelector(".lrph-glosses");
  assert.equal(Boolean(panel), true);
  assert.equal(sandbox.document.documentElement.classList.contains("lrph-dock"), true);
  assert.equal(Boolean(panel.querySelector(".lrph-glosses-empty")), true);
  assert.equal(Boolean(panel.querySelector(".lrph-glosses-item")), false);
  const list = panel.querySelector(".lrph-glosses-list");
  assert.equal(Boolean(list), true);
  assert.equal(list.classList.contains("is-empty"), true);
  const img = panel.querySelector(".lrph-glosses-empty-icon") || panel.querySelector(".lrph-glosses-empty img");
  assert.equal(Boolean(img), true);
}

function mountWatchPlayerToolbar() {
  const bar = mockEl("div", "main-toolbar");
  const speed = mockEl("button");
  speed.setAttribute("title", "Playback rate");
  speed.setAttribute("aria-label", "Playback rate");
  speed.textContent = "1x";
  bar.appendChild(speed);
  sandbox.document.body.appendChild(bar);
  return bar;
}

function mountBookCurrentLine() {
  const row = mockEl("div", "svx-row");
  row.classList.add("active");
  const wrap = mockEl("div", "svx-sentence-wrap");
  wrap.classList.add("sentence-wrap");
  const view = mockEl("span", "sentence-view");
  wrap.appendChild(view);
  row.appendChild(wrap);
  sandbox.document.body.appendChild(row);
  return { row, wrap, view };
}

function mountWatchSubtitleHost() {
  const el = mockEl("div", "lln-subs");
  el.id = "lln-subs";
  sandbox.document.body.appendChild(el);
  return el;
}

function matchSimpleSel(el, sel) {
  const s = String(sel || "").trim();
  if (!el || !s) return false;
  if (s.startsWith("#")) return el.id === s.slice(1);
  if (s.startsWith(".")) return Boolean(el.classList && el.classList.contains(s.slice(1)));
  if (/^[a-z][\w-]*$/i.test(s)) return el.tagName === s.toUpperCase();
  return Boolean(el.classList && el.classList.contains(s));
}

function matchQueryPart(el, sel) {
  const s = String(sel || "").trim();
  if (!el || !s) return false;
  const classNames = [...s.matchAll(/\.([a-z0-9_-]+)/gi)].map((m) => m[1]);
  const wantClass = classNames[classNames.length - 1] || "";
  const hash = s.indexOf("#");
  const id = hash >= 0 ? s.slice(hash + 1).split(/[\s.[:]/)[0] : "";
  const tagOnly = s.replace(/:scope\s*>?\s*/g, "").trim();
  const tag = /^[a-z][\w-]*$/i.test(tagOnly) ? tagOnly.toUpperCase() : "";
  const names = String(el.className || "").split(/\s+/);
  if (wantClass && names.includes(wantClass)) return true;
  if (id && el.id === id) return true;
  if (tag && el.tagName === tag) return true;
  return false;
}

function walkQuery(root, sel) {
  if (!root) return [];
  const parts = String(sel)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return [];
  const out = [];
  const walk = (el) => {
    for (const child of el.children || []) {
      if (parts.some((part) => matchQueryPart(child, part))) out.push(child);
      walk(child);
    }
  };
  walk(root);
  return out;
}

const rafFns = new Map();
let rafSeq = 0;
const timeoutFns = new Map();
let timeoutSeq = 0;
const docListeners = {};
const winListeners = {};

class MockResizeObserver {
  constructor(cb) {
    this.cb = cb;
    this.targets = new Set();
    this.disconnected = false;
    MockResizeObserver.instances.push(this);
  }
  observe(el) {
    this.targets.add(el);
    this.disconnected = false;
  }
  unobserve(el) {
    this.targets.delete(el);
  }
  disconnect() {
    this.targets.clear();
    this.disconnected = true;
  }
}
MockResizeObserver.instances = [];

class MockMutationObserver {
  constructor(cb) {
    this.cb = cb;
    this.disconnected = false;
    this.observing = false;
    MockMutationObserver.instances.push(this);
  }
  observe() {
    this.observing = true;
    this.disconnected = false;
  }
  disconnect() {
    this.observing = false;
    this.disconnected = true;
  }
}
MockMutationObserver.instances = [];

class MockXMLHttpRequest {
  constructor() {
    this.responseType = "";
    this.responseURL = "";
    this.response = null;
    this._responseText = "";
    this._listeners = [];
  }
  open(_method, url) {
    this.responseURL = String(url);
  }
  send() {}
  addEventListener(type, fn, opts) {
    this._listeners.push({ type, fn, opts });
  }
  get responseText() {
    const t = this.responseType || "";
    if (t !== "" && t !== "text") {
      const err = new Error(
        `Failed to read the 'responseText' property from 'XMLHttpRequest': The value is only accessible if the object's 'responseType' is '' or 'text' (was '${t}').`
      );
      err.name = "InvalidStateError";
      throw err;
    }
    return this._responseText;
  }
  set responseText(value) {
    this._responseText = value;
  }
}

let fetchHandler = async () => {
  throw new Error("fetch not stubbed");
};

const sandbox = {
  console,
  globalThis: null,
  window: null,
  innerWidth: 1280,
  innerHeight: 720,
  location: {
    href: "https://www.languagereactor.com/video?v=aaaaaaaaaaa",
    hostname: "www.languagereactor.com",
  },
  history: {
    pushState() {},
    replaceState() {},
  },
  requestAnimationFrame(fn) {
    const id = ++rafSeq;
    rafFns.set(id, fn);
    return id;
  },
  cancelAnimationFrame(id) {
    rafFns.delete(id);
  },
  setTimeout(fn) {
    const id = ++timeoutSeq;
    timeoutFns.set(id, fn);
    return id;
  },
  clearTimeout(id) {
    timeoutFns.delete(id);
  },
  addEventListener(type, fn, opts) {
    (winListeners[type] || (winListeners[type] = [])).push({ fn, opts });
  },
  removeEventListener(type, fn) {
    const list = winListeners[type];
    if (!list) return;
    const i = list.findIndex((x) => x.fn === fn);
    if (i >= 0) list.splice(i, 1);
  },
  ResizeObserver: MockResizeObserver,
  MutationObserver: MockMutationObserver,
  document: {
    hidden: false,
    documentElement: null,
    body: null,
    fullscreenElement: null,
    createElement(tag) {
      return mockEl(tag);
    },
    createElementNS(_ns, tag) {
      return mockEl(tag);
    },
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      const seen = new Set();
      const out = [];
      for (const el of [...walkQuery(this.documentElement, sel), ...walkQuery(this.body, sel)]) {
        if (seen.has(el)) continue;
        seen.add(el);
        out.push(el);
      }
      return out;
    },
    getElementById(id) {
      return this.querySelector(`#${id}`);
    },
    addEventListener(type, fn) {
      (docListeners[type] || (docListeners[type] = [])).push(fn);
    },
    removeEventListener(type, fn) {
      const list = docListeners[type];
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
  },
  getComputedStyle(el) {
    const st = (el && el.style) || {};
    const opacity = st.opacity == null || st.opacity === "" ? "1" : String(st.opacity);
    return {
      display: st.display || "inline-block",
      visibility: st.visibility || "visible",
      opacity,
      textTransform: st.textTransform || st["text-transform"] || "none",
    };
  },
  chrome: {
    runtime: {
      getURL() {
        return "";
      },
      lastError: undefined,
    },
    storage: {
      local: {
        store: {},
        get(key) {
          const out = {};
          if (typeof key === "string" && Object.prototype.hasOwnProperty.call(this.store, key)) {
            out[key] = this.store[key];
          }
          return Promise.resolve(out);
        },
        set(items) {
          Object.assign(this.store, items);
          return Promise.resolve();
        },
        remove(key) {
          if (typeof key === "string") delete this.store[key];
          return Promise.resolve();
        },
      },
    },
  },
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.document.documentElement = mockEl("html");
sandbox.document.documentElement.clientWidth = 1280;
sandbox.document.body = mockEl("body");
sandbox.Promise = Promise;
sandbox.queueMicrotask = (fn) => {
  Promise.resolve().then(fn);
};
sandbox.URL = URL;
sandbox.Map = Map;
sandbox.Set = Set;
sandbox.WeakMap = WeakMap;
sandbox.ArrayBuffer = ArrayBuffer;
sandbox.Uint8Array = Uint8Array;
sandbox.TextDecoder = TextDecoder;
sandbox.TextEncoder = TextEncoder;
sandbox.XMLHttpRequest = MockXMLHttpRequest;
sandbox.fetch = function (input, init) {
  return Promise.resolve(fetchHandler(input, init));
};
sandbox.postMessage = function (data) {
  const event = { source: this, data };
  for (const { fn } of winListeners.message || []) {
    try {
      fn.call(this, event);
    } catch {
      /* ignore */
    }
  }
};
const vvListeners = {};
sandbox.visualViewport = {
  width: 1280,
  height: 720,
  offsetTop: 0,
  offsetLeft: 0,
  addEventListener(type, fn) {
    (vvListeners[type] || (vvListeners[type] = [])).push(fn);
  },
  removeEventListener(type, fn) {
    const list = vvListeners[type];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  },
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: "test/globals.ts" });

const { LRPH } = sandbox;

/** Structured MiniDict-style prefetch: phrase header, optional lemma header. */
function dictPhrase(src, trans, lemma) {
  if (!lemma) return { src, trans };
  return [
    { src, trans },
    { src: lemma.src, trans: lemma.trans },
  ];
}

function lrphLayers() {
  return sandbox.document.querySelectorAll(".lrph-layer");
}

function lrphBands() {
  return sandbox.document.querySelectorAll(".lrph-band");
}

function glossPhrases() {
  return [...sandbox.document.body.querySelectorAll(".lrph-glosses-phrase")].map((el) => el.textContent);
}

function assertNoUnderlineDom() {
  assert.equal(lrphLayers().length, 0);
  assert.equal(lrphBands().length, 0);
}

function token(surface, extra = {}) {
  const el = { id: surface, ...extra };
  return { el, surface, isNotWord: false };
}

{
  const see = token("see");
  const row = [token("did"), token("you"), see, token("my"), token("last"), token("goal")];
  const hit = LRPH.matchPhrase(row, "did you see", see.el);
  assert.deepEqual(
    hit.map((el) => el.id),
    ["did", "you", "see"]
  );
}

{
  const see = token("see");
  const row = [token("did"), token("you"), see];
  assert.equal(LRPH.matchPhrase(row, "see", see.el), null);
}

{
  assert.equal(LRPH.isPhrasePattern("did you see", "see"), true);
  assert.equal(LRPH.isPhrasePattern("see", "see"), false);
  assert.equal(LRPH.isPhrasePattern("gördün mü", "see"), true);
  assert.equal(LRPH.isPhrasePattern("we're", ""), true);
  assert.equal(LRPH.isPhrasePattern("don't", ""), true);
  assert.equal(LRPH.isPhrasePattern("we", ""), false);
  assert.equal(LRPH.tokenize("Did you see").join("|"), "did|you|see");
  assert.equal(LRPH.tokenEq("see", "see"), true);
  assert.equal(LRPH.tokenEq("see!", "see"), true);
}

{
  assert.equal(LRPH.contractionCueTokens("we're").join("|"), "we|'re");
  assert.equal(LRPH.contractionCueTokens("don’t").join("|"), "do|n't");
  assert.equal(LRPH.contractionCueTokens("we’re").join("|"), "we|'re");
  const weTok = token("we");
  const reTok = token("'re");
  const designing = token("designing");
  assert.equal(
    LRPH.matchPhrase([weTok, reTok, designing], "we're", weTok.el).map((el) => el.id).join("|"),
    "we|'re"
  );
  assert.equal(LRPH.matchPhraseOnLine([weTok, reTok, designing], "we're")[0].phrase, "we're");
  assert.equal(LRPH.matchPhraseOnLine([weTok, reTok], "we’re").length, 1);
}

{
  assert.equal(LRPH.joinDisplayTokens(["do", "n't"]), "don't");
  assert.equal(LRPH.joinDisplayTokens(["get", "started"]), "get started");
  assert.equal(LRPH.joinDisplayTokens(["i", "'m"]), "i'm");
  assert.equal(LRPH.joinDisplayTokens(["let", "'s"]), "let's");
  assert.equal(LRPH.joinDisplayTokens(["you", "'re"]), "you're");
  assert.equal(LRPH.joinDisplayTokens(["we", "'ll"]), "we'll");
  assert.equal(LRPH.joinDisplayTokens(["can", "'t"]), "can't");
  assert.equal(LRPH.joinDisplayTokens(["does", "n't"]), "doesn't");
  assert.equal(LRPH.phraseLabelFromTokens(["do", "n't"], "don't"), "don't");
  assert.equal(LRPH.phraseLabelFromTokens(["do", "n't"], "do n't"), "don't");
}

{
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ "don't": dictPhrase("don't", ["yapma"]) });
  const hits = LRPH.findLinePhrases([token("do"), token("n't")]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].phrase, "don't");
  assert.equal(LRPH.glossEntriesFor(hits)[0].phrase, "don't");
}

{
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({
    "we're": dictPhrase("we're", ["biz", "bizler", "-yoruz"], { src: "we", trans: ["o"] }),
  });
  const hits = LRPH.findLinePhrases([token("we"), token("'re")]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].n, 2);
  assert.equal(hits[0].phrase, "we're");
  const entries = LRPH.glossEntriesFor(hits);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].phrase, "we're");
  assert.equal(entries[0].senses.join("|"), "biz|bizler|-yoruz");
  assert.equal(entries[0].senses.includes("o"), false);
  assert.equal(LRPH.findLinePhrases([token("we're")]).length, 0);
}

{
  LRPH.resetPhraseDict();
  LRPH.ingestPhraseKeys(["we're"]);
  const hits = LRPH.findLinePhrases([token("we"), token("'re")]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].phrase, "we're");
  assert.equal(LRPH.glossEntriesFor(hits).length, 0);
}

{
  assert.equal(LRPH.isHyphenPunct("-"), true);
  assert.equal(LRPH.isHyphenPunct("–"), true);
  assert.equal(LRPH.isHyphenPunct("'re"), false);
  assert.equal(LRPH.isHyphenBoundNgramStart(["human", "-", "led", "discovery"], 2), true);
  assert.equal(LRPH.isHyphenBoundNgramStart(["human", "–", "led", "discovery"], 2), true);
  assert.equal(LRPH.isHyphenBoundNgramStart(["human-", "led", "discovery"], 1), true);
  assert.equal(LRPH.isHyphenBoundNgramStart(["human", "-led", "discovery"], 1), true);
  assert.equal(LRPH.isHyphenBoundNgramStart(["human", "-", "led", "discovery"], 0), false);
  assert.equal(LRPH.isHyphenBoundNgramStart(["the", "led", "discovery"], 1), false);
  assert.equal(LRPH.isHyphenBoundNgramStart(["we", "'re"], 0), false);
  assert.equal(LRPH.isHyphenBoundNgramStart(["we", "'re"], 1), false);
  assert.equal(LRPH.isHyphenBoundNgramStart(["it", "'ll"], 1), false);
  assert.equal(LRPH.isHyphenBoundNgramStart(["do", "n't"], 1), false);
}

{
  function punct(surface) {
    return { el: { id: surface }, surface, isNotWord: true };
  }

  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ leddiscovery: true, "led discovery": true });
  const hyphenRow = [token("human"), punct("-"), token("led"), token("discovery")];
  const hyphenHits = LRPH.findLinePhrases(hyphenRow);
  assert.equal(
    hyphenHits.some((h) => /led/.test(h.phrase)),
    false
  );
  assert.equal(LRPH.glossEntriesFor(hyphenHits).length, 0);
  assert.equal(LRPH.matchPhraseOnLine(hyphenRow, "led discovery").length, 0);
  const ledEl = hyphenRow[2].el;
  assert.equal(LRPH.matchPhrase(hyphenRow, "led discovery", ledEl), null);

  const dashRow = [token("human"), punct("–"), token("led"), token("discovery")];
  assert.equal(LRPH.findLinePhrases(dashRow).some((h) => /led/.test(h.phrase)), false);

  const attachedLeft = [token("human-"), token("led"), token("discovery")];
  assert.equal(LRPH.findLinePhrases(attachedLeft).some((h) => /led/.test(h.phrase)), false);

  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ leddiscovery: ["keşif"] });
  assert.equal(LRPH.findLinePhrases(hyphenRow).length, 0);
  const freeHits = LRPH.findLinePhrases([token("the"), token("led"), token("discovery")]);
  assert.equal(freeHits.length, 1);
  assert.equal(freeHits[0].phrase, "led discovery");

  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ "we're": dictPhrase("we're", ["biz"]) });
  const weHits = LRPH.findLinePhrases([token("we"), token("'re"), token("human"), punct("-"), token("led")]);
  assert.equal(weHits.length, 1);
  assert.equal(weHits[0].phrase, "we're");
  assert.equal(weHits[0].n, 2);
}

{
  assert.equal(LRPH.isCliticBigram(["we", "'re"]), true);
  assert.equal(LRPH.isCliticBigram(["it", "'ll"]), true);
  assert.equal(LRPH.isCliticBigram(["get", "started"]), false);
}

{
  function punct(surface) {
    return { el: { id: surface }, surface, isNotWord: true };
  }

  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({
    "was pondering": ["kafa yoruyordu"],
    "get accepted": ["kabul edilmek"],
    "trying to": ["çalışmak"],
    "a few": ["birkaç"],
    "it works": ["işe yarıyor"],
    "we're": ["biz"],
    leddiscovery: true,
  });

  const ponderHits = LRPH.findLinePhrases([token("he"), token("was"), token("pondering")]).filter(
    (h) => h.phrase === "was pondering"
  );
  if (ponderHits.length) {
    assert.equal(ponderHits[0].els.map((el) => el.id).join("|"), "was|pondering");
  }

  const getHits = LRPH.findLinePhrases([token("get"), token("accepted")]);
  assert.equal(getHits.length, 1);
  assert.equal(getHits[0].phrase, "get accepted");

  const tryingHits = LRPH.findLinePhrases([token("Trying"), token("to"), token("unravel")]);
  assert.equal(tryingHits.some((h) => h.phrase === "Trying to" || h.phrase === "trying to"), true);

  const fewHits = LRPH.findLinePhrases([token("a"), token("few")]);
  assert.equal(fewHits.length, 1);
  assert.equal(fewHits[0].phrase, "a few");

  const worksHits = LRPH.findLinePhrases([token("it"), token("works")]);
  assert.equal(worksHits.length, 1);

  const weHits = LRPH.findLinePhrases([token("we"), token("'re")]);
  assert.equal(weHits.length, 1);
  assert.equal(weHits[0].phrase, "we're");

  const hyphenRow = [token("human"), punct("-"), token("led"), token("discovery")];
  assert.equal(
    LRPH.findLinePhrases(hyphenRow).some((h) => /led/.test(h.phrase)),
    false
  );
}

{
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ "empty pair": true });
  assert.equal(LRPH.findLinePhrases([token("empty"), token("pair")]).length, 0);
}

{
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({
    "the department": dictPhrase("the department", ["bölüm"]),
    "the department store": dictPhrase("the department store", ["büyük mağaza"]),
  });
  const row = [token("the"), token("department"), token("store")];
  const longest = LRPH.findLinePhrases(row);
  assert.equal(longest.length, 1);
  assert.equal(longest[0].phrase, "the department store");
  assert.equal(longest[0].n, 3);
  const all = LRPH.findAllLinePhrases(row);
  const names = all.map((h) => h.phrase);
  assert.equal(names.includes("the department"), true);
  assert.equal(names.includes("the department store"), true);
  const cards = LRPH.glossEntriesFor(all);
  assert.equal(cards.length, 2);
  const cardNames = cards.map((c) => c.phrase);
  assert.equal(cardNames.includes("the department"), true);
  assert.equal(cardNames.includes("the department store"), true);
  assert.equal(
    cards.find((c) => c.phrase === "the department")?.senses.includes("bölüm"),
    true
  );
}

{
  const dump = {
    "was pondering": true,
    "pondering and": true,
    "and trying": true,
    "trying to": ["çalışmak"],
    "to unravel": true,
    "unravel a": true,
    "a deep": true,
    "deep mystery": true,
    "get started": ["başlamak"],
    "better than": ["daha iyi"],
    "we're": true,
    "it'll": ["olacak"],
  };
  const line = [
    token("was"),
    token("pondering"),
    token("and"),
    token("trying"),
    token("to"),
    token("unravel"),
    token("a"),
    token("deep"),
    token("mystery"),
  ];
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases(dump);
  const hits = LRPH.findLinePhrases(line);
  assert.equal(hits.some((h) => /was pondering/i.test(h.phrase)), false);
  assert.equal(hits.some((h) => /pondering and/i.test(h.phrase)), false);
  assert.equal(hits.some((h) => h.phrase === "trying to" || h.phrase === "Trying to"), true);
  assert.equal(LRPH.findLinePhrases([token("get"), token("started")])[0]?.phrase, "get started");
  assert.equal(LRPH.findLinePhrases([token("better"), token("than")])[0]?.phrase, "better than");
  assert.equal(LRPH.findLinePhrases([token("we"), token("'re")])[0]?.phrase, "we're");
  assert.equal(LRPH.findLinePhrases([token("it"), token("'ll")])[0]?.phrase, "it'll");
}

{
  assert.equal(LRPH.isLanguageReactorHost("www.languagereactor.com"), true);
  assert.equal(LRPH.isLanguageReactorHost("languagereactor.com"), true);
  assert.equal(LRPH.isLanguageReactorHost("youtube.com"), false);
  assert.equal(LRPH.isLanguageReactorHost("www.youtube.com"), false);
  assert.equal(LRPH.isLanguageReactorHost("m.youtube.com"), false);
  assert.equal(LRPH.isLanguageReactorHost("youtu.be"), false);
  assert.equal(LRPH.isLanguageReactorHost("netflix.com"), false);
  assert.equal(LRPH.isLanguageReactorHost("www.netflix.com"), false);
  assert.equal(LRPH.isLanguageReactorHost("notlanguagereactor.com"), false);
  assert.equal(LRPH.isLanguageReactorHost("languagereactor.com.evil.example"), false);
  assert.equal(LRPH.isLanguageReactorHost("languagereactor.com."), true);
  assert.equal(LRPH.isLanguageReactorHost("www.languagereactor.com."), true);
}

{
  const el = mockEl("span", "lln-word");
  el.textContent = "See";
  const orig = mockEl("span", "dc-orig");
  orig.textContent = "see";
  el.appendChild(orig);
  assert.equal(LRPH.visibleSurface(el), "see");
}

{
  const root = mockEl("div", "lln-subs");
  const hello = mockEl("span", "lln-word");
  hello.textContent = "hello";
  const bang = mockEl("span", "lln-not-word");
  bang.textContent = "!";
  hello.appendChild(bang);
  const world = mockEl("span", "lln-word");
  world.textContent = "world";
  root.appendChild(hello);
  root.appendChild(world);
  const tok = LRPH.tokensInRoot(root);
  assert.equal(
    tok.some((t) => t.surface === "hello" && !t.isNotWord),
    true
  );
  assert.equal(
    tok.filter((t) => !t.isNotWord).length >= 2,
    true
  );
}

{
  function span(text, style) {
    return {
      nodeType: 1,
      tagName: "SPAN",
      textContent: text,
      children: [],
      isConnected: true,
      classList: { contains: () => false },
      getAttribute: (n) => (n === "style" ? style : null),
      querySelectorAll: () => [],
      cloneNode() {
        return {
          textContent: text,
          querySelectorAll: () => [],
        };
      },
      getBoundingClientRect: () => ({ width: 160, height: 18, top: 0, left: 0, bottom: 18, right: 160 }),
    };
  }

  const phraseStyle =
    "font-size: 16px; box-sizing: border-box; width: 100%; color: #ff89; background: #ffffff18; display: inline-block;";
  const transStyle = "font-size: 18px; white-space: nowrap; opacity: 1";
  const headers = [
    span("did you see", phraseStyle),
    span("gördün mü", transStyle),
    span("see", phraseStyle),
    span("görmek", transStyle),
  ];
  const tt = {
    nodeType: 1,
    isConnected: true,
    classList: { contains: () => false },
    textContent: "did you see gördün mü see görmek",
    querySelectorAll: (sel) => (sel === "span" ? headers : []),
    getBoundingClientRect: () => ({ width: 180, height: 120, top: 0, left: 0, bottom: 120, right: 180 }),
  };
  const parsed = LRPH.phraseFromTooltip(tt, "see");
  assert.equal(parsed.phrase, "did you see");
}

{
  function leaf(text, style) {
    return {
      nodeType: 1,
      tagName: "SPAN",
      textContent: text,
      children: [],
      isConnected: true,
      classList: { contains: () => false },
      getAttribute: (n) => (n === "style" ? style : null),
      querySelectorAll: () => [],
      cloneNode() {
        return { textContent: text, querySelectorAll: () => [] };
      },
      getBoundingClientRect: () => ({ width: 80, height: 16, top: 0, left: 0, bottom: 16, right: 80 }),
    };
  }
  const transStyle = "font-size: 18px; white-space: nowrap; opacity: 1";
  const onlyWord = [leaf("görmek", transStyle), leaf("bakmak", transStyle)];
  const tt = {
    nodeType: 1,
    isConnected: true,
    classList: { contains: () => false },
    textContent: "görmek bakmak seyretmek",
    querySelectorAll: () => onlyWord,
    getBoundingClientRect: () => ({ width: 180, height: 80, top: 0, left: 0, bottom: 80, right: 180 }),
  };
  assert.equal(LRPH.phraseFromTooltip(tt, "see"), null);
}

{
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({
    didyousee: ["gördün mü"],
    see: ["görmek"],
    "last goal": ["son gol"],
  });
  const see = token("see");
  const last = token("last");
  const goal = token("goal");
  const row = [token("did"), token("you"), see, token("my"), last, goal];
  const hits = LRPH.findLinePhrases(row);
  assert.equal(hits.map((h) => h.phrase).join("|"), "did you see|last goal");
  assert.equal(hits[0].els.map((el) => el.id).join("|"), "did|you|see");
  assert.equal(hits.every((h) => h.n >= 2), true);
}

{
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ didyousee: "gördün mü", yousee: "gördün" });
  const see = token("see");
  const row = [token("did"), token("you"), see];
  const hits = LRPH.findLinePhrases(row);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].phrase, "did you see");
}

{
  LRPH.resetPhraseDict();
  LRPH.ingestPhraseKeys(["see", "görmek"]);
  const row = [token("did"), token("you"), token("see")];
  assert.equal(LRPH.findLinePhrases(row).length, 0);
}

{
  const see = token("see");
  const row = [token("did"), token("you"), see, token("my")];
  const hits = LRPH.matchPhraseOnLine(row, "did you see");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].els.map((el) => el.id).join("|"), "did|you|see");
}

{
  function span(text, style) {
    return {
      nodeType: 1,
      tagName: "SPAN",
      textContent: text,
      children: [],
      isConnected: true,
      classList: { contains: () => false },
      closest: () => null,
      getAttribute: (n) => (n === "style" ? style : null),
      querySelectorAll: () => [],
      cloneNode() {
        return { textContent: text, querySelectorAll: () => [] };
      },
      getBoundingClientRect: () => ({ width: 160, height: 18, top: 0, left: 0, bottom: 18, right: 160 }),
    };
  }
  const phraseStyle =
    "font-size: 16px; box-sizing: border-box; width: 100%; color: #ff89; background: #ffffff18; display: inline-block;";
  const transStyle = "font-size: 18px; white-space: nowrap; opacity: 1";
  const transStyle2 = "font-size: 18px; white-space: nowrap; opacity: 0.8";
  const headers = [
    span("included in", phraseStyle),
    span("dahil", transStyle),
    span("içinde yer alan", transStyle2),
    span("included", phraseStyle),
    span("dahil olmak", transStyle),
  ];
  const tt = {
    nodeType: 1,
    isConnected: true,
    classList: { contains: () => false },
    textContent: "included in dahil içinde yer alan included dahil olmak",
    querySelectorAll: (sel) => (sel === "span" ? headers : []),
    getBoundingClientRect: () => ({ width: 180, height: 120, top: 0, left: 0, bottom: 120, right: 180 }),
  };
  assert.equal(LRPH.isDictSenseLine(headers[1]), true);
  assert.equal(LRPH.isDictSenseLine(headers[0]), false);
  assert.equal(LRPH.sensesFromTooltip(tt, "included in").join("|"), "dahil|içinde yer alan");
  assert.equal(
    LRPH.phraseSenseGroupsFromTooltip(tt)
      .map((g) => g.phrase)
      .join("|"),
    "included in"
  );
}

{
  function span(text, style) {
    return {
      nodeType: 1,
      tagName: "SPAN",
      textContent: text,
      children: [],
      isConnected: true,
      classList: { contains: () => false },
      closest: () => null,
      getAttribute: (n) => (n === "style" ? style : null),
      querySelectorAll: () => [],
      cloneNode() {
        return { textContent: text, querySelectorAll: () => [] };
      },
      getBoundingClientRect: () => ({ width: 160, height: 18, top: 0, left: 0, bottom: 18, right: 160 }),
    };
  }
  const phraseStyle =
    "font-size: 16px; box-sizing: border-box; width: 100%; color: #ff89; background: #ffffff18; display: inline-block;";
  const transStyle = "font-size: 18px; white-space: nowrap; opacity: 1";
  const headers = [
    span("we're", phraseStyle),
    span("biz", transStyle),
    span("bizler", transStyle),
    span("-yoruz", transStyle),
    span("we", phraseStyle),
    span("o", transStyle),
  ];
  const tt = {
    nodeType: 1,
    isConnected: true,
    classList: { contains: () => false },
    textContent: "we're biz bizler -yoruz we o",
    querySelectorAll: (sel) => (sel === "span" ? headers : []),
    getBoundingClientRect: () => ({ width: 180, height: 120, top: 0, left: 0, bottom: 120, right: 180 }),
  };
  assert.equal(LRPH.sensesFromTooltip(tt, "we're").join("|"), "biz|bizler|-yoruz");
  assert.equal(LRPH.sensesFromTooltip(tt, "we're").includes("o"), false);
  assert.equal(
    LRPH.phraseSenseGroupsFromTooltip(tt)
      .map((g) => `${g.phrase}:${g.senses.join(",")}`)
      .join("|"),
    "we're:biz,bizler,-yoruz"
  );

  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ "we're": true });
  const we = token("we", {
    querySelector: (sel) => (String(sel).includes("tt") ? tt : null),
  });
  const re = token("'re");
  const hits = LRPH.findLinePhrases([we, re]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].phrase, "we're");
  const entries = LRPH.glossEntriesFor(hits);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].phrase, "we're");
  assert.equal(entries[0].senses.join("|"), "biz|bizler|-yoruz");
  assert.equal(entries[0].senses.includes("o"), false);
  assert.equal(
    entries.some((e) => e.phrase === "we"),
    false
  );
}

{
  function span(text, style) {
    return {
      nodeType: 1,
      tagName: "SPAN",
      textContent: text,
      children: [],
      isConnected: true,
      classList: { contains: () => false },
      closest: () => null,
      getAttribute: (n) => (n === "style" ? style : null),
      querySelectorAll: () => [],
      cloneNode() {
        return { textContent: text, querySelectorAll: () => [] };
      },
      getBoundingClientRect: () => ({ width: 160, height: 18, top: 0, left: 0, bottom: 18, right: 160 }),
    };
  }
  const phraseStyle =
    "font-size: 16px; box-sizing: border-box; width: 100%; color: #ff89; background: #ffffff18; display: inline-block;";
  const transStyle = "font-size: 18px; white-space: nowrap; opacity: 1";
  const headers = [
    span("we're", phraseStyle),
    span("biz", transStyle),
    span("bizler", transStyle),
    span("-yoruz", transStyle),
    span("we", phraseStyle),
    span("o", transStyle),
  ];
  const tt = mockEl("span", "tt");
  tt.textContent = "we're biz bizler -yoruz we o";
  tt.isConnected = true;
  const origQsa = tt.querySelectorAll.bind(tt);
  tt.querySelectorAll = (sel) => (String(sel) === "span" ? headers : origQsa(sel));
  sandbox.document.body.appendChild(tt);

  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ "we’re": true });
  const we = token("we");
  const re = token("'re");
  assert.equal(we.el.querySelector == null, true);
  const hits = LRPH.findLinePhrases([we, re]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].n, 2);
  assert.equal(hits[0].phrase, "we're");
  assert.equal(LRPH.hoverDictEl(we.el), null);
  const entries = LRPH.glossEntriesFor(hits);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].phrase, "we're");
  assert.equal(entries[0].senses.join("|"), "biz|bizler|-yoruz");
  assert.equal(entries[0].senses.includes("we"), false);

  LRPH.setGlossPanelOpen(true);
  const mount = mockEl("div", "html5-video-player");
  sandbox.document.body.appendChild(mount);
  const watchBar = mountWatchPlayerToolbar();
  const watchHost = mountWatchSubtitleHost();
  const panel = LRPH.fillGlossPanel(mount, entries);
  assert.equal(Boolean(panel), true);
  assert.equal(panel.querySelector(".lrph-glosses-phrase").textContent, "we're");
  const senseText = [...panel.querySelectorAll(".lrph-glosses-sense")].map((el) => el.textContent).join("|");
  assert.equal(senseText, "biz|bizler|-yoruz");

  panel.remove();
  tt.remove();
  mount.remove();
  watchHost.remove();
  watchBar.remove();
  LRPH.clearGlossPanels();
}

{
  function span(text, style) {
    return {
      nodeType: 1,
      tagName: "SPAN",
      textContent: text,
      children: [],
      isConnected: true,
      classList: { contains: () => false },
      closest: () => null,
      getAttribute: (n) => (n === "style" ? style : null),
      querySelectorAll: () => [],
      cloneNode() {
        return { textContent: text, querySelectorAll: () => [] };
      },
      getBoundingClientRect: () => ({ width: 160, height: 18, top: 0, left: 0, bottom: 18, right: 160 }),
    };
  }
  const phraseStyle =
    "font-size: 16px; box-sizing: border-box; width: 100%; color: #ff89; background: #ffffff18; display: inline-block;";
  const transStyle = "font-size: 18px; white-space: nowrap; opacity: 1";
  const transStyle2 = "font-size: 18px; white-space: nowrap; opacity: 0.8";
  const headers = [
    span("it'll", phraseStyle),
    span("olacak", transStyle),
    span("it", phraseStyle),
    span("o", transStyle),
    span("bu", transStyle2),
    span("şu", transStyle2),
  ];
  const tt = mockEl("span", "tt");
  tt.textContent = "it'll olacak it o bu şu";
  tt.isConnected = true;
  const origQsa = tt.querySelectorAll.bind(tt);
  tt.querySelectorAll = (sel) => (String(sel) === "span" ? headers : origQsa(sel));
  sandbox.document.body.appendChild(tt);

  assert.equal(LRPH.sensesFromTooltip(tt, "it'll").join("|"), "olacak");
  assert.equal(LRPH.sensesFromTooltip(tt, "it").join("|"), "");
  assert.equal(
    LRPH.phraseSenseGroupsFromTooltip(tt)
      .map((g) => `${g.phrase}:${g.senses.join(",")}`)
      .join("|"),
    "it'll:olacak"
  );

  const unstyledHeaders = [
    span("it'll", phraseStyle),
    span("olacak", transStyle),
    span("it", transStyle),
    span("o", transStyle),
    span("bu", transStyle2),
    span("şu", transStyle2),
  ];
  const unstyledTt = {
    nodeType: 1,
    isConnected: true,
    classList: { contains: () => false },
    textContent: "it'll olacak it o bu şu",
    querySelectorAll: (sel) => (sel === "span" ? unstyledHeaders : []),
  };
  assert.equal(LRPH.sensesFromTooltip(unstyledTt, "it'll").join("|"), "olacak");

  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ "it'll": ["olacak"] });
  assert.equal(LRPH.sensesForPhrase("it'll").join("|"), "olacak");
  LRPH.harvestFilledTooltips();
  assert.equal(LRPH.sensesForPhrase("it'll").join("|"), "olacak");
  const itTok = token("it");
  const llTok = token("'ll");
  const hits = LRPH.findLinePhrases([itTok, llTok]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].phrase, "it'll");
  const afterHover = LRPH.glossEntriesFor(hits);
  assert.equal(afterHover.length, 1);
  assert.equal(afterHover[0].phrase, "it'll");
  assert.equal(afterHover[0].senses.join("|"), "olacak");
  assert.equal(afterHover[0].senses.includes("o"), false);
  assert.equal(afterHover[0].senses.includes("bu"), false);
  assert.equal(afterHover[0].senses.includes("şu"), false);
  assert.equal(
    afterHover.some((e) => e.phrase === "it"),
    false
  );

  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ "it'll": true });
  const fromTt = LRPH.glossEntriesFor(hits);
  assert.equal(fromTt.length, 1);
  assert.equal(fromTt[0].senses.join("|"), "olacak");
  assert.equal(fromTt[0].senses.includes("o"), false);

  tt.remove();
}

{
  function span(text, style) {
    return {
      nodeType: 1,
      tagName: "SPAN",
      textContent: text,
      children: [],
      isConnected: true,
      classList: { contains: () => false },
      closest: () => null,
      getAttribute: (n) => (n === "style" ? style : null),
      querySelectorAll: () => [],
      cloneNode() {
        return { textContent: text, querySelectorAll: () => [] };
      },
      getBoundingClientRect: () => ({ width: 160, height: 18, top: 0, left: 0, bottom: 18, right: 160 }),
    };
  }
  const phraseStyle =
    "font-size: 16px; box-sizing: border-box; width: 100%; color: #ff89; background: #ffffff18; display: inline-block;";
  const transStyle = "font-size: 18px; white-space: nowrap; opacity: 1";
  const transStyle2 = "font-size: 18px; white-space: nowrap; opacity: 0.8";

  function mockTt(headers, text) {
    const tt = mockEl("span", "tt");
    tt.textContent = text;
    tt.isConnected = true;
    const origQsa = tt.querySelectorAll.bind(tt);
    tt.querySelectorAll = (sel) => (String(sel) === "span" ? headers : origQsa(sel));
    sandbox.document.body.appendChild(tt);
    return tt;
  }

  const pairHeaders = [
    span("get accepted", phraseStyle),
    span("kabul edilmek", transStyle),
    span("get", phraseStyle),
    span("almak", transStyle),
    span("olmak", transStyle2),
  ];
  const pairTt = mockTt(pairHeaders, "get accepted kabul edilmek get almak olmak");
  assert.equal(LRPH.sensesFromTooltip(pairTt, "get accepted").join("|"), "kabul edilmek");
  assert.equal(LRPH.sensesFromTooltip(pairTt, "get").join("|"), "");
  assert.equal(
    LRPH.phraseSenseGroupsFromTooltip(pairTt)
      .map((g) => `${g.phrase}:${g.senses.join(",")}`)
      .join("|"),
    "get accepted:kabul edilmek"
  );

  const unstyledPair = {
    nodeType: 1,
    isConnected: true,
    classList: { contains: () => false },
    textContent: "get accepted kabul edilmek get almak olmak",
    querySelectorAll: (sel) =>
      sel === "span"
        ? [
            span("get accepted", phraseStyle),
            span("kabul edilmek", transStyle),
            span("get", transStyle),
            span("almak", transStyle),
            span("olmak", transStyle2),
          ]
        : [],
  };
  assert.equal(LRPH.sensesFromTooltip(unstyledPair, "get accepted").join("|"), "kabul edilmek");

  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ "get accepted": ["kabul edilmek", "almak", "olmak"] });
  assert.equal(LRPH.sensesForPhrase("get accepted").join("|"), "kabul edilmek");
  LRPH.harvestFilledTooltips();
  pairTt.remove();
  assert.equal(LRPH.sensesForPhrase("get accepted").join("|"), "kabul edilmek");

  LRPH.resetPhraseDict();
  assert.equal(sandbox.document.querySelectorAll(".tt").length, 0);
  LRPH.ingestPhrases({ "get accepted": ["kabul edilmek"] });
  assert.equal(LRPH.sensesForPhrase("get accepted").join("|"), "kabul edilmek");
  assert.equal(LRPH.sensesForPhrase("get accepted").includes("almak"), false);
  assert.equal(
    LRPH.glossEntriesFor([{ start: 0, n: 2, phrase: "get accepted", els: [] }])[0].senses.join("|"),
    "kabul edilmek"
  );
  assert.equal(LRPH.findLinePhrases([token("get"), token("accepted")]).length, 1);

  const cliticHeaders = [
    span("it's", phraseStyle),
    span("bu", transStyle),
    span("it", phraseStyle),
    span("o", transStyle),
    span("bu", transStyle2),
    span("şu", transStyle2),
  ];
  const cliticTt = mockTt(cliticHeaders, "it's bu it o bu şu");
  assert.equal(LRPH.sensesFromTooltip(cliticTt, "it's").join("|"), "bu");
  assert.equal(LRPH.sensesFromTooltip(cliticTt, "it’s").join("|"), "bu");
  assert.equal(LRPH.sensesFromTooltip(cliticTt, "it").join("|"), "");

  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ "it's": ["bu", "it", "o", "bu", "şu"] });
  assert.equal(LRPH.sensesForPhrase("it's").join("|"), "bu");
  assert.equal(LRPH.sensesForPhrase("it’s").join("|"), "bu");
  const cliticHits = LRPH.findLinePhrases([token("it"), token("'s")]);
  assert.equal(cliticHits.length, 1);
  assert.equal(cliticHits[0].phrase, "it's");
  const cliticEntries = LRPH.glossEntriesFor(cliticHits);
  assert.equal(cliticEntries.length, 1);
  assert.equal(cliticEntries[0].phrase, "it's");
  assert.equal(cliticEntries[0].senses.join("|"), "bu");
  cliticTt.remove();

  const curlyHeaders = [
    span("it’s", phraseStyle),
    span("bu", transStyle),
    span("it", phraseStyle),
    span("o", transStyle),
    span("bu", transStyle2),
    span("şu", transStyle2),
  ];
  const curlyTt = mockTt(curlyHeaders, "it’s bu it o bu şu");
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ "it's": ["bu", "o", "şu"] });
  assert.equal(LRPH.sensesForPhrase("it's").join("|"), "bu");
  curlyTt.remove();

  const llHeaders = [
    span("it'll", phraseStyle),
    span("olacak", transStyle),
    span("it", phraseStyle),
    span("o", transStyle),
    span("bu", transStyle2),
    span("şu", transStyle2),
  ];
  const llTt = mockTt(llHeaders, "it'll olacak it o bu şu");
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ "it'll": ["olacak", "o", "bu", "şu"] });
  assert.equal(LRPH.sensesForPhrase("it'll").join("|"), "olacak");
  llTt.remove();

  LRPH.resetPhraseDict();
  assert.equal(sandbox.document.querySelectorAll(".tt").length, 0);
  LRPH.ingestPhrases({ "it's": ["bu", "it", "o", "bu", "şu"] });
  assert.equal(LRPH.sensesForPhrase("it's").join("|"), "bu");
  assert.equal(LRPH.sensesForPhrase("it's").includes("o"), false);
  assert.equal(LRPH.sensesForPhrase("it's").includes("şu"), false);
  assert.equal(LRPH.glossEntriesFor([{ start: 0, n: 2, phrase: "it's", els: [] }])[0].senses.join("|"), "bu");
  assert.equal(LRPH.findLinePhrases([token("it"), token("'s")]).length, 1);

  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({
    "it's": [
      { src: "it's", trans: ["bu"] },
      { src: "it", trans: ["o", "bu", "şu"] },
    ],
  });
  assert.equal(LRPH.sensesForPhrase("it's").join("|"), "bu");
  assert.equal(LRPH.sensesForPhrase("it’s").join("|"), "bu");
  assert.equal(LRPH.sensesForPhrase("it's").includes("o"), false);

  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({
    "phrase a": [
      { src: "phrase a", trans: ["sense A1", "sense A2"] },
      { src: "lemma b", trans: ["sense B1", "sense B2"] },
    ],
  });
  assert.equal(LRPH.sensesForPhrase("phrase a").join("|"), "sense A1|sense A2");
  assert.equal(LRPH.sensesForPhrase("phrase a").includes("sense B1"), false);
  assert.equal(LRPH.glossEntriesFor([{ start: 0, n: 2, phrase: "phrase a", els: [] }])[0].senses.join("|"), "sense A1|sense A2");

  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({
    "phrase a": {
      trans: [
        { src: "phrase a", trans: ["sense A1"] },
        { src: "lemma b", trans: ["sense B1", "sense B2"] },
      ],
    },
  });
  assert.equal(LRPH.sensesForPhrase("phrase a").join("|"), "sense A1");
  assert.equal(LRPH.sensesForPhrase("phrase a").includes("sense B1"), false);

  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({
    "phrase a": {
      src: "phrase a",
      trans: ["sense A1"],
      extra: { src: "lemma b", trans: ["sense B1", "sense B2"] },
    },
  });
  assert.equal(LRPH.sensesForPhrase("phrase a").join("|"), "sense A1");
  assert.equal(LRPH.sensesForPhrase("phrase a").includes("sense B1"), false);

  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({
    "phrase a": ["sense A1", { src: "lemma b", trans: ["sense B1", "sense B2"] }],
  });
  assert.equal(LRPH.sensesForPhrase("phrase a").join("|"), "sense A1");
  assert.equal(LRPH.sensesForPhrase("phrase a").includes("sense B1"), false);

  LRPH.resetPhraseDict();
  assert.equal(sandbox.document.querySelectorAll(".tt").length, 0);
  LRPH.ingestPhrases({ "phrase a": ["sense A1", "sense B1", "sense B2"] });
  assert.equal(LRPH.sensesForPhrase("phrase a").join("|"), "sense A1|sense B1|sense B2");
  assert.equal(
    LRPH.glossEntriesFor([{ start: 0, n: 2, phrase: "phrase a", els: [] }])[0].senses.join("|"),
    "sense A1|sense B1|sense B2"
  );
  assert.equal(LRPH.findLinePhrases([token("phrase"), token("a")]).length, 1);

  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({
    "it'll": dictPhrase("it'll", ["olacak"], { src: "it", trans: ["o", "bu", "şu"] }),
    "we're": dictPhrase("we're", ["biz"], { src: "we", trans: ["o"] }),
    "don't": dictPhrase("don't", ["yapma"], { src: "do", trans: ["yapmak"] }),
    "get accepted": dictPhrase("get accepted", ["kabul edilmek"], { src: "get", trans: ["almak", "olmak"] }),
  });
  assert.equal(LRPH.sensesForPhrase("it'll").join("|"), "olacak");
  assert.equal(LRPH.sensesForPhrase("we're").join("|"), "biz");
  assert.equal(LRPH.sensesForPhrase("don't").join("|"), "yapma");
  assert.equal(LRPH.sensesForPhrase("get accepted").join("|"), "kabul edilmek");
  assert.equal(LRPH.sensesForPhrase("it'll").includes("o"), false);
  assert.equal(LRPH.sensesForPhrase("we're").includes("o"), false);
  assert.equal(LRPH.sensesForPhrase("get accepted").includes("almak"), false);

  LRPH.resetPhraseDict();
  LRPH.ingestPhrases([
    { src: "it's", trans: ["bu"] },
    { src: "it", trans: ["o", "bu", "şu"] },
  ]);
  assert.equal(LRPH.sensesForPhrase("it's").join("|"), "bu");
  assert.equal(LRPH.sensesForPhrase("it's").includes("o"), false);
}

{
  // Recorded-like YouTube prefetch: POST /base_dict_getHoverDictEntriesForSubs
  // returns { status, data: { phrases: { [src]: string[] } } }. pageScript wraps
  // each value as { src, trans }. Word/lemma senses are not in this map.
  const recordedPhrases = {
    "it's": ["bu"],
    "get accepted": ["kabul edilmek"],
    "included in": ["dahil", "içinde yer alan"],
  };
  LRPH.resetPhraseDict();
  assert.equal(sandbox.document.querySelectorAll(".tt").length, 0);
  LRPH.ingestPhrases(recordedPhrases);
  assert.equal(LRPH.sensesForPhrase("it's").join("|"), "bu");
  assert.equal(LRPH.sensesForPhrase("get accepted").join("|"), "kabul edilmek");
  assert.equal(LRPH.sensesForPhrase("included in").join("|"), "dahil|içinde yer alan");
  const recordedHits = LRPH.findLinePhrases([token("it"), token("'s")]);
  const recordedCards = LRPH.glossEntriesFor(recordedHits);
  assert.equal(recordedCards.length, 1);
  assert.equal(recordedCards[0].senses.join("|"), "bu");
  assert.equal(recordedCards[0].senses.includes("o"), false);

  LRPH.resetPhraseDict();
  assert.equal(sandbox.document.querySelectorAll(".tt").length, 0);
  LRPH.ingestPhrases({
    "it's": dictPhrase("it's", ["bu"], { src: "it", trans: ["o", "bu", "şu"] }),
  });
  const structuredHits = LRPH.findLinePhrases([token("it"), token("'s")]);
  const structuredCards = LRPH.glossEntriesFor(structuredHits);
  assert.equal(structuredCards.length, 1);
  assert.equal(structuredCards[0].phrase, "it's");
  assert.equal(structuredCards[0].senses.join("|"), "bu");
  assert.equal(structuredCards[0].senses.includes("o"), false);

  function span(text, style) {
    return {
      nodeType: 1,
      tagName: "SPAN",
      textContent: text,
      children: [],
      isConnected: true,
      classList: { contains: () => false },
      closest: () => null,
      getAttribute: (n) => (n === "style" ? style : null),
      querySelectorAll: () => [],
      cloneNode() {
        return { textContent: text, querySelectorAll: () => [] };
      },
      getBoundingClientRect: () => ({ width: 160, height: 18, top: 0, left: 0, bottom: 18, right: 160 }),
    };
  }
  const phraseStyle =
    "font-size: 16px; box-sizing: border-box; width: 100%; color: #ff89; background: #ffffff18; display: inline-block;";
  const transStyle = "font-size: 18px; white-space: nowrap; opacity: 1";
  const transStyle2 = "font-size: 18px; white-space: nowrap; opacity: 0.8";
  const twoHeader = [
    span("it's", phraseStyle),
    span("bu", transStyle),
    span("it", phraseStyle),
    span("o", transStyle),
    span("bu", transStyle2),
    span("şu", transStyle2),
  ];
  const openTt = mockEl("span", "tt");
  openTt.textContent = "it's bu it o bu şu";
  openTt.isConnected = true;
  const origQsa = openTt.querySelectorAll.bind(openTt);
  openTt.querySelectorAll = (sel) => (String(sel) === "span" ? twoHeader : origQsa(sel));
  sandbox.document.body.appendChild(openTt);
  const afterOpen = LRPH.glossEntriesFor(structuredHits);
  assert.equal(afterOpen.length, 1);
  assert.equal(afterOpen[0].senses.join("|"), "bu");
  assert.equal(afterOpen[0].senses.includes("o"), false);
  assert.equal(afterOpen[0].senses.includes("şu"), false);
  openTt.remove();
}

{
  assert.equal(LRPH.glossEntriesFor([]).length, 0);
}

{
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({
    includedin: dictPhrase("included in", ["dahil", "içinde yer alan"]),
    talkabout: dictPhrase("talk about", ["konuşmak"]),
    backontrack: dictPhrase("back on track", ["rayına oturtmak"]),
  });
  const cue = [
    { start: 0, n: 3, phrase: "back on track", els: [] },
    { start: 8, n: 2, phrase: "talk about", els: [] },
  ];
  const entries = LRPH.glossEntriesFor(cue);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].phrase, "back on track");
  assert.equal(entries[0].senses.join("|"), "rayına oturtmak");
  assert.equal(entries[1].phrase, "talk about");
  assert.equal(entries[1].senses.join("|"), "konuşmak");
  const included = LRPH.glossEntriesFor([{ start: 0, n: 2, phrase: "included in", els: [] }]);
  assert.equal(included.length, 1);
  assert.equal(included[0].senses.join("|"), "dahil|içinde yer alan");
  const nextCue = LRPH.glossEntriesFor([{ start: 0, n: 2, phrase: "talk about", els: [] }]);
  assert.equal(nextCue.length, 1);
  assert.equal(nextCue[0].phrase, "talk about");
  assert.equal(
    nextCue.some((e) => e.phrase === "back on track" || e.phrase === "included in"),
    false
  );
}

{
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ lonelyphrase: true });
  assert.equal(LRPH.sensesForPhrase("lonely phrase").join("|"), "");
  assert.equal(LRPH.glossEntriesFor([{ start: 0, n: 2, phrase: "lonely phrase", els: [] }]).length, 0);
}

{
  LRPH.setGlossPanelOpen(true);
  const mount = mockEl("div", "html5-video-player");
  sandbox.document.body.appendChild(mount);
  const watchBar = mountWatchPlayerToolbar();
  const watchHost = mountWatchSubtitleHost();
  const emptyPanel = LRPH.fillGlossPanel(mount, []);
  assert.equal(Boolean(emptyPanel), true);
  assertGlossDockEmpty();
  const emptyOnBtn = watchBar.querySelector(".lrph-toolbar-btn");
  assert.equal(Boolean(emptyOnBtn), true);
  assert.equal(emptyOnBtn.classList.contains("is-on"), true);
  assert.equal(emptyOnBtn.classList.contains("is-open"), false);
  assert.equal(emptyOnBtn.classList.contains("is-off"), false);
  assert.equal(LRPH.isGlossPanelOpen(), true);
  assert.equal(LRPH.isGlossSidebarOpen(), true);

  const panel = LRPH.fillGlossPanel(mount, [
    { phrase: "included in", senses: ["dahil", "içinde yer alan"] },
    { phrase: "talk about", senses: ["konuşmak"] },
  ]);
  assert.equal(Boolean(panel), true);
  assert.equal(panel.classList.contains("lrph-glosses"), true);
  assert.equal(panel.classList.contains("is-collapsed"), false);
  assert.equal(panel.classList.contains("is-closed"), false);
  assert.equal(LRPH.isGlossPanelOpen(), true);
  assert.equal(LRPH.isGlossSidebarOpen(), true);
  assert.equal(panel.parentElement, sandbox.document.body);
  assert.equal(Boolean(panel.querySelector(".lrph-switch")), false);
  assert.equal(Boolean(panel.querySelector(".lrph-sidebar-header")), false);
  assert.equal(Boolean(panel.querySelector(".lrph-sidebar-title")), false);
  assert.equal(Boolean(panel.querySelector(".lrph-gloss-toggle")), false);
  assert.equal(Boolean(panel.querySelector(".lrph-sidebar-close")), false);
  assert.equal(Boolean(panel.querySelector(".lrph-glosses-bar")), false);
  assert.equal(Boolean(panel.querySelector(".lrph-glosses-empty")), false);
  assert.equal(Boolean(panel.querySelector(".lrph-glosses-scan")), false);
  const list = panel.querySelector(".lrph-glosses-list");
  assert.equal(list.classList.contains("is-empty"), false);
  assert.equal(panel.classList.contains("is-empty"), false);
  assert.equal(list.parentElement, panel);
  const items = panel.querySelectorAll(".lrph-glosses-item");
  assert.equal(items.length, 2);
  assert.equal(items[0].parentElement.classList.contains("lrph-glosses-list"), true);
  assert.equal(items[1].parentElement, items[0].parentElement);
  assert.equal(items[0].querySelector(".lrph-glosses-phrase").textContent, "included in");
  const senses = items[0].querySelectorAll(".lrph-glosses-sense");
  assert.equal(senses.length, 2);
  assert.equal(senses[0].tagName, "DIV");
  assert.equal(senses[0].parentElement.tagName, "DIV");
  assert.equal(senses[0].parentElement.classList.contains("lrph-glosses-meanings"), true);
  assert.equal(senses[0].textContent, "dahil");
  assert.equal(senses[1].textContent, "içinde yer alan");
  assert.equal(items[1].querySelector(".lrph-glosses-phrase").textContent, "talk about");
  assert.equal(items[1].querySelectorAll(".lrph-glosses-sense").length, 1);

  LRPH.fillGlossPanel(mount, [{ phrase: "talk about", senses: ["konuşmak"] }]);
  const nextItems = panel.querySelectorAll(".lrph-glosses-item");
  assert.equal(nextItems.length, 1);
  assert.equal(nextItems[0].querySelector(".lrph-glosses-phrase").textContent, "talk about");
  assert.equal(
    [...panel.querySelectorAll(".lrph-glosses-phrase")].some((el) => el.textContent === "included in"),
    false
  );

  LRPH.fillGlossPanel(mount, []);
  assertGlossDockEmpty();
  assert.equal(LRPH.isGlossSidebarOpen(), true);
  assert.equal(Boolean(watchBar.querySelector(".lrph-toolbar-btn")), true);
  assert.equal(watchBar.querySelector(".lrph-toolbar-btn").classList.contains("is-on"), true);
  assert.equal(watchBar.querySelector(".lrph-toolbar-btn").classList.contains("is-open"), false);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-switch")), false);

  const back = LRPH.fillGlossPanel(mount, [{ phrase: "talk about", senses: ["konuşmak"] }]);
  assert.equal(Boolean(back), true);
  assert.equal(LRPH.isGlossSidebarOpen(), true);
  assert.equal(back.querySelector(".lrph-glosses-phrase").textContent, "talk about");
  LRPH.clearGlossPanels();
  mount.remove();
  watchHost.remove();
  watchBar.remove();
}

{
  LRPH.setGlossPanelOpen(true);
  const mount = mockEl("div", "html5-video-player");
  sandbox.document.body.appendChild(mount);
  const watchBar = mountWatchPlayerToolbar();
  const watchHost = mountWatchSubtitleHost();
  const panel = LRPH.fillGlossPanel(mount, [{ phrase: "coming your way", senses: ["yolda", "yakında geliyor", "sana geliyor"] }]);
  assert.equal(panel.classList.contains("is-collapsed"), false);
  assert.equal(panel.querySelector(".lrph-glosses-list").getAttribute("aria-hidden"), "false");
  const senses = panel.querySelectorAll(".lrph-glosses-sense");
  assert.equal(senses.length, 3);
  assert.equal(senses.every((el) => el.tagName === "DIV"), true);
  assert.equal(senses.every((el) => el.parentElement.classList.contains("lrph-glosses-meanings")), true);
  assert.equal(LRPH.GLOSS_ICON_PATH, "icons/icon48.png");
  assert.equal(Boolean(panel.querySelector(".lrph-switch")), false);
  assert.equal(Boolean(panel.querySelector(".lrph-gloss-toggle")), false);
  assert.equal(Boolean(panel.querySelector(".lrph-sidebar-header")), false);

  LRPH.setGlossSidebarOpen(false);
  assert.equal(LRPH.isGlossPanelOpen(), false);
  assert.equal(LRPH.isGlossSidebarOpen(), false);
  assertGlossDockHidden();
  assert.equal(Boolean(watchBar.querySelector(".lrph-toolbar-btn")), true);
  assert.equal(watchBar.querySelector(".lrph-toolbar-btn").classList.contains("is-on"), false);
  assert.equal(watchBar.querySelector(".lrph-toolbar-btn").classList.contains("is-open"), false);
  assert.equal(watchBar.querySelector(".lrph-toolbar-btn").classList.contains("is-off"), false);

  LRPH.fillGlossPanel(mount, [{ phrase: "get started", senses: ["başlamak"] }]);
  assert.equal(LRPH.isGlossPanelOpen(), false);
  assertGlossDockHidden();
  assert.equal(watchBar.querySelector(".lrph-toolbar-btn").classList.contains("is-on"), false);

  LRPH.fillGlossPanel(mount, []);
  assertGlossDockHidden();
  assert.equal(LRPH.isGlossPanelOpen(), false);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-switch")), false);

  const again = LRPH.fillGlossPanel(mount, [{ phrase: "get started", senses: ["başlamak"] }]);
  assert.equal(again, null);
  assert.equal(LRPH.isGlossPanelOpen(), false);
  assertGlossDockHidden();

  LRPH.setGlossPanelOpen(true);
  const opened = sandbox.document.body.querySelector(".lrph-glosses");
  assert.equal(Boolean(opened), true);
  assert.equal(watchBar.querySelector(".lrph-toolbar-btn").classList.contains("is-on"), true);
  assert.equal(opened.classList.contains("is-collapsed"), false);
  assert.equal(opened.classList.contains("is-closed"), false);
  assert.equal(opened.querySelector(".lrph-glosses-phrase").textContent, "get started");
  LRPH.clearGlossPanels();
  assert.equal(LRPH.isGlossPanelOpen(), true);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-switch")), false);
  mount.remove();
  watchHost.remove();
  watchBar.remove();
}

{
  LRPH.setGlossPanelOpen(true);
  const mount = mockEl("div", "html5-video-player");
  sandbox.document.body.appendChild(mount);
  const watchBar = mountWatchPlayerToolbar();
  const watchHost = mountWatchSubtitleHost();
  const many = [];
  for (let i = 0; i < 24; i++) {
    many.push({ phrase: `phrase ${i}`, senses: [`sense ${i}`] });
  }
  const panel = LRPH.fillGlossPanel(mount, many);
  assert.equal(Boolean(panel), true);
  assert.equal(panel.querySelectorAll(".lrph-glosses-item").length, 24);
  const list = panel.querySelector(".lrph-glosses-list");
  assert.equal(Boolean(list), true);
  assert.equal(panel.style.maxHeight, "720px");
  assert.equal(list.parentElement, panel);
  LRPH.clearGlossPanels();
  mount.remove();
  watchHost.remove();
  watchBar.remove();
}

{
  assert.equal(LRPH.MAIN_VIDEO_SELECTORS.some((s) => s.includes("html5-main-video")), true);
  assert.equal(LRPH.EMBED_PLAYER_SELECTORS.some((s) => s.includes("youtube.com/embed")), true);
}

{
  function iframe(extra = {}) {
    return {
      tagName: "IFRAME",
      isConnected: true,
      src: "https://www.youtube.com/embed/abc",
      getAttribute: (n) => (n === "src" ? "https://www.youtube.com/embed/abc" : n === "title" ? "YouTube video player" : null),
      classList: { contains: () => false },
      closest: () => null,
      getBoundingClientRect: () => ({ top: 80, left: 200, right: 1000, bottom: 530, width: 800, height: 450 }),
      ...extra,
    };
  }
  const yt = iframe();
  const tiny = iframe({
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 40, bottom: 40, width: 40, height: 40 }),
  });
  const wrap = {
    tagName: "DIV",
    isConnected: true,
    classList: { contains: () => false },
    closest: () => null,
    getBoundingClientRect: () => ({ top: 70, left: 180, right: 1020, bottom: 700, width: 840, height: 630 }),
  };
  assert.equal(LRPH.isPlayerIframe(yt), true);
  assert.equal(LRPH.pickPlayerSurface([tiny, yt, wrap]), yt);
  assert.equal(LRPH.pickPlayerSurface([tiny]), null);
  assert.equal(LRPH.pickPlayerSurface([wrap]), wrap);

  const frame = mockEl("iframe");
  frame.src = "https://www.youtube.com/embed/abc";
  frame.setAttribute("src", "https://www.youtube.com/embed/abc");
  frame.setAttribute("title", "YouTube video player");
  frame.getBoundingClientRect = () => ({
    top: 80, left: 200, right: 1000, bottom: 530, width: 800, height: 450, x: 200, y: 80,
  });
  sandbox.document.body.appendChild(frame);
  assert.equal(LRPH.findGlossSurface(), frame);
  frame.remove();

  const mediaWrap = mockEl("div", "media-wrap");
  const blank = mockEl("iframe");
  blank.src = "about:blank";
  blank.setAttribute("src", "about:blank");
  blank.getBoundingClientRect = () => ({
    top: 80, left: 200, right: 1000, bottom: 530, width: 800, height: 450, x: 200, y: 80,
  });
  mediaWrap.appendChild(blank);
  sandbox.document.body.appendChild(mediaWrap);
  assert.equal(LRPH.isPlayerIframe(blank), true);
  assert.equal(LRPH.findGlossSurface(), blank);
  mediaWrap.remove();
}

{
  assert.equal(LRPH.MAIN_TOOLBAR_SEL, ".main-toolbar");
  const bar = mockEl("div", "main-toolbar");
  const ap = mockEl("button");
  ap.setAttribute("aria-label", "Auto-pause");
  bar.appendChild(ap);
  sandbox.document.body.appendChild(bar);
  assert.equal(LRPH.findMainToolbar(), bar);

  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ didyou: dictPhrase("did you", ["gördün"]) });
  LRPH.setGlossPanelOpen(true);
  const cueRoot = mockEl("div", "lln-subs");
  cueRoot.isConnected = true;
  sandbox.document.body.appendChild(cueRoot);
  LRPH.syncGlossPanels([
    [cueRoot, [{ start: 0, n: 2, phrase: "did you", els: [] }]],
  ]);
  const btn = bar.querySelector(".lrph-toolbar-btn");
  assert.equal(Boolean(btn), true);
  assert.equal(btn.parentElement, bar);
  assert.equal(bar.firstChild, btn);
  assert.equal(btn.classList.contains("is-on"), true);
  assert.equal(btn.classList.contains("is-open"), false);
  assert.equal(btn.classList.contains("is-off"), false);
  assert.equal(btn.getAttribute("aria-expanded"), "true");
  const panel = sandbox.document.body.querySelector(".lrph-glosses");
  assert.equal(Boolean(panel), true);
  assert.equal(panel.classList.contains("is-closed"), false);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-switch")), false);
  assert.equal(Boolean(panel.querySelector(".lrph-sidebar-header")), false);
  assert.equal(panel.querySelector(".lrph-glosses-phrase").textContent, "did you");

  btn.click();
  assert.equal(LRPH.isGlossPanelOpen(), false);
  assert.equal(LRPH.isGlossSidebarOpen(), false);
  assertGlossDockHidden();
  assert.equal(btn.classList.contains("is-on"), false);
  assert.equal(btn.classList.contains("is-open"), false);
  assert.equal(btn.classList.contains("is-off"), false);

  LRPH.syncGlossPanels([
    [cueRoot, [{ start: 0, n: 2, phrase: "did you", els: [] }]],
  ]);
  assert.equal(LRPH.isGlossSidebarOpen(), false);
  assertGlossDockHidden();
  assert.equal(btn.classList.contains("is-on"), false);

  btn.click();
  assert.equal(LRPH.isGlossSidebarOpen(), true);
  const reopened = sandbox.document.body.querySelector(".lrph-glosses");
  assert.equal(Boolean(reopened), true);
  assert.equal(reopened.classList.contains("is-closed"), false);
  assert.equal(btn.classList.contains("is-on"), true);
  assert.equal(btn.classList.contains("is-open"), false);

  btn.remove();
  assert.equal(Boolean(bar.querySelector(".lrph-toolbar-btn")), false);
  LRPH.ensureToolbarButton();
  assert.equal(Boolean(bar.querySelector(".lrph-toolbar-btn")), true);
  assert.equal(bar.querySelector(".lrph-toolbar-btn").classList.contains("is-on"), true);

  LRPH.syncGlossPanels([]);
  assert.equal(Boolean(bar.querySelector(".lrph-toolbar-btn")), true);
  assert.equal(LRPH.isGlossSidebarOpen(), true);
  assertGlossDockEmpty();
  assert.equal(bar.querySelector(".lrph-toolbar-btn").classList.contains("is-on"), true);
  assert.equal(bar.querySelector(".lrph-toolbar-btn").classList.contains("is-open"), false);
  assert.equal(bar.querySelector(".lrph-toolbar-btn").classList.contains("is-off"), false);

  bar.remove();
  LRPH.ensureToolbarButton();
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-toolbar-btn")), false);
  LRPH.clearGlossPanels();
  cueRoot.remove();
}

{
  const bar = mountWatchPlayerToolbar();
  const host = mountWatchSubtitleHost();
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ didyou: dictPhrase("did you", ["gördün"]) });
  const cueRoot = mockEl("div", "lln-subs");
  cueRoot.isConnected = true;
  sandbox.document.body.appendChild(cueRoot);

  LRPH.setGlossPanelOpen(false);
  LRPH.ensureToolbarButton();
  const offEmpty = bar.querySelector(".lrph-toolbar-btn");
  assert.equal(Boolean(offEmpty), true);
  assert.equal(offEmpty.classList.contains("is-on"), false);
  assert.equal(offEmpty.classList.contains("is-open"), false);
  assert.equal(offEmpty.classList.contains("is-off"), false);
  assertGlossDockHidden();

  LRPH.setGlossPanelOpen(true);
  assert.equal(offEmpty.classList.contains("is-on"), true);
  assertGlossDockEmpty();

  LRPH.syncGlossPanels([
    [cueRoot, [{ start: 0, n: 2, phrase: "did you", els: [] }]],
  ]);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-glosses")), true);
  assert.equal(offEmpty.classList.contains("is-on"), true);

  LRPH.setGlossPanelOpen(false);
  assert.equal(offEmpty.classList.contains("is-on"), false);
  assertGlossDockHidden();

  LRPH.syncGlossPanels([
    [cueRoot, [{ start: 0, n: 2, phrase: "did you", els: [] }]],
  ]);
  assert.equal(offEmpty.classList.contains("is-on"), false);
  assertGlossDockHidden();

  LRPH.clearGlossPanels();
  cueRoot.remove();
  host.remove();
  bar.remove();
}

{
  const catalog = mockEl("div", "main-toolbar");
  catalog.appendChild(mockEl("button"));
  const player = mockEl("div", "main-toolbar");
  const speed = mockEl("button");
  speed.setAttribute("title", "Playback rate");
  speed.textContent = "1x";
  player.appendChild(speed);
  player.textContent = "1x";
  sandbox.document.body.appendChild(catalog);
  sandbox.document.body.appendChild(player);
  assert.equal(LRPH.findMainToolbar(), player);
  catalog.remove();
  player.remove();
}

{
  const savedHref = sandbox.location.href;
  assert.equal(typeof LRPH.isLearningSurface, "function");
  assert.equal(typeof LRPH.isCurrentUnitRoot, "function");
  assert.equal(LRPH.isWatchRoute(), true);
  assert.equal(LRPH.isNonWatchRoute(), false);
  assert.equal(LRPH.isLearningSurface(), false);

  const host = mockEl("div", "lln-subs");
  host.id = "lln-subs";
  sandbox.document.body.appendChild(host);
  assert.equal(LRPH.isLearningSurface(), true);
  LRPH.ensureToolbarButton();
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-toolbar-btn")), false);

  const bar = mountWatchPlayerToolbar();
  assert.equal(LRPH.isLearningSurface(), true);
  LRPH.ensureToolbarButton();
  assert.equal(Boolean(bar.querySelector(".lrph-toolbar-btn")), true);
  assert.equal(bar.firstChild, bar.querySelector(".lrph-toolbar-btn"));
  host.remove();
  assert.equal(LRPH.isLearningSurface(), true);
  assert.equal(Boolean(bar.querySelector(".lrph-toolbar-btn")), true);
  bar.remove();
  LRPH.clearGlossPanels();
  assert.equal(LRPH.isLearningSurface(), false);

  sandbox.location.href = "https://www.languagereactor.com/saved-items";
  assert.equal(LRPH.isNonWatchRoute(), true);
  const savedBar = mockEl("div", "main-toolbar");
  savedBar.appendChild(mockEl("button"));
  sandbox.document.body.appendChild(savedBar);
  assert.equal(LRPH.isLearningSurface(), false);
  LRPH.ensureToolbarButton();
  assert.equal(Boolean(savedBar.querySelector(".lrph-toolbar-btn")), false);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-toolbar-btn")), false);
  savedBar.remove();
  sandbox.location.href = savedHref;
}

{
  const savedHref = sandbox.location.href;
  sandbox.location.href = "https://www.languagereactor.com/c/en/tx/t_tx_all_en";
  const catalogBar = mockEl("div", "main-toolbar");
  catalogBar.appendChild(mockEl("button"));
  sandbox.document.body.appendChild(catalogBar);
  assert.equal(LRPH.isLearningSurface(), false);
  LRPH.ensureToolbarButton();
  assert.equal(Boolean(catalogBar.querySelector(".lrph-toolbar-btn")), false);
  catalogBar.remove();

  sandbox.location.href = "https://www.languagereactor.com/settings";
  assert.equal(LRPH.isNonWatchRoute(), true);
  assert.equal(LRPH.isLearningSurface(), false);

  sandbox.location.href = savedHref;
  const reader = mockEl("div", "lri-MediaPlayer_TEXT-wrap");
  sandbox.document.body.appendChild(reader);
  assert.equal(LRPH.isLearningSurface(), true);
  const bookBar = mockEl("div", "main-toolbar");
  bookBar.appendChild(mockEl("button"));
  sandbox.document.body.appendChild(bookBar);
  LRPH.ensureToolbarButton();
  assert.equal(Boolean(bookBar.querySelector(".lrph-toolbar-btn")), true);
  assert.equal(bookBar.firstChild, bookBar.querySelector(".lrph-toolbar-btn"));
  reader.remove();
  bookBar.remove();
  LRPH.clearGlossPanels();

  const { row, view } = mountBookCurrentLine();
  assert.equal(LRPH.isLearningSurface(), true);
  assert.equal(LRPH.isCurrentUnitRoot(row), true);
  const idle = mockEl("div", "svx-row");
  const idleView = mockEl("span", "sentence-view");
  idle.appendChild(idleView);
  sandbox.document.body.appendChild(idle);
  assert.equal(LRPH.isCurrentUnitRoot(idle), false);

  function wordEl(text, parent) {
    const el = mockEl("span", "lln-word");
    el.textContent = text;
    parent.appendChild(el);
    return el;
  }
  const a = wordEl("did", view);
  const b = wordEl("you", view);
  const c = wordEl("talk", idleView);
  const d = wordEl("about", idleView);
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({
    didyou: dictPhrase("did you", ["gördün"]),
    talkabout: dictPhrase("talk about", ["konuşmak"]),
  });
  const bookToolbar = mockEl("div", "main-toolbar");
  const speed = mockEl("button");
  speed.setAttribute("title", "Playback rate");
  speed.textContent = "1x";
  bookToolbar.appendChild(speed);
  sandbox.document.body.appendChild(bookToolbar);
  LRPH.setGlossPanelOpen(true);
  LRPH.syncGlossPanels([
    [row, [{ start: 0, n: 2, phrase: "did you", els: [a, b] }]],
    [idle, [{ start: 0, n: 2, phrase: "talk about", els: [c, d] }]],
  ]);
  const phrases = [...sandbox.document.body.querySelectorAll(".lrph-glosses-phrase")].map((el) => el.textContent);
  assert.equal(phrases.includes("did you"), true);
  assert.equal(phrases.includes("talk about"), false);
  assert.equal(Boolean(bookToolbar.querySelector(".lrph-toolbar-btn")), true);
  LRPH.syncGlossPanels([]);
  assertGlossDockEmpty();
  assert.equal(Boolean(bookToolbar.querySelector(".lrph-toolbar-btn")), true);
  assert.equal(bookToolbar.querySelector(".lrph-toolbar-btn").classList.contains("is-on"), true);
  LRPH.clearGlossPanels();
  row.remove();
  idle.remove();
  bookToolbar.remove();
}

{
  const video = { top: 80, left: 100, right: 900, bottom: 530, width: 800, height: 450 };
  const lr = { top: 92, left: 844, right: 892, bottom: 140, width: 48, height: 48 };
  const bottom = { top: 400, left: 850, right: 890, bottom: 440, width: 40, height: 40 };
  const tiny = { top: 90, left: 870, right: 886, bottom: 106, width: 16, height: 16 };
  assert.equal(LRPH.isTopRightPlayerControl(video, lr), true);
  assert.equal(LRPH.isTopRightPlayerControl(video, bottom), false);
  assert.equal(LRPH.isTopRightPlayerControl(video, tiny), false);
  const picked = LRPH.pickTopRightControl(video, [bottom, tiny, lr]);
  assert.equal(picked.left, 844);
  assert.equal(LRPH.LR_CORNER_CONTROL_SELECTORS.some((s) => s.includes("lln-options") || s.includes("lln-menu")), true);
}

{
  function vid(extra = {}) {
    return {
      tagName: "VIDEO",
      isConnected: true,
      paused: true,
      ended: false,
      readyState: 4,
      classList: { contains: () => false },
      matches: () => false,
      getBoundingClientRect: () => ({ top: 0, left: 0, right: 200, bottom: 200, width: 200, height: 200 }),
      ...extra,
    };
  }
  const preview = vid({
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 40, bottom: 40, width: 40, height: 40 }),
  });
  const adTiny = preview;
  const main = vid({
    paused: false,
    classList: { contains: (c) => c === "html5-main-video" },
    matches: (s) => s.includes("html5-main-video"),
    getBoundingClientRect: () => ({ top: 10, left: 10, right: 810, bottom: 460, width: 800, height: 450 }),
  });
  const other = vid({
    paused: false,
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 300, bottom: 200, width: 300, height: 200 }),
  });
  assert.equal(LRPH.pickPlayingVideo([adTiny, main, other]), main);
  assert.equal(LRPH.pickPlayingVideo([adTiny]), null);
  assert.equal(LRPH.pickPlayingVideo([other]), other);
  const pausedMain = vid({
    paused: true,
    classList: { contains: (c) => c === "html5-main-video" },
    matches: (s) => s.includes("html5-main-video"),
    getBoundingClientRect: () => ({ top: 10, left: 10, right: 810, bottom: 460, width: 800, height: 450 }),
  });
  assert.equal(LRPH.pickPlayingVideo([adTiny, pausedMain, other]), pausedMain);
  const pausedLarge = vid({
    paused: true,
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 800, bottom: 450, width: 800, height: 450 }),
  });
  assert.equal(LRPH.pickPlayingVideo([pausedLarge, other]), pausedLarge);
  const offMain = vid({
    paused: false,
    classList: { contains: (c) => c === "html5-main-video" },
    matches: (s) => s.includes("html5-main-video"),
    getBoundingClientRect: () => ({ top: -800, left: 10, right: 810, bottom: -350, width: 800, height: 450 }),
  });
  const mini = vid({
    paused: false,
    getBoundingClientRect: () => ({ top: 480, left: 900, right: 1220, bottom: 660, width: 320, height: 180 }),
  });
  assert.equal(LRPH.pickPlayingVideo([offMain, mini]), mini);
  assert.equal(LRPH.pickPlayingVideo([offMain]), null);
}

{
  function node(sels) {
    return {
      closest(sel) {
        return sels.includes(sel) ? { id: sel } : null;
      },
    };
  }
  assert.equal(LRPH.isPlayerCueRoot(node(["#lln-subs"])), true);
  assert.equal(LRPH.isPlayerCueRoot(node([".lln-subs"])), true);
  assert.equal(LRPH.isPlayerCueRoot(node(["#lln-subs", ".lln-sentence-wrap"])), true);
  assert.equal(LRPH.isPlayerCueRoot(node([".lln-sentence-wrap"])), false);
  assert.equal(LRPH.isPlayerCueRoot(node([".sentence-view"])), false);
  assert.equal(LRPH.isPlayerCueRoot(node(["#lln-bottom-panel", "#lln-subs"])), true);
  assert.equal(LRPH.isInTranscriptList(node([".lln-vertical-view-sub"])), true);
  assert.equal(LRPH.isInTranscriptList(node(["#lln-subs-list"])), true);
  assert.equal(LRPH.isPlayerCueRoot(node([".lln-vertical-view-sub", ".lln-sentence-wrap"])), false);
  assert.equal(LRPH.isPlayerCueRoot(node(["#lln-vertical-view-subs", ".lln-word"])), false);
  assert.equal(LRPH.isPlayerCueRoot(node(["#lln-subs-list", ".lln-sentence-wrap"])), false);
  assert.equal(LRPH.isCurrentUnitRoot(node([".sentence-wrap-main"])), true);
}

{
  LRPH.clearPointerCue();
  const textWrap = mockEl("div", "lri-MediaPlayer_TEXT-wrap");
  const subsView = mockEl("div", "lri-SubsView-wrap");
  const row = mockEl("div", "sentence-row");
  const wrap = mockEl("div", "sentence-wrap");
  wrap.getBoundingClientRect = () => ({
    top: 160,
    left: 80,
    right: 720,
    bottom: 220,
    width: 640,
    height: 60,
    x: 80,
    y: 160,
  });
  const view = mockEl("div", "sentence-view");
  const w1 = mockEl("span", "lln-word");
  w1.textContent = "did";
  const w2 = mockEl("span", "lln-word");
  w2.textContent = "you";
  view.appendChild(w1);
  view.appendChild(w2);
  wrap.appendChild(view);
  row.appendChild(wrap);
  subsView.appendChild(row);
  textWrap.appendChild(subsView);
  sandbox.document.body.appendChild(textWrap);

  assert.equal(LRPH.isLearningSurface(), true);
  assert.equal(LRPH.isInTranscriptList(w1), true);
  assert.equal(LRPH.isCurrentUnitRoot(wrap), true);
  assert.equal(LRPH.isCurrentUnitRoot(w1), true);
  const bookRoots = LRPH.subtitleRootsWithWords();
  assert.equal(bookRoots.includes(wrap), true);

  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ didyou: dictPhrase("did you", ["gördün"]) });
  const bar = mockEl("div", "main-toolbar");
  sandbox.document.body.appendChild(bar);
  LRPH.setGlossPanelOpen(true);
  LRPH.syncGlossPanels([[wrap, [{ start: 0, n: 2, phrase: "did you", els: [w1, w2] }]]]);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-glosses")), true);
  assert.equal(sandbox.document.documentElement.classList.contains("lrph-dock"), true);

  LRPH.clearGlossPanels();
  LRPH.clearPointerCue();
  textWrap.remove();
  bar.remove();
}

{
  const css = readFileSync(join(root, "content.css"), "utf8");
  assert.equal(css.includes("overflow-y: auto"), true);
  assert.equal(css.includes("overflow-x: hidden"), true);
  assert.equal(css.includes(".lrph-glosses-sense::before"), false);
  assert.equal(css.includes("list-style"), false);
  const meaningsBlock = css.match(/\.lrph-glosses-meanings\s*\{[^}]+\}/)?.[0] || "";
  const senseBlock = css.match(/\.lrph-glosses-sense\s*\{[^}]+\}/)?.[0] || "";
  const itemBlock = css.match(/\.lrph-glosses-item\s*\{[^}]+\}/)?.[0] || "";
  const listBlock = css.match(/\.lrph-glosses-list\s*\{[^}]+\}/)?.[0] || "";
  assert.equal(meaningsBlock.includes("gap: 1px"), true);
  assert.equal(meaningsBlock.includes("border-left"), false);
  assert.equal(senseBlock.includes("border-left: 2px solid"), true);
  assert.equal(senseBlock.includes("padding: 0 0 0 8px"), true);
  assert.equal(itemBlock.includes("background: rgba(63, 3, 151, 0.90)"), true);
  assert.equal(listBlock.includes("overflow-y: auto"), true);
  assert.equal(listBlock.includes("max-height: var(--lrph-dock-max-h)"), true);
  assert.equal(listBlock.includes("gap: 8px"), true);
  assert.equal(listBlock.includes("justify-content: flex-start"), true);
  assert.equal(listBlock.includes("padding: 8px"), true);
  assert.equal(listBlock.includes("padding: 6px"), false);
  assert.equal(listBlock.includes("flex: 1 1 auto"), true);
  assert.equal(listBlock.includes("flex: 0 1 auto"), false);
  assert.equal(listBlock.includes("background: transparent"), true);
  assert.equal(css.includes(".lrph-toolbar-btn"), true);
  assert.equal(css.includes(".lrph-sidebar-header"), false);
  assert.equal(css.includes(".lrph-gloss-toggle"), false);
  assert.equal(css.includes(".lrph-sidebar-close"), false);
  assert.equal(css.includes(".lrph-glosses-empty"), true);
  assert.equal(css.includes(".lrph-glosses-empty-icon"), true);
  assert.equal(css.includes(".lrph-glosses-scan"), false);
  assert.equal(css.includes("@keyframes lrph-scan"), false);
  assert.equal(css.includes("animation: lrph-scan"), false);
  assert.equal(listBlock.includes("position: relative"), true);
  assert.equal(css.includes(".lrph-glosses-list.is-empty"), true);
  assert.equal(css.includes("No phrases on this line"), false);
  assert.equal(css.includes("html.lrph-dock"), true);
  assert.equal(css.includes("margin-right: var(--lrph-sidebar-w"), true);
  assert.equal(css.includes("padding-right: var(--lrph-sidebar-w)"), false);
  assert.equal(css.includes("appearance: none"), true);
  assert.equal(css.includes("object-fit: cover"), true);
  assert.equal(css.includes("overflow: hidden"), true);
  assert.equal(css.includes("font-size: 17px"), true);
  assert.equal(css.includes("font-size: 15px"), true);
  assert.equal(css.includes(".lrph-glosses.is-collapsed"), false);
  assert.equal(css.includes(".lrph-glosses.is-closed"), false);
  assert.equal(css.includes("display: none"), false);
  assert.equal(css.includes(".lrph-switch"), false);
  assert.equal(css.includes(".lrph-glosses-bar"), false);
  assert.equal(css.includes(".ytp-left-controls"), false);
  assert.equal(css.includes(".lrph-switch-fallback"), false);
  assert.equal(css.includes(".lrph-switch-label"), false);
  assert.equal(css.includes(".lrph-toolbar-btn.is-off"), false);
  assert.equal(css.includes(".lrph-toolbar-btn.is-open"), false);
  assert.equal(css.includes(".lrph-toolbar-btn.is-on"), true);
  assert.equal(css.includes("grayscale(1)"), true);
  assert.equal(css.includes("opacity: 0.65"), true);
  assert.equal(css.includes("opacity: 0.85"), true);
  const glossesBlock = css.match(/\.lrph-glosses\s*\{[^}]+\}/)?.[0] || "";
  assert.equal(glossesBlock.includes("position: fixed"), true);
  assert.equal(glossesBlock.includes("right: 0"), true);
  assert.equal(glossesBlock.includes("right: 8px"), false);
  assert.equal(glossesBlock.includes("padding: 0"), true);
  assert.equal(glossesBlock.includes("bottom: 0"), true);
  assert.equal(glossesBlock.includes("height: 100%"), true);
  assert.equal(glossesBlock.includes("height: auto"), false);
  assert.equal(glossesBlock.includes("max-height:"), true);
  assert.equal(css.includes("padding-top: 0"), true);
  assert.equal(css.includes("--lrph-dock-max-h"), true);
  assert.equal(css.includes("flex: 1 1 auto"), true);
  assert.equal(css.includes(".lrph-layer"), false);
  assert.equal(css.includes(".lrph-band"), false);
  assert.equal(css.includes(".lrph-stroke"), false);
  assert.equal(css.includes(".lrph-host"), false);
  assert.equal(css.includes("--lrph-underline"), false);
  assert.equal(css.includes("--lrph-accent"), true);
  assert.equal(css.includes("--lrph-logo-purple"), true);
  assert.equal(css.includes("html:not(.lrph-hover-armed)"), true);
  assert.equal(css.includes("lrph-hover-armed"), true);
  assert.match(css, /html:not\(\.lrph-hover-armed\)[^{]+\{[^}]*pointer-events:\s*none/);
  assert.equal(css.includes("localStorage"), false);
}

{
  const files = ["src/panel.ts", "src/phrases.ts", "src/popup.ts", "src/content.ts", "src/prefs.ts", "src/runtime.ts", "src/selectors.ts", "src/frame.ts", "src/hover-hold.ts"];
  for (const rel of files) {
    const src = readFileSync(join(root, rel), "utf8");
    assert.equal(/localStorage|sessionStorage|indexedDB/.test(src), false, rel);
    if (rel === "src/panel.ts") {
      assert.equal(src.includes("No phrases on this line."), false, rel);
      assert.equal(src.includes("SIDEBAR_EMPTY_COPY"), false, rel);
      assert.equal(src.includes("emptyCueIcon"), false, rel);
      assert.equal(src.includes("Stacked empty-card"), false, rel);
      assert.equal(src.includes("emptyScan"), false, rel);
      assert.equal(src.includes("EMPTY_GLOSS_ICON_PATH"), true, rel);
      assert.equal(src.includes("dockShouldShow"), true, rel);
      assert.equal(src.includes("watchColumnMaxHeight"), false, rel);
      assert.equal(src.includes("prependToolbarButton"), true, rel);
      assert.equal(src.includes('const ON = "is-on"'), true, rel);
      assert.equal(src.includes('const OPEN = "is-open"'), false, rel);
      assert.equal(src.includes("bar.appendChild(btn)"), false, rel);
      assert.equal(src.includes("applySidebarTop"), false, rel);
      assert.equal(src.includes("applyDockLayout"), true, rel);
      assert.equal(src.includes("flushTop"), false, rel);
      assert.equal(src.includes("isLearningSurface"), true, rel);
      assert.equal(src.includes("disarmHoverHold"), true, rel);
      assert.equal(src.includes("suppressPointerDuringDockShift"), false, rel);
    }
    if (rel === "src/prefs.ts") {
      assert.equal(src.includes("chrome.storage.local"), true, rel);
    } else {
      assert.equal(/chrome\.storage/.test(src), false, rel);
    }
    if (rel === "src/runtime.ts") {
      assert.equal(/\bdispatchEvent\s*\(/.test(src), false, rel);
      assert.equal(/\bnew\s+MouseEvent\b/.test(src), false, rel);
      assert.equal(/\bnew\s+PointerEvent\b/.test(src), false, rel);
      assert.equal(/\bsilentFill\b/.test(src), false, rel);
      assert.equal(/\bmaybeProbe\b/.test(src), false, rel);
      assert.equal(src.includes('addEventListener("click", onPointerCue'), false, rel);
      assert.equal(src.includes("isLrSaveOrStarControl"), true, rel);
      assert.equal(src.includes("disarmHoverHold"), true, rel);
      assert.equal(src.includes("installHoverHold"), true, rel);
    }
    if (rel === "src/hover-hold.ts") {
      assert.equal(src.includes("disarmHoverHold"), true, rel);
      assert.equal(src.includes("armHoverHold"), true, rel);
      assert.equal(src.includes("installHoverHold"), true, rel);
      assert.equal(src.includes("HOVER_HOLD_ARMED_CLASS"), true, rel);
      assert.equal(src.includes("movementX"), true, rel);
      assert.equal(src.includes("isTrusted"), true, rel);
    }
  }
  const man = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  assert.equal(Array.isArray(man.permissions) && man.permissions.includes("storage"), true);
  assert.equal(man.name, "Phrase Highlighter for Language Reactor");
  assert.equal(man.short_name, "Phrase Highlighter");
  const lrMatches = ["https://www.languagereactor.com/*", "https://languagereactor.com/*"];
  for (const cs of man.content_scripts) {
    assert.equal(JSON.stringify(cs.matches), JSON.stringify(lrMatches));
    assert.equal(cs.matches.some((m) => /youtube|youtu\.be|netflix|amazon/i.test(m)), false);
  }
  assert.equal(JSON.stringify(man.web_accessible_resources[0].matches), JSON.stringify(lrMatches));
}


{
  const starBtn = mockEl("button", "MuiIconButton-root");
  starBtn.setAttribute("aria-label", "Save sentence");
  assert.equal(LRPH.isLrSaveOrStarControl(starBtn), true);
  const word = mockEl("span", "lln-word");
  word.textContent = "hello";
  assert.equal(LRPH.isLrSaveOrStarControl(word), false);
}

{
  assert.equal(LRPH.SIDEBAR_OPEN_KEY, "lrphSidebarOpen");
  assert.equal(LRPH.sidebarOpenFromStored(undefined), false);
  assert.equal(LRPH.sidebarOpenFromStored(null), false);
  assert.equal(LRPH.sidebarOpenFromStored(true), true);
  assert.equal(LRPH.sidebarOpenFromStored(false), false);
  assert.equal(LRPH.SIDEBAR_EMPTY_COPY, undefined);

  sandbox.chrome.storage.local.store = {};
  await LRPH.loadGlossPanelPref();
  assert.equal(LRPH.isGlossPanelOpen(), false);
  assert.equal(Object.prototype.hasOwnProperty.call(sandbox.chrome.storage.local.store, "lrphSidebarOpen"), false);

  sandbox.chrome.storage.local.store.lrphGlossOn = true;
  await LRPH.loadGlossPanelPref();
  assert.equal(LRPH.isGlossPanelOpen(), true);
  assert.equal(sandbox.chrome.storage.local.store.lrphSidebarOpen, true);
  assert.equal(Object.prototype.hasOwnProperty.call(sandbox.chrome.storage.local.store, "lrphGlossOn"), false);

  sandbox.chrome.storage.local.store = { lrphGlossOn: false };
  await LRPH.loadGlossPanelPref();
  assert.equal(LRPH.isGlossPanelOpen(), false);
  assert.equal(sandbox.chrome.storage.local.store.lrphSidebarOpen, false);

  sandbox.chrome.storage.local.store = { lrphSidebarOpen: false, lrphGlossOn: true };
  await LRPH.loadGlossPanelPref();
  assert.equal(LRPH.isGlossPanelOpen(), false);

  const mount = mockEl("div", "html5-video-player");
  const watchBar = mountWatchPlayerToolbar();
  const watchHost = mountWatchSubtitleHost();
  const hidden = LRPH.fillGlossPanel(mount, [{ phrase: "get started", senses: ["başlamak"] }]);
  assert.equal(hidden, null);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-glosses")), false);

  LRPH.setGlossSidebarOpen(true);
  const panel = LRPH.fillGlossPanel(mount, [{ phrase: "get started", senses: ["başlamak"] }]);
  assert.equal(panel.classList.contains("is-closed"), false);
  assert.equal(sandbox.chrome.storage.local.store.lrphSidebarOpen, true);
  assert.equal(Boolean(panel.querySelector(".lrph-gloss-toggle")), false);

  LRPH.setGlossSidebarOpen(false);
  assert.equal(LRPH.isGlossPanelOpen(), false);
  assert.equal(sandbox.chrome.storage.local.store.lrphSidebarOpen, false);
  assertGlossDockHidden();

  LRPH.clearGlossPanels();
  assert.equal(LRPH.isGlossPanelOpen(), false);
  watchHost.remove();
  watchBar.remove();
  LRPH.setGlossPanelOpen(true);
}

{
  LRPH.resetPhraseDict();
  const many = {};
  for (let i = 0; i < LRPH.PHRASE_DICT_CAP + 80; i++) {
    many[`phrasenumber${i}`] = [`t${i}`];
  }
  LRPH.ingestPhrases(many);
  assert.equal(LRPH.phraseDictSize() <= LRPH.PHRASE_DICT_CAP, true);
  assert.equal(LRPH.phraseDictSize() > 1000, true);
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ oldcuephrase: ["eski"] });
  assert.equal(LRPH.phraseDictSize() > 0, true);
  LRPH.resetPhraseDict();
  assert.equal(LRPH.phraseDictSize(), 0);
  assert.equal(LRPH.phrasePrefetchReady(), false);
}

{
  function wordEl(text, index, left) {
    const el = mockEl("span", "lln-word");
    el.textContent = text;
    el.setAttribute("data-token-index", String(index));
    el.getBoundingClientRect = () => ({
      top: 400,
      left,
      right: left + 50,
      bottom: 420,
      width: 50,
      height: 20,
      x: left,
      y: 400,
    });
    return el;
  }
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({
    "the department": dictPhrase("the department", ["bölüm"]),
    "the department store": dictPhrase("the department store", ["büyük mağaza"]),
  });
  const root = mockEl("div", "lln-subs");
  root.id = "lln-subs";
  root.getBoundingClientRect = () => ({
    top: 390,
    left: 100,
    right: 700,
    bottom: 430,
    width: 600,
    height: 40,
    x: 100,
    y: 390,
  });
  root.appendChild(wordEl("the", 0, 110));
  root.appendChild(wordEl("department", 1, 165));
  root.appendChild(wordEl("store", 2, 230));
  const watchBar = mountWatchPlayerToolbar();
  sandbox.document.body.appendChild(root);
  const allHits = LRPH.findAllLinePhrases(LRPH.tokensInRoot(root));
  LRPH.syncGlossPanels([[root, allHits]]);
  const cardNames = glossPhrases();
  assert.equal(cardNames.length, 2);
  assert.equal(cardNames.includes("the department"), true);
  assert.equal(cardNames.includes("the department store"), true);
  assertNoUnderlineDom();
  LRPH.clearGlossPanels();
  root.remove();
  watchBar.remove();
}

{
  LRPH.resetPhraseDict();
  LRPH.setGlossPanelOpen(true);
  LRPH.ingestPhrases({
    didyou: dictPhrase("did you", ["gördün"]),
    talkabout: dictPhrase("talk about", ["konuşmak"]),
  });
  const watchBar = mountWatchPlayerToolbar();
  const cueRoot = mockEl("div", "lln-subs");
  sandbox.document.body.appendChild(cueRoot);
  LRPH.syncGlossPanels([
    [cueRoot, [{ start: 0, n: 2, phrase: "did you", els: [] }]],
  ]);
  assert.equal(LRPH.isGlossSidebarOpen(), true);
  assert.equal(sandbox.document.body.querySelectorAll(".lrph-glosses-item").length, 1);
  assert.equal(sandbox.document.body.querySelector(".lrph-glosses-phrase").textContent, "did you");
  const firstPanel = sandbox.document.body.querySelector(".lrph-glosses");

  LRPH.syncGlossPanels([
    [cueRoot, [{ start: 0, n: 2, phrase: "talk about", els: [] }]],
  ]);
  assert.equal(sandbox.document.body.querySelectorAll(".lrph-glosses-item").length, 1);
  assert.equal(sandbox.document.body.querySelector(".lrph-glosses-phrase").textContent, "talk about");
  assert.equal(sandbox.document.body.querySelectorAll(".lrph-glosses").length, 1);
  assert.equal(sandbox.document.body.querySelector(".lrph-glosses"), firstPanel);

  LRPH.syncGlossPanels([]);
  assert.equal(LRPH.isGlossSidebarOpen(), true);
  assertGlossDockEmpty();
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-glosses-item")), false);
  assert.equal(LRPH.glossObserverActive(), false);

  LRPH.syncGlossPanels([
    [cueRoot, [{ start: 0, n: 2, phrase: "did you", els: [] }]],
  ]);
  assert.equal(LRPH.isGlossSidebarOpen(), true);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-glosses")), true);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-glosses-empty")), false);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-glosses-scan")), false);
  assert.equal(sandbox.document.body.querySelector(".lrph-glosses-list").classList.contains("is-empty"), false);
  assert.equal(sandbox.document.body.querySelector(".lrph-glosses-phrase").textContent, "did you");
  LRPH.clearGlossPanels();
  cueRoot.remove();
  watchBar.remove();
}

{
  function wordEl(text, left) {
    const el = mockEl("span", "lln-word");
    el.textContent = text;
    el.getBoundingClientRect = () => ({
      top: 400,
      left,
      right: left + 40,
      bottom: 420,
      width: 40,
      height: 20,
      x: left,
      y: 400,
    });
    return el;
  }
  function cueBox() {
    return {
      top: 390,
      left: 100,
      right: 700,
      bottom: 430,
      width: 600,
      height: 40,
      x: 100,
      y: 390,
    };
  }

  const cueRoot = mockEl("div", "lln-subs");
  cueRoot.id = "lln-subs";
  cueRoot.getBoundingClientRect = cueBox;
  const cueA = wordEl("very", 110);
  const cueB = wordEl("similar", 155);
  cueRoot.appendChild(cueA);
  cueRoot.appendChild(cueB);

  const list = mockEl("div", "lln-vertical-view lln-subs-list");
  list.id = "lln-subs-list";
  const sameRow = mockEl("div", "lln-sentence-wrap lln-vertical-view-sub");
  sameRow.getBoundingClientRect = cueBox;
  const sameA = wordEl("very", 110);
  const sameB = wordEl("similar", 155);
  sameRow.appendChild(sameA);
  sameRow.appendChild(sameB);
  const extraRow = mockEl("div", "lln-sentence-wrap lln-vertical-view-sub");
  extraRow.getBoundingClientRect = cueBox;
  const extraA = wordEl("turning", 110);
  const extraB = wordEl("up", 155);
  extraRow.appendChild(extraA);
  extraRow.appendChild(extraB);
  list.appendChild(sameRow);
  list.appendChild(extraRow);

  const watchBar = mountWatchPlayerToolbar();
  sandbox.document.body.appendChild(cueRoot);
  sandbox.document.body.appendChild(list);

  assert.equal(LRPH.isPlayerCueRoot(cueRoot), true);
  assert.equal(LRPH.isPlayerCueRoot(sameRow), false);
  assert.equal(LRPH.isPlayerCueRoot(extraRow), false);
  assert.equal(LRPH.isCueToken(cueA), true);
  assert.equal(LRPH.isLineToken(extraA), true);
  assert.equal(LRPH.isCueToken(extraA), false);
  assert.equal(LRPH.overlayHostFor(extraA), extraRow);
  assert.equal(LRPH.overlayHostFor(cueA), cueRoot);

  const hosts = LRPH.subtitleRootsWithWords();
  assert.equal(hosts.includes(cueRoot), true);
  assert.equal(hosts.includes(sameRow), false);
  assert.equal(hosts.includes(extraRow), false);
  assert.equal(hosts.includes(list), false);

  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({
    verysimilar: dictPhrase("very similar", ["çok benzer"]),
    turningup: dictPhrase("turning up", ["ortaya çıkmak"]),
  });
  const cueHits = [{ start: 0, n: 2, phrase: "very similar", els: [cueA, cueB] }];
  const sameHits = [{ start: 0, n: 2, phrase: "very similar", els: [sameA, sameB] }];
  const extraHits = [{ start: 0, n: 2, phrase: "turning up", els: [extraA, extraB] }];
  LRPH.syncGlossPanels([
    [cueRoot, cueHits],
    [sameRow, sameHits],
    [extraRow, extraHits],
  ]);
  const phrases = glossPhrases();
  assert.equal(phrases.includes("very similar"), true);
  assert.equal(phrases.includes("turning up"), false);
  assert.equal(phrases.length, 1);
  assertNoUnderlineDom();

  const metin = mockEl("div", "sentence-view");
  metin.getBoundingClientRect = cueBox;
  const metinA = wordEl("turning", 210);
  const metinB = wordEl("up", 255);
  metin.appendChild(metinA);
  metin.appendChild(metinB);
  sandbox.document.body.appendChild(metin);
  assert.equal(LRPH.isPlayerCueRoot(metin), false);
  assert.equal(LRPH.subtitleRootsWithWords().includes(metin), false);
  metin.remove();

  LRPH.clearGlossPanels();
  cueRoot.remove();
  list.remove();
  watchBar.remove();
}

{
  sandbox.document.hidden = false;
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ didyou: dictPhrase("did you", ["gördün"]) });
  const video = mockEl("video", "html5-main-video");
  video.getBoundingClientRect = () => ({
    top: 80,
    left: 200,
    right: 1000,
    bottom: 530,
    width: 800,
    height: 450,
    x: 200,
    y: 80,
  });
  sandbox.document.body.appendChild(video);
  const cueRoot = mockEl("div", "lln-subs");
  sandbox.document.body.appendChild(cueRoot);
  LRPH.syncGlossPanels([[cueRoot, [{ start: 0, n: 2, phrase: "did you", els: [] }]]]);
  const panel = sandbox.document.body.querySelector(".lrph-glosses");
  assert.equal(Boolean(panel), true);
  assert.equal(panel.style.maxHeight, "720px");
  assertNoUnderlineDom();
  sandbox.document.hidden = true;
  const queued = [...rafFns.values()];
  rafFns.clear();
  for (const fn of queued) fn(0);
  assert.equal(LRPH.isFrameScheduled(), false);
  assert.equal(rafFns.size, 0);
  sandbox.document.hidden = false;
  LRPH.clearGlossPanels();
  video.remove();
  cueRoot.remove();
}

{
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ didyou: dictPhrase("did you", ["gördün"]) });
  const bar = mockEl("div", "main-toolbar");
  bar.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    right: 1280,
    bottom: 48,
    width: 1280,
    height: 48,
    x: 0,
    y: 0,
  });
  sandbox.document.body.appendChild(bar);
  const cueRoot = mockEl("div", "lln-subs");
  sandbox.document.body.appendChild(cueRoot);
  LRPH.setGlossPanelOpen(true);
  LRPH.syncGlossPanels([[cueRoot, [{ start: 0, n: 2, phrase: "did you", els: [] }]]]);
  const panel = sandbox.document.body.querySelector(".lrph-glosses");
  assert.equal(Boolean(panel), true);
  assert.equal(LRPH.isFrameScheduled(), false);
  assert.equal(rafFns.size, 0);
  assert.equal(panel.classList.contains("is-closed"), false);
  assert.equal(panel.style.top, "0px");
  assert.equal(panel.style.paddingTop, "0px");
  assert.equal(panel.style.bottom, "0px");
  assert.equal(panel.style.height, "100%");
  assert.equal(panel.style.maxHeight, "720px");
  assert.equal(Boolean(panel.querySelector(".lrph-switch")), false);
  const dockBtn = bar.querySelector(".lrph-toolbar-btn");
  assert.equal(Boolean(dockBtn), true);
  assert.equal(bar.firstChild, dockBtn);
  assert.equal(bar.firstElementChild, dockBtn);
  assert.equal(sandbox.document.documentElement.classList.contains("lrph-dock"), true);

  bar.querySelector(".lrph-toolbar-btn").click();
  assert.equal(LRPH.isGlossSidebarOpen(), false);
  assertGlossDockHidden();

  LRPH.clearGlossPanels();
  bar.remove();
  cueRoot.remove();
}

{
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ didyou: dictPhrase("did you", ["gördün"]) });
  const bar = mockEl("div", "main-toolbar");
  bar.getBoundingClientRect = () => ({
    top: 80,
    left: 400,
    right: 880,
    bottom: 120,
    width: 480,
    height: 40,
    x: 400,
    y: 80,
  });
  const speed = mockEl("button");
  speed.setAttribute("title", "Playback rate");
  speed.textContent = "1x";
  bar.appendChild(speed);
  sandbox.document.body.appendChild(bar);
  const cueRoot = mockEl("div", "lln-subs");
  sandbox.document.body.appendChild(cueRoot);
  LRPH.setGlossPanelOpen(true);
  LRPH.syncGlossPanels([[cueRoot, [{ start: 0, n: 2, phrase: "did you", els: [] }]]]);
  const panel = sandbox.document.body.querySelector(".lrph-glosses");
  assert.equal(Boolean(panel), true);
  assert.equal(panel.style.top, "0px");
  assert.equal(panel.style.paddingTop, "0px");
  assert.equal(panel.style.bottom, "0px");
  assert.equal(panel.style.height, "100%");
  assert.equal(bar.firstChild.classList.contains("lrph-toolbar-btn"), true);
  assert.equal(bar.children[1], speed);
  LRPH.ensureToolbarButton();
  LRPH.ensureToolbarButton();
  assert.equal(bar.querySelectorAll(".lrph-toolbar-btn").length, 1);
  assert.equal(bar.firstChild, bar.querySelector(".lrph-toolbar-btn"));
  const moved = bar.querySelector(".lrph-toolbar-btn");
  bar.appendChild(moved);
  assert.equal(bar.children[bar.children.length - 1], moved);
  LRPH.ensureToolbarButton();
  assert.equal(bar.firstChild, moved);
  assert.equal(bar.querySelectorAll(".lrph-toolbar-btn").length, 1);
  LRPH.clearGlossPanels();
  bar.remove();
  cueRoot.remove();
}

{
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ didyou: dictPhrase("did you", ["gördün"]) });
  const bar = mockEl("div", "main-toolbar");
  bar.getBoundingClientRect = () => ({
    top: 56,
    left: 0,
    right: 1280,
    bottom: 456,
    width: 1280,
    height: 400,
    x: 0,
    y: 56,
  });
  const speed = mockEl("button");
  speed.setAttribute("title", "Playback rate");
  speed.textContent = "1x";
  bar.appendChild(speed);
  sandbox.document.body.appendChild(bar);
  const cueRoot = mockEl("div", "lln-subs");
  sandbox.document.body.appendChild(cueRoot);
  LRPH.setGlossPanelOpen(true);
  LRPH.syncGlossPanels([[cueRoot, [{ start: 0, n: 2, phrase: "did you", els: [] }]]]);
  const panel = sandbox.document.body.querySelector(".lrph-glosses");
  assert.equal(Boolean(panel), true);
  assert.equal(panel.style.top, "0px");
  assert.equal(panel.style.paddingTop, "0px");
  assert.equal(panel.style.bottom, "0px");
  assert.equal(panel.style.height, "100%");
  LRPH.clearGlossPanels();
  bar.remove();
  cueRoot.remove();
}

{
  function flushTimeouts() {
    const queued = [...timeoutFns.values()];
    timeoutFns.clear();
    for (const fn of queued) fn();
  }
  function wordEl(text, left) {
    const el = mockEl("span", "lln-word");
    el.textContent = text;
    el.getBoundingClientRect = () => ({
      top: 400,
      left,
      right: left + 40,
      bottom: 420,
      width: 40,
      height: 20,
      x: left,
      y: 400,
    });
    return el;
  }
  const box = {
    top: 390,
    left: 100,
    right: 700,
    bottom: 430,
    width: 600,
    height: 40,
    x: 100,
    y: 390,
  };

  LRPH.setGlossPanelOpen(true);
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({
    verysimilar: dictPhrase("very similar", ["çok benzer"]),
    turningup: dictPhrase("turning up", ["ortaya çıkmak"]),
  });
  const cueRoot = mockEl("div", "lln-subs");
  cueRoot.id = "lln-subs";
  cueRoot.getBoundingClientRect = () => box;
  cueRoot.appendChild(wordEl("very", 110));
  cueRoot.appendChild(wordEl("similar", 155));
  const extraRow = mockEl("div", "lln-sentence-wrap lln-vertical-view-sub");
  extraRow.getBoundingClientRect = () => box;
  extraRow.appendChild(wordEl("turning", 110));
  extraRow.appendChild(wordEl("up", 155));
  const list = mockEl("div", "lln-vertical-view");
  list.id = "lln-subs-list";
  list.appendChild(extraRow);
  const watchBar = mountWatchPlayerToolbar();
  sandbox.document.body.appendChild(cueRoot);
  sandbox.document.body.appendChild(list);

  await LRPH.startRuntime();
  flushTimeouts();
  flushTimeouts();

  assertNoUnderlineDom();
  const scanPhrases = glossPhrases();
  assert.equal(scanPhrases.includes("very similar"), true);
  assert.equal(scanPhrases.includes("turning up"), false);

  LRPH.teardownRuntime();
  watchBar.remove();
  cueRoot.remove();
  list.remove();
}

{
  function flushTimeouts() {
    const queued = [...timeoutFns.values()];
    timeoutFns.clear();
    for (const fn of queued) fn();
  }
  function wordEl(text, left, className = "lln-word") {
    const el = mockEl("span", className);
    el.textContent = text;
    el.getBoundingClientRect = () => ({
      top: 400,
      left,
      right: left + 40,
      bottom: 420,
      width: 40,
      height: 20,
      x: left,
      y: 400,
    });
    return el;
  }
  const box = {
    top: 390,
    left: 100,
    right: 900,
    bottom: 430,
    width: 800,
    height: 40,
    x: 100,
    y: 390,
  };

  LRPH.setGlossPanelOpen(true);
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({
    "we're": dictPhrase("we're", ["biz"]),
    leddiscovery: true,
  });
  const cueRoot = mockEl("div", "lln-subs");
  cueRoot.id = "lln-subs";
  cueRoot.getBoundingClientRect = () => box;
  cueRoot.appendChild(wordEl("we", 110));
  cueRoot.appendChild(wordEl("'re", 140));
  cueRoot.appendChild(wordEl("human", 190));
  cueRoot.appendChild(wordEl("-", 240, "lln-not-word"));
  cueRoot.appendChild(wordEl("led", 250));
  cueRoot.appendChild(wordEl("discovery", 300));
  const watchBar = mountWatchPlayerToolbar();
  sandbox.document.body.appendChild(cueRoot);

  const cueTok = LRPH.tokensInRoot(cueRoot);
  assert.equal(
    cueTok.map((t) => `${t.surface}:${t.isNotWord ? 1 : 0}`).join("|"),
    "we:0|'re:0|human:0|-:1|led:0|discovery:0"
  );
  assert.equal(
    LRPH.findLinePhrases(cueTok)
      .map((h) => h.phrase)
      .join("|"),
    "we're"
  );

  await LRPH.startRuntime();
  flushTimeouts();
  flushTimeouts();

  const titles = glossPhrases();
  assert.equal(titles.includes("we're"), true);
  assert.equal(
    titles.some((t) => String(t).includes("led discovery") || String(t) === "led discovery"),
    false
  );
  assert.equal(titles.includes("we're"), true);
  assertNoUnderlineDom();

  LRPH.teardownRuntime();
  watchBar.remove();
  cueRoot.remove();
}

{
  function flushTimeouts() {
    const queued = [...timeoutFns.values()];
    timeoutFns.clear();
    for (const fn of queued) fn();
  }
  function wordEl(text, left) {
    const el = mockEl("span", "lln-word");
    el.textContent = text;
    el.getBoundingClientRect = () => ({
      top: 400,
      left,
      right: left + 40,
      bottom: 420,
      width: 40,
      height: 20,
      x: left,
      y: 400,
    });
    return el;
  }
  const box = {
    top: 390,
    left: 100,
    right: 900,
    bottom: 430,
    width: 800,
    height: 40,
    x: 100,
    y: 390,
  };

  LRPH.setGlossPanelOpen(true);
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({
    "empty pair": true,
    "get accepted": dictPhrase("get accepted", ["kabul edilmek"]),
    "we're": dictPhrase("we're", ["biz"]),
  });
  const cueRoot = mockEl("div", "lln-subs");
  cueRoot.id = "lln-subs";
  cueRoot.getBoundingClientRect = () => box;
  cueRoot.appendChild(wordEl("empty", 110));
  cueRoot.appendChild(wordEl("pair", 170));
  cueRoot.appendChild(wordEl("we", 320));
  cueRoot.appendChild(wordEl("'re", 350));
  cueRoot.appendChild(wordEl("get", 420));
  cueRoot.appendChild(wordEl("accepted", 460));
  const watchBar = mountWatchPlayerToolbar();
  sandbox.document.body.appendChild(cueRoot);

  const cueTok = LRPH.tokensInRoot(cueRoot);
  assert.equal(
    LRPH.findLinePhrases(cueTok)
      .map((h) => h.phrase)
      .sort()
      .join("|"),
    "get accepted|we're"
  );

  await LRPH.startRuntime();
  flushTimeouts();
  flushTimeouts();

  const titles = glossPhrases();
  assert.equal(titles.includes("we're"), true);
  assert.equal(titles.includes("get accepted"), true);
  assert.equal(titles.some((t) => /empty pair/i.test(String(t))), false);
  assertNoUnderlineDom();

  LRPH.teardownRuntime();
  watchBar.remove();
  cueRoot.remove();
}

{
  function flushTimeouts() {
    const queued = [...timeoutFns.values()];
    timeoutFns.clear();
    for (const fn of queued) fn();
  }
  function wordEl(text, left, className = "lln-word") {
    const el = mockEl("span", className);
    el.textContent = text;
    el.getBoundingClientRect = () => ({
      top: 400,
      left,
      right: left + 40,
      bottom: 420,
      width: 40,
      height: 20,
      x: left,
      y: 400,
    });
    return el;
  }
  const box = {
    top: 390,
    left: 100,
    right: 1100,
    bottom: 430,
    width: 1000,
    height: 40,
    x: 100,
    y: 390,
  };

  LRPH.setGlossPanelOpen(true);
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({
    "trying to": dictPhrase("trying to", ["çalışmak"]),
    leddiscovery: ["keşif"],
    "we're": dictPhrase("we're", ["biz"]),
  });
  const cueRoot = mockEl("div", "lln-subs");
  cueRoot.id = "lln-subs";
  cueRoot.getBoundingClientRect = () => box;
  cueRoot.appendChild(wordEl("Trying", 270));
  cueRoot.appendChild(wordEl("to", 330));
  cueRoot.appendChild(wordEl("we", 510));
  cueRoot.appendChild(wordEl("'re", 550));
  cueRoot.appendChild(wordEl("human", 610));
  cueRoot.appendChild(wordEl("-", 660, "lln-not-word"));
  cueRoot.appendChild(wordEl("led", 670));
  cueRoot.appendChild(wordEl("discovery", 720));
  const watchBar = mountWatchPlayerToolbar();
  sandbox.document.body.appendChild(cueRoot);

  const phrases = LRPH.findLinePhrases(LRPH.tokensInRoot(cueRoot)).map((h) => h.phrase);
  assert.equal(phrases.some((p) => p === "Trying to" || p === "trying to"), true);
  assert.equal(phrases.some((p) => /led/.test(p)), false);

  await LRPH.startRuntime();
  flushTimeouts();
  flushTimeouts();

  const titles = glossPhrases();
  assert.equal(titles.some((t) => t === "Trying to" || t === "trying to"), true);
  assert.equal(titles.some((t) => /led discovery/i.test(String(t))), false);
  assert.equal(titles.includes("we're"), true);
  assertNoUnderlineDom();

  LRPH.teardownRuntime();
  watchBar.remove();
  cueRoot.remove();
}

{
  const savedHost = sandbox.location.hostname;
  const savedHref = sandbox.location.href;
  for (const [host, href] of [
    ["www.netflix.com", "https://www.netflix.com/watch/1"],
    ["www.youtube.com", "https://www.youtube.com/watch?v=aaaaaaaaaaa"],
    ["youtu.be", "https://youtu.be/aaaaaaaaaaa"],
  ]) {
    sandbox.location.hostname = host;
    sandbox.location.href = href;
    LRPH.teardownRuntime();
    await LRPH.startRuntime();
    assert.equal(LRPH.isRuntimeActive(), false, host);
    assert.equal(LRPH.isRuntimeObserving(), false, host);
    assert.equal(MockMutationObserver.instances.filter((i) => i.observing).length, 0, host);
    assertNoUnderlineDom();
  }
  sandbox.location.hostname = savedHost;
  sandbox.location.href = savedHref;
}

{
  LRPH.resetPhraseDict();
  LRPH.ingestPhrases({ keepme: ["tut"] });
  await LRPH.startRuntime();
  assert.equal(LRPH.isRuntimeActive(), true);
  assert.equal(LRPH.isRuntimeObserving(), true);
  const liveMos = MockMutationObserver.instances.filter((i) => i.observing);
  assert.equal(liveMos.length, 1);
  await LRPH.startRuntime();
  assert.equal(MockMutationObserver.instances.filter((i) => i.observing).length, 1);

  LRPH.teardownRuntime();
  assert.equal(LRPH.isRuntimeActive(), false);
  assert.equal(LRPH.glossObserverActive(), false);
  assert.equal(LRPH.phraseDictSize(), 0);
  assert.equal(LRPH.phrasePrefetchReady(), false);
  assertNoUnderlineDom();
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-glosses")), false);
  assert.equal(MockMutationObserver.instances.some((i) => i.observing), true);
}

{
  function flushTimeouts() {
    const queued = [...timeoutFns.values()];
    timeoutFns.clear();
    for (const fn of queued) fn();
  }
  function wordEl(text, left) {
    const el = mockEl("span", "lln-word");
    el.textContent = text;
    el.getBoundingClientRect = () => ({
      top: 400,
      left,
      right: left + 40,
      bottom: 420,
      width: 40,
      height: 20,
      x: left,
      y: 400,
    });
    return el;
  }
  function lrphChrome() {
    return [
      ...sandbox.document.querySelectorAll(".lrph-glosses"),
      ...sandbox.document.querySelectorAll(".lrph-toolbar-btn"),
      ...sandbox.document.querySelectorAll(".lrph-switch"),
      ...sandbox.document.querySelectorAll(".lrph-layer"),
      ...sandbox.document.querySelectorAll(".lrph-band"),
    ];
  }

  LRPH.resetPhraseDict();
  LRPH.setGlossPanelOpen(false);
  LRPH.clearGlossPanels();
  const cueRoot = mockEl("div", "lln-subs");
  cueRoot.id = "lln-subs";
  cueRoot.getBoundingClientRect = () => ({
    top: 390,
    left: 100,
    right: 700,
    bottom: 430,
    width: 600,
    height: 40,
    x: 100,
    y: 390,
  });
  cueRoot.appendChild(wordEl("did", 110));
  cueRoot.appendChild(wordEl("you", 155));
  const watchBar = mountWatchPlayerToolbar();
  sandbox.document.body.appendChild(cueRoot);

  await LRPH.startRuntime();
  flushTimeouts();
  assert.equal(LRPH.isRuntimeProbing(), false);
  assert.equal(Boolean(watchBar.querySelector(".lrph-toolbar-btn")), true);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-glosses")), false);

  LRPH.ingestPhrases({ "we're": true });
  cueRoot.appendChild(wordEl("we", 210));
  cueRoot.appendChild(wordEl("'re", 250));
  flushTimeouts();
  const mos = MockMutationObserver.instances.filter((i) => i.observing);
  for (const mo of mos) {
    mo.cb([{ addedNodes: [], removedNodes: [], target: sandbox.document.body }]);
  }
  flushTimeouts();
  assert.equal(LRPH.isRuntimeProbing(), false);

  sandbox.location.href = "https://www.languagereactor.com/video?v=otherid";
  for (const { fn } of winListeners["popstate"] || []) {
    fn({ type: "popstate" });
  }
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(LRPH.isRuntimeProbing(), false);

  LRPH.teardownRuntime();
  watchBar.remove();
  cueRoot.remove();
}

{
  function flushTimeouts() {
    const queued = [...timeoutFns.values()];
    timeoutFns.clear();
    for (const fn of queued) fn();
  }
  function fireWin(type) {
    for (const { fn } of winListeners[type] || []) fn({ type, source: sandbox });
  }
  function fireLrph(data) {
    sandbox.__lrphMsg = data;
    vm.runInContext("window.postMessage(__lrphMsg, '*')", sandbox);
    delete sandbox.__lrphMsg;
  }
  function fireMutations(added = []) {
    for (const mo of MockMutationObserver.instances) {
      if (!mo.observing) continue;
      mo.cb([{ addedNodes: added, removedNodes: [], target: sandbox.document.body }]);
    }
  }
  function wordEl(text, left) {
    const el = mockEl("span", "lln-word");
    el.textContent = text;
    el.getBoundingClientRect = () => ({
      top: 400,
      left,
      right: left + 40,
      bottom: 420,
      width: 40,
      height: 20,
      x: left,
      y: 400,
    });
    return el;
  }
  function cueBox() {
    return {
      top: 390,
      left: 100,
      right: 700,
      bottom: 430,
      width: 600,
      height: 40,
      x: 100,
      y: 390,
    };
  }
  function lrphChrome() {
    return [
      ...sandbox.document.querySelectorAll(".lrph-glosses"),
      ...sandbox.document.querySelectorAll(".lrph-toolbar-btn"),
      ...sandbox.document.querySelectorAll(".lrph-switch"),
      ...sandbox.document.querySelectorAll(".lrph-layer"),
      ...sandbox.document.querySelectorAll(".lrph-band"),
    ];
  }

  LRPH.resetPhraseDict();
  LRPH.setGlossPanelOpen(true);
  const savedHref = sandbox.location.href;

  await LRPH.startRuntime();
  flushTimeouts();
  assert.equal(LRPH.isRuntimeActive(), true);
  assert.equal(LRPH.isRuntimeObserving(), true);
  assert.equal(LRPH.isRuntimeProbing(), false);
  assert.equal(LRPH.glossObserverActive(), false);
  assert.equal(LRPH.isFrameScheduled(), false);
  assert.equal(LRPH.frameTickerCount(), 0);
  assert.equal(LRPH.isLearningSurface(), false);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-glosses")), false);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-toolbar-btn")), false);
  assert.doesNotThrow(() => {
    LRPH.syncGlossPanels([]);
    LRPH.refreshGlossPanels();
  });
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-glosses")), false);

  fireLrph({
    source: "lrph",
    type: "phrases",
    phrases: { didyou: dictPhrase("did you", ["gördün"]) },
  });
  flushTimeouts();
  assert.equal(LRPH.phrasePrefetchReady(), true);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-glosses")), false);
  assert.equal(LRPH.isRuntimeProbing(), false);
  assert.equal(LRPH.frameTickerCount(), 0);

  const watchBar = mountWatchPlayerToolbar();
  assert.equal(LRPH.isLearningSurface(), true);
  fireMutations([watchBar]);
  flushTimeouts();
  flushTimeouts();
  assert.equal(Boolean(watchBar.querySelector(".lrph-toolbar-btn")), true);
  assert.equal(LRPH.isGlossSidebarOpen(), true);
  assertGlossDockEmpty();

  const lateRoot = mockEl("div", "lln-subs");
  lateRoot.id = "lln-subs";
  lateRoot.getBoundingClientRect = cueBox;
  lateRoot.appendChild(wordEl("did", 110));
  lateRoot.appendChild(wordEl("you", 155));
  sandbox.document.body.appendChild(lateRoot);
  fireMutations([lateRoot]);
  flushTimeouts();
  flushTimeouts();
  assertNoUnderlineDom();
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-glosses")), true);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-gloss-toggle")), false);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-sidebar-header")), false);

  sandbox.location.href = "https://www.languagereactor.com/video?v=bbbbbbbbbbb";
  fireWin("popstate");
  flushTimeouts();
  assert.equal(LRPH.isGlossSidebarOpen(), true);
  assertGlossDockEmpty();
  assert.equal(Boolean(watchBar.querySelector(".lrph-toolbar-btn")), true);
  assert.equal(LRPH.isRuntimeProbing(), false);
  assert.equal(LRPH.glossObserverActive(), false);
  assert.equal(lateRoot.parentElement, sandbox.document.body);

  const nextRoot = mockEl("div", "lln-subs");
  nextRoot.id = "lln-subs";
  nextRoot.getBoundingClientRect = cueBox;
  nextRoot.appendChild(wordEl("talk", 110));
  nextRoot.appendChild(wordEl("about", 155));
  sandbox.document.body.appendChild(nextRoot);
  fireLrph({
    source: "lrph",
    type: "phrases",
    phrases: { talkabout: dictPhrase("talk about", ["konuşmak"]) },
  });
  fireMutations([nextRoot]);
  flushTimeouts();
  flushTimeouts();
  assertNoUnderlineDom();
  assert.equal(sandbox.document.body.querySelector(".lrph-glosses-phrase")?.textContent, "talk about");

  LRPH.teardownRuntime();
  lateRoot.remove();
  nextRoot.remove();
  watchBar.remove();
  sandbox.location.href = savedHref;
  assert.equal(lrphChrome().length, 0);
}

{
  function flushTimeouts() {
    const queued = [...timeoutFns.values()];
    timeoutFns.clear();
    for (const fn of queued) fn();
  }
  function flushRaf() {
    const queued = [...rafFns.values()];
    rafFns.clear();
    for (const fn of queued) fn(0);
  }
  async function flushCue() {
    flushRaf();
    await Promise.resolve();
    await Promise.resolve();
    flushTimeouts();
    flushTimeouts();
  }
  function fireMutations(rec) {
    for (const mo of MockMutationObserver.instances) {
      if (!mo.observing) continue;
      mo.cb([rec]);
    }
  }
  function wordEl(text, left) {
    const el = mockEl("span", "lln-word");
    el.textContent = text;
    el.getBoundingClientRect = () => ({
      top: 400,
      left,
      right: left + 40,
      bottom: 420,
      width: 40,
      height: 20,
      x: left,
      y: 400,
    });
    return el;
  }
  function cueBox() {
    return {
      top: 390,
      left: 100,
      right: 700,
      bottom: 430,
      width: 600,
      height: 40,
      x: 100,
      y: 390,
    };
  }

  LRPH.resetPhraseDict();
  LRPH.setGlossPanelOpen(true);
  const cueRoot = mockEl("div", "lln-subs");
  cueRoot.id = "lln-subs";
  cueRoot.getBoundingClientRect = cueBox;
  const a1 = wordEl("did", 110);
  const a2 = wordEl("you", 155);
  cueRoot.appendChild(a1);
  cueRoot.appendChild(a2);
  const watchBar = mountWatchPlayerToolbar();
  sandbox.document.body.appendChild(cueRoot);

  await LRPH.startRuntime();
  flushTimeouts();
  sandbox.__lrphMsg = {
    source: "lrph",
    type: "phrases",
    phrases: {
      didyou: dictPhrase("did you", ["gördün"]),
      talkabout: dictPhrase("talk about", ["konuşmak"]),
    },
  };
  vm.runInContext("window.postMessage(__lrphMsg, '*')", sandbox);
  delete sandbox.__lrphMsg;
  fireMutations({ addedNodes: [cueRoot], removedNodes: [], target: sandbox.document.body });
  await flushCue();
  assertNoUnderlineDom();
  assert.equal(sandbox.document.body.querySelector(".lrph-glosses-phrase")?.textContent, "did you");

  a1.remove();
  a2.remove();
  a1.isConnected = false;
  a2.isConnected = false;
  const b1 = wordEl("talk", 110);
  const b2 = wordEl("about", 155);
  cueRoot.appendChild(b1);
  cueRoot.appendChild(b2);
  fireMutations({
    addedNodes: [b1, b2],
    removedNodes: [a1, a2],
    target: cueRoot,
  });
  assertNoUnderlineDom();
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-glosses")), true);

  await flushCue();
  assertNoUnderlineDom();
  assert.equal(sandbox.document.body.querySelector(".lrph-glosses-phrase")?.textContent, "talk about");

  LRPH.teardownRuntime();
  watchBar.remove();
  cueRoot.remove();
}

{
  function flushTimeouts() {
    const queued = [...timeoutFns.values()];
    timeoutFns.clear();
    for (const fn of queued) fn();
  }
  function flushRaf() {
    const queued = [...rafFns.values()];
    rafFns.clear();
    for (const fn of queued) fn(0);
  }
  async function flushCue() {
    flushRaf();
    await Promise.resolve();
    await Promise.resolve();
    flushTimeouts();
    flushTimeouts();
  }
  function fireMutations(rec) {
    for (const mo of MockMutationObserver.instances) {
      if (!mo.observing) continue;
      mo.cb([rec]);
    }
  }
  function wordEl(text, left) {
    const el = mockEl("span", "lln-word");
    el.textContent = text;
    el.getBoundingClientRect = () => ({
      top: 400,
      left,
      right: left + 40,
      bottom: 420,
      width: 40,
      height: 20,
      x: left,
      y: 400,
    });
    return el;
  }
  function cueBox() {
    return {
      top: 390,
      left: 100,
      right: 700,
      bottom: 430,
      width: 600,
      height: 40,
      x: 100,
      y: 390,
    };
  }

  LRPH.resetPhraseDict();
  LRPH.setGlossPanelOpen(true);
  const cueRoot = mockEl("div", "lln-subs");
  cueRoot.id = "lln-subs";
  cueRoot.getBoundingClientRect = cueBox;
  const w1 = wordEl("did", 110);
  const w2 = wordEl("you", 155);
  cueRoot.appendChild(w1);
  cueRoot.appendChild(w2);
  const watchBar = mountWatchPlayerToolbar();
  sandbox.document.body.appendChild(cueRoot);

  const sig0 = LRPH.liveCueFingerprint(cueRoot);
  assert.equal(sig0.includes("did"), true);
  assert.equal(sig0.includes("you"), true);

  await LRPH.startRuntime();
  flushTimeouts();
  sandbox.__lrphMsg = {
    source: "lrph",
    type: "phrases",
    phrases: {
      didyou: dictPhrase("did you", ["gördün"]),
    },
  };
  vm.runInContext("window.postMessage(__lrphMsg, '*')", sandbox);
  delete sandbox.__lrphMsg;
  fireMutations({ addedNodes: [cueRoot], removedNodes: [], target: sandbox.document.body });
  await flushCue();
  assertNoUnderlineDom();
  assert.equal(sandbox.document.body.querySelector(".lrph-glosses-phrase")?.textContent, "did you");

  flushRaf();
  flushRaf();
  flushRaf();
  assertNoUnderlineDom();
  assert.equal(sandbox.document.body.querySelector(".lrph-glosses-phrase")?.textContent, "did you");
  assert.equal(LRPH.liveCueFingerprint(cueRoot), sig0);

  fireMutations({ addedNodes: [], removedNodes: [], target: cueRoot });
  await flushCue();
  assertNoUnderlineDom();
  assert.equal(sandbox.document.body.querySelector(".lrph-glosses-phrase")?.textContent, "did you");

  w1.remove();
  w2.remove();
  w1.isConnected = false;
  w2.isConnected = false;
  const n1 = wordEl("did", 110);
  const n2 = wordEl("you", 155);
  cueRoot.appendChild(n1);
  cueRoot.appendChild(n2);
  assert.equal(LRPH.liveCueFingerprint(cueRoot), sig0);
  fireMutations({
    addedNodes: [n1, n2],
    removedNodes: [w1, w2],
    target: cueRoot,
  });
  await flushCue();
  flushRaf();
  flushRaf();
  assertNoUnderlineDom();
  assert.equal(sandbox.document.body.querySelector(".lrph-glosses-phrase")?.textContent, "did you");

  LRPH.teardownRuntime();
  watchBar.remove();
  cueRoot.remove();
}

{
  function flushTimeouts() {
    const queued = [...timeoutFns.values()];
    timeoutFns.clear();
    for (const fn of queued) fn();
  }
  function fireMutations(added = []) {
    for (const mo of MockMutationObserver.instances) {
      if (!mo.observing) continue;
      mo.cb([{ addedNodes: added, removedNodes: [], target: sandbox.document.body }]);
    }
  }
  function wordEl(text, left) {
    const el = mockEl("span", "lln-word");
    el.textContent = text;
    el.getBoundingClientRect = () => ({
      top: 400,
      left,
      right: left + 50,
      bottom: 420,
      width: 50,
      height: 20,
      x: left,
      y: 400,
    });
    return el;
  }
  function cueBox() {
    return {
      top: 390,
      left: 100,
      right: 700,
      bottom: 430,
      width: 600,
      height: 40,
      x: 100,
      y: 390,
    };
  }

  LRPH.resetPhraseDict();
  LRPH.setGlossPanelOpen(true);
  const cueRoot = mockEl("div", "lln-subs");
  cueRoot.id = "lln-subs";
  cueRoot.getBoundingClientRect = cueBox;
  cueRoot.appendChild(wordEl("the", 110));
  cueRoot.appendChild(wordEl("department", 165));
  cueRoot.appendChild(wordEl("store", 230));
  const watchBar = mountWatchPlayerToolbar();
  sandbox.document.body.appendChild(cueRoot);

  await LRPH.startRuntime();
  flushTimeouts();
  sandbox.__lrphMsg = {
    source: "lrph",
    type: "phrases",
    phrases: {
      "the department": dictPhrase("the department", ["bölüm"]),
      "the department store": dictPhrase("the department store", ["büyük mağaza"]),
    },
  };
  vm.runInContext("window.postMessage(__lrphMsg, '*')", sandbox);
  delete sandbox.__lrphMsg;
  fireMutations([cueRoot]);
  flushTimeouts();
  flushTimeouts();
  assertNoUnderlineDom();
  const cardNames = [...sandbox.document.body.querySelectorAll(".lrph-glosses-phrase")].map((el) => el.textContent);
  assert.equal(cardNames.length, 2);
  assert.equal(cardNames.includes("the department"), true);
  assert.equal(cardNames.includes("the department store"), true);

  LRPH.teardownRuntime();
  watchBar.remove();
  cueRoot.remove();
}

{
  function flushTimeouts() {
    const queued = [...timeoutFns.values()];
    timeoutFns.clear();
    for (const fn of queued) fn();
  }
  function fireWin(type) {
    for (const { fn } of winListeners[type] || []) fn({ type, source: sandbox });
  }
  function fireMutations(added = [], removed = []) {
    for (const mo of MockMutationObserver.instances) {
      if (!mo.observing) continue;
      mo.cb([{ addedNodes: added, removedNodes: removed, target: sandbox.document.body }]);
    }
  }
  function wordEl(text, left) {
    const el = mockEl("span", "lln-word");
    el.textContent = text;
    el.getBoundingClientRect = () => ({
      top: 400,
      left,
      right: left + 40,
      bottom: 420,
      width: 40,
      height: 20,
      x: left,
      y: 400,
    });
    return el;
  }
  function cueBox() {
    return {
      top: 390,
      left: 100,
      right: 700,
      bottom: 430,
      width: 600,
      height: 40,
      x: 100,
      y: 390,
    };
  }
  function makeCue(did, you) {
    const root = mockEl("div", "lln-subs");
    root.id = "lln-subs";
    root.getBoundingClientRect = cueBox;
    root.appendChild(wordEl(did, 110));
    root.appendChild(wordEl(you, 155));
    return root;
  }

  const savedHref = sandbox.location.href;
  LRPH.resetPhraseDict();
  LRPH.setGlossPanelOpen(true);
  const watchBar = mountWatchPlayerToolbar();
  const first = makeCue("did", "you");
  sandbox.document.body.appendChild(first);

  await LRPH.startRuntime();
  flushTimeouts();
  sandbox.__lrphMsg = {
    source: "lrph",
    type: "phrases",
    phrases: { didyou: dictPhrase("did you", ["gördün"]) },
  };
  vm.runInContext("window.postMessage(__lrphMsg, '*')", sandbox);
  delete sandbox.__lrphMsg;
  fireMutations([first]);
  flushTimeouts();
  flushTimeouts();
  assert.equal(glossPhrases().includes("did you"), true);
  assertNoUnderlineDom();
  const dictAfterWatch = LRPH.phraseDictSize();
  assert.equal(dictAfterWatch > 0, true);

  first.remove();
  first.isConnected = false;
  fireMutations([], [first]);
  flushTimeouts();
  flushTimeouts();
  assert.equal(Boolean(watchBar.querySelector(".lrph-toolbar-btn")), true);
  assert.equal(LRPH.isGlossSidebarOpen(), true);
  assertGlossDockEmpty();
  assert.equal(LRPH.phraseDictSize(), dictAfterWatch);
  assert.equal(LRPH.isRuntimeActive(), true);

  sandbox.location.href = "https://www.languagereactor.com/saved";
  fireWin("popstate");
  flushTimeouts();
  flushTimeouts();
  assert.equal(sandbox.document.body.querySelector(".lrph-glosses"), null);
  assert.equal(LRPH.isRuntimeActive(), true);
  assert.equal(LRPH.phraseDictSize(), dictAfterWatch);

  sandbox.location.href = savedHref;
  const back = makeCue("did", "you");
  sandbox.document.body.appendChild(back);
  fireWin("popstate");
  fireMutations([back]);
  flushTimeouts();
  flushTimeouts();
  assert.equal(LRPH.isRuntimeActive(), true);
  assert.equal(glossPhrases().includes("did you"), true);
  assertNoUnderlineDom();

  LRPH.teardownRuntime();
  assert.equal(LRPH.isRuntimeActive(), false);
  assert.equal(sandbox.document.body.querySelector(".lrph-glosses"), null);
  back.remove();
  back.isConnected = false;

  const again = makeCue("did", "you");
  sandbox.document.body.appendChild(again);
  fireMutations([again]);
  await LRPH.ensureRuntime();
  flushTimeouts();
  flushTimeouts();
  sandbox.__lrphMsg = {
    source: "lrph",
    type: "phrases",
    phrases: { didyou: dictPhrase("did you", ["gördün"]) },
  };
  vm.runInContext("window.postMessage(__lrphMsg, '*')", sandbox);
  delete sandbox.__lrphMsg;
  fireMutations([again]);
  flushTimeouts();
  flushTimeouts();
  assert.equal(LRPH.isRuntimeActive(), true);
  assert.equal(glossPhrases().includes("did you"), true);
  assertNoUnderlineDom();

  LRPH.teardownRuntime();
  again.remove();
  watchBar.remove();
  sandbox.location.href = savedHref;
}

{
  function flushTimeouts() {
    const queued = [...timeoutFns.values()];
    timeoutFns.clear();
    for (const fn of queued) fn();
  }
  function fireWin(type) {
    for (const { fn } of winListeners[type] || []) fn({ type, source: sandbox });
  }
  function fireMutations(added = [], removed = []) {
    for (const mo of MockMutationObserver.instances) {
      if (!mo.observing) continue;
      mo.cb([{ addedNodes: added, removedNodes: removed, target: sandbox.document.body }]);
    }
  }
  function lrphChrome() {
    return [
      ...sandbox.document.querySelectorAll(".lrph-glosses"),
      ...sandbox.document.querySelectorAll(".lrph-toolbar-btn"),
    ];
  }

  const savedHref = sandbox.location.href;
  LRPH.clearGlossPanels();
  LRPH.resetPhraseDict();
  LRPH.setGlossPanelOpen(true);

  await LRPH.startRuntime();
  flushTimeouts();
  flushTimeouts();
  assert.equal(LRPH.isLearningSurface(), false);
  assert.equal(lrphChrome().length, 0);
  assert.equal(sandbox.document.documentElement.classList.contains("lrph-dock"), false);

  const video = mockEl("video", "html5-main-video");
  video.paused = true;
  video.ended = false;
  video.getBoundingClientRect = () => ({
    top: 80,
    left: 200,
    right: 1000,
    bottom: 530,
    width: 800,
    height: 450,
    x: 200,
    y: 80,
  });
  const bar = mockEl("div", "main-toolbar");
  const speed = mockEl("button");
  speed.setAttribute("title", "Playback rate");
  speed.textContent = "1x";
  bar.appendChild(speed);
  const cue = mockEl("div", "lln-subs");
  cue.id = "lln-subs";
  sandbox.document.body.appendChild(video);
  sandbox.document.body.appendChild(bar);
  fireMutations([bar, video]);
  flushTimeouts();
  flushTimeouts();
  assert.equal(LRPH.isLearningSurface(), true);
  assert.equal(Boolean(bar.querySelector(".lrph-toolbar-btn")), true);
  sandbox.document.body.appendChild(cue);
  fireMutations([cue]);
  flushTimeouts();
  flushTimeouts();
  assert.equal(Boolean(bar.querySelector(".lrph-toolbar-btn")), true);
  assert.equal(LRPH.isGlossSidebarOpen(), true);
  assertGlossDockEmpty();

  cue.remove();
  video.remove();
  const table = mockEl("div", "lln-vertical-view");
  table.id = "lln-vertical-view-saved-items";
  sandbox.document.body.appendChild(table);
  sandbox.location.href = "https://www.languagereactor.com/saved-items";
  fireWin("popstate");
  fireMutations([], [cue, video]);
  flushTimeouts();
  flushTimeouts();
  assert.equal(LRPH.isLearningSurface(), false);
  assert.equal(Boolean(bar.querySelector(".lrph-toolbar-btn")), false);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-toolbar-btn")), false);
  assert.equal(Boolean(sandbox.document.body.querySelector(".lrph-glosses")), false);
  assert.equal(sandbox.document.documentElement.classList.contains("lrph-dock"), false);
  assert.equal(LRPH.isRuntimeActive(), true);
  assert.equal(LRPH.isGlossSidebarOpen(), true);
  LRPH.ensureToolbarButton();
  assert.equal(Boolean(bar.querySelector(".lrph-toolbar-btn")), false);

  sandbox.location.href = savedHref;
  sandbox.document.body.appendChild(cue);
  fireWin("popstate");
  fireMutations([cue]);
  flushTimeouts();
  flushTimeouts();
  assert.equal(LRPH.isLearningSurface(), true);
  assert.equal(Boolean(bar.querySelector(".lrph-toolbar-btn")), true);
  assert.equal(LRPH.isGlossSidebarOpen(), true);
  assertGlossDockEmpty();

  LRPH.teardownRuntime();
  cue.remove();
  bar.remove();
  table.remove();
  sandbox.location.href = savedHref;
}

{
  const LR_URL = "https://www.languagereactor.com/api/base_dict_getHoverDictEntriesForSubs";
  const YT_URL = "https://www.youtube.com/youtubei/v1/player";
  const phrases = { "did you see": ["gördün mü"] };
  const posted = [];
  vm.runInContext("window.postMessage({ source: 'lrph', type: 'start' }, '*')", sandbox);
  const origPost = sandbox.postMessage;
  sandbox.postMessage = function (data) {
    posted.push(data);
  };

  function fireLoad(xhr) {
    for (const { type, fn } of xhr._listeners) {
      if (type === "load") fn.call(xhr);
    }
  }

  function xhrLoad({ url, responseType = "", responseText = "", response = null }) {
    const xhr = new sandbox.XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = responseType;
    xhr.responseText = responseText;
    xhr.response = response;
    xhr.responseURL = url;
    xhr.send();
    fireLoad(xhr);
    return xhr;
  }

  function phrasePosts() {
    return posted.filter((m) => m && m.source === "lrph" && m.type === "phrases");
  }

  function assertPhrases(actual) {
    assert.equal(JSON.stringify(actual), JSON.stringify(phrases));
  }

  posted.length = 0;
  assert.doesNotThrow(() => {
    xhrLoad({
      url: YT_URL,
      responseType: "json",
      response: { videoDetails: { title: "x" } },
    });
  });
  assert.equal(phrasePosts().length, 0);

  posted.length = 0;
  assert.doesNotThrow(() => {
    xhrLoad({
      url: YT_URL,
      responseType: "arraybuffer",
      response: new ArrayBuffer(4096),
    });
  });
  assert.equal(phrasePosts().length, 0);

  posted.length = 0;
  assert.doesNotThrow(() => {
    xhrLoad({
      url: YT_URL,
      responseType: "blob",
      response: { size: 12, type: "application/octet-stream" },
    });
  });
  assert.equal(phrasePosts().length, 0);

  posted.length = 0;
  assert.doesNotThrow(() => {
    xhrLoad({
      url: LR_URL,
      responseType: "json",
      response: { data: { phrases } },
    });
  });
  assert.equal(phrasePosts().length, 1);
  assertPhrases(phrasePosts()[0].phrases);

  posted.length = 0;
  assert.doesNotThrow(() => {
    xhrLoad({
      url: new URL(LR_URL),
      responseType: "json",
      response: { data: { phrases } },
    });
  });
  assert.equal(phrasePosts().length, 1);
  assertPhrases(phrasePosts()[0].phrases);

  posted.length = 0;
  xhrLoad({
    url: LR_URL,
    responseType: "",
    responseText: JSON.stringify({ phrases }),
  });
  assert.equal(phrasePosts().length, 1);
  assertPhrases(phrasePosts()[0].phrases);

  posted.length = 0;
  xhrLoad({
    url: LR_URL,
    responseType: "text",
    responseText: JSON.stringify({ data: { data: { phrases } } }),
  });
  assert.equal(phrasePosts().length, 1);
  assertPhrases(phrasePosts()[0].phrases);

  posted.length = 0;
  assert.doesNotThrow(() => {
    xhrLoad({
      url: LR_URL,
      responseType: "arraybuffer",
      response: new TextEncoder().encode(JSON.stringify({ phrases })).buffer,
    });
  });
  assert.equal(phrasePosts().length, 1);
  assertPhrases(phrasePosts()[0].phrases);

  posted.length = 0;
  assert.doesNotThrow(() => {
    xhrLoad({
      url: LR_URL,
      responseType: "arraybuffer",
      response: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]).buffer,
    });
  });
  assert.equal(phrasePosts().length, 0);

  const onceXhr = new sandbox.XMLHttpRequest();
  onceXhr.open("POST", LR_URL);
  onceXhr.send();
  assert.equal(onceXhr._listeners.some((l) => l.type === "load" && l.opts && l.opts.once === true), true);

  const ytXhr = new sandbox.XMLHttpRequest();
  ytXhr.open("GET", YT_URL);
  ytXhr.send();
  assert.equal(
    ytXhr._listeners.filter((l) => l.type === "load").length,
    0
  );

  posted.length = 0;
  let textCalled = false;
  let jsonCalled = false;
  fetchHandler = async () => ({
    headers: {
      get(name) {
        return String(name).toLowerCase() === "content-type" ? "application/json" : null;
      },
    },
    clone() {
      return this;
    },
    text() {
      textCalled = true;
      return Promise.reject(new Error("text() is not valid for json"));
    },
    json() {
      jsonCalled = true;
      return Promise.resolve({ phrases });
    },
  });
  await sandbox.fetch(LR_URL);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(jsonCalled, true);
  assert.equal(textCalled, false);
  assert.equal(phrasePosts().length, 1);
  assertPhrases(phrasePosts()[0].phrases);

  posted.length = 0;
  fetchHandler = async () => ({
    headers: {
      get(name) {
        return String(name).toLowerCase() === "content-type" ? "text/plain" : null;
      },
    },
    clone() {
      return this;
    },
    text() {
      return Promise.resolve(JSON.stringify({ phrases }));
    },
    json() {
      return Promise.reject(new Error("json() should not be required for text"));
    },
  });
  await sandbox.fetch(LR_URL);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(phrasePosts().length, 1);

  posted.length = 0;
  fetchHandler = async () => ({
    headers: {
      get(name) {
        return String(name).toLowerCase() === "content-type" ? "application/octet-stream" : null;
      },
    },
    clone() {
      throw new Error("must not clone binary");
    },
    text() {
      throw new Error("must not text() binary");
    },
    json() {
      throw new Error("must not json() binary");
    },
  });
  await sandbox.fetch(LR_URL);
  await Promise.resolve();
  assert.equal(phrasePosts().length, 0);

  sandbox.postMessage = origPost;
}

{
  assert.equal(LRPH.isPhraseSaveUrl("https://www.languagereactor.com/api/saveSubtitle"), true);
  assert.equal(LRPH.isPhraseSaveUrl("https://www.languagereactor.com/api/toggleSavedPhrase"), true);
  assert.equal(LRPH.isPhraseSaveUrl("https://api-cdn.dioco.io/subs_saveCue"), true);
  assert.equal(LRPH.isPhraseSaveUrl("https://www.languagereactor.com/api/base_dict_getHoverDictEntriesForSubs"), false);
  assert.equal(LRPH.shouldBlockPhraseSaveRequest("https://www.languagereactor.com/api/saveSubtitle"), true);
  assert.equal(
    LRPH.shouldBlockPhraseSaveRequest(
      "https://www.languagereactor.com/api/rpc",
      JSON.stringify({ itemType: "PHRASE", context: { phrase: {} } })
    ),
    true
  );
  assert.equal(
    LRPH.shouldBlockPhraseSaveRequest(
      "https://www.languagereactor.com/api/rpc",
      JSON.stringify({ itemType: "WORD", context: { phrase: {} } })
    ),
    false
  );
  LRPH.noteTrustedPhraseSaveGesture();
  assert.equal(LRPH.isPhraseSaveAllowed(), true);
  assert.equal(LRPH.shouldBlockPhraseSaveRequest("https://www.languagereactor.com/api/saveSubtitle"), false);
}

{
  LRPH.disarmHoverHold();
  assert.equal(LRPH.isHoverHoldArmed(), false);
  assert.equal(LRPH.pointerMovePixels({ movementX: 0, movementY: 0 }), 0);
  assert.equal(LRPH.pointerMovePixels({ movementX: 3, movementY: 4 }), 5);
  const css = LRPH.hoverHoldCssText();
  assert.equal(css.includes("html:not(.lrph-hover-armed)"), true);
  assert.equal(css.includes(".lri-SubsView-wrap"), true);
  assert.equal(css.includes("pointer-events: none !important"), true);

  const starBtn = mockEl("button", "MuiIconButton-root");
  starBtn.setAttribute("aria-label", "Kaydet");
  const cue = mockEl("div", "lln-subs");
  cue.appendChild(starBtn);
  assert.equal(LRPH.shouldBlockCuePointer(starBtn), true);
  assert.equal(LRPH.shouldBlockCuePointer(cue), true);
  LRPH.armHoverHold();
  assert.equal(LRPH.isHoverHoldArmed(), true);
  assert.equal(LRPH.shouldBlockCuePointer(starBtn), false);
  LRPH.disarmHoverHold();

  assert.equal(LRPH.isBareSaveShortcutKey({ key: "r", ctrlKey: false, metaKey: false, altKey: false }), true);
  assert.equal(LRPH.isBareSaveShortcutKey({ key: "R", ctrlKey: false, metaKey: false, altKey: false }), true);
  assert.equal(LRPH.isBareSaveShortcutKey({ key: "r", ctrlKey: false, metaKey: true, altKey: false }), false);
  assert.equal(LRPH.isBareSaveShortcutKey({ key: "r", ctrlKey: true, metaKey: false, altKey: false }), false);
  assert.equal(LRPH.isBareSaveShortcutKey({ key: "r", ctrlKey: false, metaKey: false, altKey: true }), false);
  assert.equal(LRPH.isBareSaveShortcutKey({ key: "s", ctrlKey: false, metaKey: false, altKey: false }), false);

  LRPH.disarmHoverHold();
  assert.equal(
    LRPH.shouldBlockSaveShortcutKey({ key: "r", ctrlKey: false, metaKey: false, altKey: false, isTrusted: true }),
    true
  );
  assert.equal(
    LRPH.shouldBlockSaveShortcutKey({ key: "r", ctrlKey: false, metaKey: true, altKey: false, isTrusted: true }),
    false
  );
  assert.equal(
    LRPH.shouldBlockSaveShortcutKey({ key: "R", ctrlKey: true, metaKey: false, altKey: false, isTrusted: true }),
    false
  );
  assert.equal(
    LRPH.shouldBlockSaveShortcutKey({ key: "r", ctrlKey: false, metaKey: false, altKey: false, isTrusted: false }),
    false
  );
  LRPH.armHoverHold();
  assert.equal(
    LRPH.shouldBlockSaveShortcutKey({ key: "r", ctrlKey: false, metaKey: false, altKey: false, isTrusted: true }),
    false
  );
  LRPH.disarmHoverHold();
}

console.log("ok", "typescript modules");
