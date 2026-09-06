/** languagereactor.com only (apex and www). Matches the MV3 content_scripts. */

export function isLanguageReactorHost(hostname?: string): boolean {
  const raw = hostname == null || hostname === "" ? (typeof location !== "undefined" ? location.hostname : "") : hostname;
  const host = String(raw || "")
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
  return host === "languagereactor.com" || host === "www.languagereactor.com";
}
