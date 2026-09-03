/**
 * MAIN-world content script (manifest `world: "MAIN"`). Language Reactor
 * prefetches phrase n-grams with POST /base_dict_getHoverDictEntriesForSubs
 * (axios XHR in the page). Response is read only; the API is never called.
 *
 * `data.phrases` is a map of n-gram src → `trans[]` (string senses for that
 * phrase only). pageScript wraps each as `{ src, trans }` for MiniDict.
 * Word/lemma lines come from a later `/base_dict_getHoverDict_8` on hover
 * and are not in this payload.
 *
 * Bundled separately from the isolated-world content script so gloss DOM
 * stays out of the page world. Phrases travel via window.postMessage.
 *
 * Never read xhr.responseText unless responseType is '' or 'text'. Axios and
 * media XHRs use 'json' / 'arraybuffer'; those getters throw InvalidStateError
 * and used to abort this hook.
 */
import { isLanguageReactorHost } from "./host";
import { injectHoverHoldStyle, installStarHold, shouldBlockPhraseSaveRequest } from "./star-hold";

type HookedXHR = XMLHttpRequest & { __lrphUrl?: string | URL };

declare global {
  interface Window {
    __LRPH_HOOK__?: boolean;
  }
}

/** Phrase n-gram prefetch. Not `/base_dict_getHoverDict_8` (per-word hover). */
const PATH = "getHoverDictEntries";
const MAX_JSON_BUFFER = 4 * 1024 * 1024;

function requestUrl(input: unknown): string {
  if (typeof input === "string") return input;
  if (!input || typeof input !== "object") return "";
  const rec = input as { url?: unknown; href?: unknown };
  if (typeof rec.url === "string") return rec.url;
  if (typeof rec.href === "string") return rec.href;
  try {
    const s = String(input);
    if (s && s !== "[object Object]" && !s.startsWith("[object ")) return s;
  } catch {
    /* ignore */
  }
  return "";
}

function isLrPhraseUrl(url: unknown): boolean {
  const s = requestUrl(url);
  return Boolean(s && s.indexOf(PATH) !== -1);
}

function isTextResponseType(type: string): boolean {
  return type === "" || type === "text";
}

function asArrayBuffer(value: unknown): ArrayBuffer | null {
  if (!value || typeof value !== "object") return null;
  if (typeof ArrayBuffer === "function" && value instanceof ArrayBuffer) return value;
  if (Object.prototype.toString.call(value) === "[object ArrayBuffer]") return value as ArrayBuffer;
  return null;
}

/** Peek the first non-space byte; decode only tiny JSON payloads, never media. */
function jsonTextFromArrayBuffer(buf: ArrayBuffer): string | null {
  if (buf.byteLength < 2 || buf.byteLength > MAX_JSON_BUFFER) return null;
  try {
    const n = Math.min(64, buf.byteLength);
    const head = new Uint8Array(buf, 0, n);
    let i = 0;
    while (i < head.length) {
      const b = head[i];
      if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d) {
        i += 1;
        continue;
      }
      if (b !== 0x7b && b !== 0x5b) return null;
      break;
    }
    if (i >= head.length) return null;
    if (typeof TextDecoder !== "function") return null;
    return new TextDecoder("utf-8").decode(buf);
  } catch {
    return null;
  }
}

function xhrSniffPayload(xhr: XMLHttpRequest): unknown {
  const type = String(xhr.responseType || "");
  if (isTextResponseType(type)) {
    const text = xhr.responseText;
    return typeof text === "string" && text ? text : null;
  }
  if (type === "json") {
    const body = xhr.response;
    return body == null ? null : body;
  }
  if (type === "arraybuffer") {
    const buf = asArrayBuffer(xhr.response);
    return buf ? jsonTextFromArrayBuffer(buf) : null;
  }
  return null;
}

function isBinaryContentType(ct: string): boolean {
  return /(?:application\/(?:octet-stream|wasm|pdf|zip)|video\/|audio\/|image\/|font\/|multipart\/)/.test(ct);
}

