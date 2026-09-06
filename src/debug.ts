/**
 * Quiet by default. Enable on a player page:
 *   localStorage.setItem("lrph-debug", "1"); location.reload();
 * Disable:
 *   localStorage.removeItem("lrph-debug"); location.reload();
 */

const FLAG = "lrph-debug";

export function debugEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

export function log(...args: unknown[]): void {
  if (!debugEnabled()) return;
  console.log("[LRPH]", ...args);
}
