import { getRequestConfig } from "next-intl/server";
import { locales, defaultLocale, type Locale } from "./routing";

function isSupportedLocale(value: string | undefined): value is Locale {
  return (
    typeof value === "string" && (locales as readonly string[]).includes(value)
  );
}

/**
 * Per-request i18n config consumed by next-intl/plugin. Picks the locale
 * from the URL segment and loads the matching messages bundle.
 *
 * Falls back to `defaultLocale` ('en') if the segment is missing or not in
 * our supported set.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = isSupportedLocale(requested) ? requested : defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
