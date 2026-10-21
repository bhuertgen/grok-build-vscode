/**
 * Single locale helper for the few UI strings that have a German variant
 * (#48). Pure module (no vscode) — callers pass `vscode.env.language`.
 *
 * Decision: we keep a tiny `{ en, de }` message table per string instead of
 * `vscode.l10n` for now; see docs/en/ARCHITECTURE.md § Localisation.
 */
export function isGermanLocale(lang: string | undefined | null): boolean {
  return typeof lang === 'string' && /^de\b/i.test(lang.trim());
}

export interface LocalizedText {
  en: string;
  de: string;
}

/** Pick the German or English variant for a VS Code display language. */
export function localize(text: LocalizedText, lang?: string | null): string {
  return isGermanLocale(lang) ? text.de : text.en;
}
