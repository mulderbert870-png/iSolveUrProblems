import { defaultLocale, locales, type Locale } from "../../i18n/routing";

/**
 * Maps our app Locale codes (en, es, fr, pt, de, zh) to the language
 * codes HeyGen / LiveAvatar expects for `avatar_persona.language`.
 *
 * Bridges M1.6a (UI localized) with vision ¶26 ("6 speaks as many
 * languages as ai speaks") — the avatar now speaks in the same language
 * the UI is in, instead of the hard-coded LIVEAVATAR_LANGUAGE env.
 *
 * HeyGen on this plan rejected IETF region tags like "en-US" with
 * `{code: 4000, message: "Language not supported", params: {language: "en-US"}}`.
 * It accepts primary subtags ("en", "es", ...), which matches the
 * historical value of LIVEAVATAR_LANGUAGE env. If your HeyGen plan
 * later supports region tags or full names ("English"), swap these.
 */
const LOCALE_TO_HEYGEN: Record<Locale, string> = {
  en: "en",
  es: "es",
  fr: "fr",
  pt: "pt",
  de: "de",
  zh: "zh",
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