function installHook(): void {
  if (!isLanguageReactorHost()) return;
  if (window.__LRPH_HOOK__) return;
  window.__LRPH_HOOK__ = true;

  injectHoverHoldStyle();
  installStarHold();

  let stopped = false;

  window.addEventListener("message", (event: MessageEvent<{ source?: string; type?: string }>) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "lrph") return;
    if (data.type === "stop") stopped = true;
    if (data.type === "start") stopped = false;
  });

  function emitPhrases(phrases: unknown): void {
    if (stopped || !isLanguageReactorHost()) return;
    if (!phrases || typeof phrases !== "object") return;
    const empty = Array.isArray(phrases) ? !phrases.length : !Object.keys(phrases as object).length;
    if (empty) return;
    try {
      window.postMessage({ source: "lrph", type: "phrases", phrases }, "*");
    } catch {
      /* ignore */
    }
  }

  function sniffBody(url: unknown, body: unknown): void {
    if (!isLrPhraseUrl(url)) return;
    let json: unknown = body;
    if (typeof body === "string") {
      const text = body.trim();
      if (!text || (text[0] !== "{" && text[0] !== "[")) return;
      if (text.indexOf("phrases") === -1) return;
      try {
        json = JSON.parse(text);
      } catch {
        return;
      }
    }
    if (!json || typeof json !== "object") return;
    const obj = json as {
      data?: { phrases?: unknown; data?: { phrases?: unknown } };
      phrases?: unknown;
    };
    const phrases =
      (obj.data && obj.data.phrases) || obj.phrases || (obj.data && obj.data.data && obj.data.data.phrases);
    emitPhrases(phrases);
  }

  if (typeof XMLHttpRequest === "function" && XMLHttpRequest.prototype) {
    const xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (this: HookedXHR, method: string, url: string | URL) {
      this.__lrphUrl = url;
      return xhrOpen.apply(this, arguments as unknown as Parameters<XMLHttpRequest["open"]>);
    };

    const xhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (this: HookedXHR) {
      const openUrl = this.__lrphUrl || "";
      const bodyArg = arguments[0];
      if (shouldBlockPhraseSaveRequest(openUrl, bodyArg)) {
        try {
          this.abort();
        } catch {
          /* ignore */
        }
        return;
      }
      if (isLrPhraseUrl(openUrl)) {
        this.addEventListener(
          "load",
          function (this: HookedXHR) {
            try {
              if (stopped) return;
              const url = this.__lrphUrl || this.responseURL || "";
              if (!isLrPhraseUrl(url)) return;
              const body = xhrSniffPayload(this);
              if (body == null || body === "") return;
              sniffBody(url, body);
            } catch {
              /* one bad XHR must not kill the hook */
            }
          },
          { once: true }
        );
      }
      return xhrSend.apply(this, arguments as unknown as Parameters<XMLHttpRequest["send"]>);
    };
  }

  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (this: Window, input: RequestInfo | URL, init?: RequestInit) {
      const url = requestUrl(input);
      const bodyArg = init?.body;
      if (shouldBlockPhraseSaveRequest(url, bodyArg)) {
        if (typeof Response === "function") {
          return Promise.resolve(new Response(null, { status: 204, statusText: "No Content" }));
        }
        return Promise.resolve({
          ok: true,
          status: 204,
          statusText: "No Content",
          headers: { get() { return null; } },
          clone() {
            return this;
          },
          json() {
            return Promise.resolve({});
          },
          text() {
            return Promise.resolve("");
          },
        } as unknown as Response);
      }
      return origFetch.apply(this, arguments as unknown as [RequestInfo | URL, RequestInit?]).then((res) => {
        try {
          if (stopped || !isLrPhraseUrl(url) || !res) return res;
          const ct = String(res.headers?.get?.("content-type") || "").toLowerCase();
          if (isBinaryContentType(ct)) return res;
          let cloned: Response;
          try {
            cloned = res.clone();
          } catch {
            return res;
          }
          const read = /\bjson\b/.test(ct) ? cloned.json() : cloned.text();
          void read
            .then((body) => {
              if (!stopped) sniffBody(url, body);
            })
            .catch(() => {});
        } catch {
          /* ignore */
        }
        return res;
      });
    };
  }
}

installHook();

export {};
