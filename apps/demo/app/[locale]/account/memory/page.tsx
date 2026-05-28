import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Link } from "../../../../src/i18n/routing";
import MemoryPanel from "./MemoryPanel";

export const dynamic = "force-dynamic";

export default async function MemoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("account.memory");

  return (
    <main className="w-full max-w-2xl flex flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-zinc-400">{t("blurb")}</p>
      </header>
      <MemoryPanel />
      <Link
        href="/"
        className="mt-4 text-xs text-zinc-400 hover:text-white underline w-fit"
      >
        {t("backTo6")}
      </Link>
    </main>
  );
}
