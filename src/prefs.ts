/**
 * Extension-wide prefs via chrome.storage.local so the sidebar open/closed
 * flag follows the user across Language Reactor tabs. Do not use the host
 * page origin store; that is per-site and would not survive a new origin.
 */

export const SIDEBAR_OPEN_KEY = "lrphSidebarOpen";

/** Previous On/Off flag. Read once if the new key is missing, then dropped. */
const LEGACY_GLOSS_ON_KEY = "lrphGlossOn";

type StorageBag = Record<string, unknown>;

type LocalArea = {
  get: (keys: string) => Promise<StorageBag> | void;
  set: (items: StorageBag) => Promise<void> | void;
  remove?: (keys: string) => Promise<void> | void;
};

function storageLocal(): LocalArea | undefined {
  try {
    const g = globalThis as typeof globalThis & {
      chrome?: { storage?: { local?: LocalArea } };
    };
    return g.chrome?.storage?.local;
  } catch {
    return undefined;
  }
}

async function asBag(result: Promise<StorageBag> | StorageBag | void): Promise<StorageBag> {
  if (result && typeof (result as Promise<StorageBag>).then === "function") {
    return await (result as Promise<StorageBag>);
  }
  return (result || {}) as StorageBag;
}

function hasOwn(bag: StorageBag, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(bag, key);
}

/** Explicit true is open. Missing, null, and any other value are closed. */
export function sidebarOpenFromStored(value: unknown): boolean {
  return value === true;
}

export async function readSidebarOpen(): Promise<boolean> {
  const area = storageLocal();
  if (!area || typeof area.get !== "function") return false;
  try {
    const fresh = await asBag(area.get(SIDEBAR_OPEN_KEY));
    if (hasOwn(fresh, SIDEBAR_OPEN_KEY)) return sidebarOpenFromStored(fresh[SIDEBAR_OPEN_KEY]);
    const legacy = await asBag(area.get(LEGACY_GLOSS_ON_KEY));
    if (!hasOwn(legacy, LEGACY_GLOSS_ON_KEY)) return false;
    const open = sidebarOpenFromStored(legacy[LEGACY_GLOSS_ON_KEY]);
    writeSidebarOpen(open);
    return open;
  } catch {
    return false;
  }
}

export function writeSidebarOpen(open: boolean): void {
  const area = storageLocal();
  if (!area || typeof area.set !== "function") return;
  try {
    void area.set({ [SIDEBAR_OPEN_KEY]: Boolean(open) });
  } catch {
    /* ignore */
  }
  try {
    if (typeof area.remove === "function") void area.remove(LEGACY_GLOSS_ON_KEY);
  } catch {
    /* ignore */
  }
}
