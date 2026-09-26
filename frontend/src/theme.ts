export type Theme = "dark" | "light";

const STORAGE_KEY = "tramflow-theme";

export function initialTheme(): Theme {
  let saved: string | null = null;
  try { saved = window.localStorage.getItem(STORAGE_KEY); } catch { /* Storage can be disabled. */ }
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  try { window.localStorage.setItem(STORAGE_KEY, theme); } catch { /* Theme still applies for this session. */ }
}
