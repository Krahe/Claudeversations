// User-level preferences (theme, text size, etc.) persisted to
// ~/.claudeversations/preferences.json. Loaded once on app mount,
// updated on change. Defaults are returned if the file doesn't exist
// or is malformed — never throws.

import { exists, readTextFile, writeTextFile, mkdir } from "@tauri-apps/plugin-fs";
import { homeDir, join } from "@tauri-apps/api/path";

export type ThemeName = "warm-paper" | "dark-study";

export interface Preferences {
  theme: ThemeName;
  body_size_px: number; // 13-22 reasonable range
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "warm-paper",
  body_size_px: 17,
};

async function prefsPath(): Promise<string> {
  const home = await homeDir();
  const dir = await join(home, ".claudeversations");
  await mkdir(dir, { recursive: true });
  return join(dir, "preferences.json");
}

export async function readPreferences(): Promise<Preferences> {
  try {
    const p = await prefsPath();
    if (!(await exists(p))) return { ...DEFAULT_PREFERENCES };
    const text = await readTextFile(p);
    const parsed = JSON.parse(text) as Partial<Preferences>;
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export async function writePreferences(prefs: Preferences): Promise<void> {
  const p = await prefsPath();
  await writeTextFile(p, JSON.stringify(prefs, null, 2));
}

/**
 * Apply prefs to the document — sets data-theme attribute and the
 * --body-size CSS variable. Called on load and whenever prefs change.
 */
export function applyPreferences(prefs: Preferences): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", prefs.theme);
  root.style.setProperty("--body-size", `${prefs.body_size_px}px`);
}
