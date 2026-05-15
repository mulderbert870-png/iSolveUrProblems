import { defaultLocale, locales, type Locale } from "../../i18n/routing";

/**
 * Maps our app Locale codes (en, es, fr, pt, de, zh) to the IETF
 * language tags HeyGen / LiveAvatar expects for `avatar_persona.language`.
 *
 * Bridges M1.6a (UI localized) with vision ¶26 ("6 speaks as many
 * languages as ai speaks") — the avatar now speaks in the same language
 * the UI is in, instead of the hard-coded LIVEAVATAR_LANGUAGE env.
 *
 * Replace these tags if your HeyGen plan expects different codes. Some
 * deployments use just the primary subtag ("en") while others use full
 * region tags ("en-US"). Adjust to match what your avatar accepts.
 */
const LOCALE_TO_HEYGEN: Record<Locale, string> = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  pt: "pt-BR",
  de: "de-DE",
  zh: "zh-CN",
};

/**
 * Return the HeyGen language code for an app locale, or fall back to
 * the LIVEAVATAR_LANGUAGE env (when set) so legacy/anonymous sessions
 * keep working unchanged.
 */
export function mapLocaleToAvatarLanguage(
  locale: Locale | string | null | undefined,
  envFallback: string,
): string {
  if (locale && (locales as readonly string[]).includes(locale)) {
    return LOCALE_TO_HEYGEN[locale as Locale];
  }
  return envFallback || LOCALE_TO_HEYGEN[defaultLocale];
}

/** Friendly language name for embedding into a system prompt. */
const LOCALE_TO_NAME: Record<Locale, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese",
  de: "German",
  zh: "Chinese (Simplified)",
};

export function localeLanguageName(locale: Locale): string {
  return LOCALE_TO_NAME[locale] ?? "English";
}
