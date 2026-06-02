import { notFound, redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getUserId } from "../../../../src/lib/auth/getUser";
import { getContractById } from "../../../../src/lib/payments";
import { Link } from "../../../../src/i18n/routing";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CheckoutReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contractors.payment.return");
  const sp = await searchParams;
  const ok = sp.ok !== "0";

  if (!UUID_RE.test(id)) notFound();

  const userId = await getUserId();
  if (!userId) {
    redirect(`/${locale}/auth/sign-in?next=/${locale}/checkout/${id}`);
  }

  const row = await getContractById(id, userId);
  if (!row) notFound();

  const dollars = (row.amount_cents / 100).toFixed(2);
  const feeDollars = (row.platform_fee_cents / 100).toFixed(2);
  const currency = row.currency.toUpperCase();

  return (
    <main className="w-full max-w-2xl flex flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          {t("kicker")}
        </p>
        <h1 className="text-2xl font-semibold">
          {ok ? t("titleSuccess") : t("titleCanceled")}
        </h1>
        <p className="text-sm text-zinc-400">
          {row.status === "paid"
            ? t("subtitlePaid")
            : ok
              ? t("subtitleProcessing")
              : t("subtitleCanceled")}
        </p>
      </header>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 flex flex-col gap-2 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-400">{t("contractId")}</span>
          <span className="font-mono text-xs">{row.id}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">{t("category")}</span>
          <span>{row.category}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">{t("amount")}</span>
          <span className="font-mono">
            {dollars} {currency}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">{t("platformFee")}</span>
          <span className="font-mono">
            {feeDollars} {currency}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">{t("status")}</span>
          <span className="font-mono">{row.status}</span>
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        <Link
          href="/contractors"
          className="rounded-md bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
        >
          {t("backToContractors")}
        </Link>
        <Link
          href="/"
          className="rounded-md bg-amber-400 text-zinc-900 px-4 py-2 text-sm font-medium"
        >
          {t("backTo6")}
        </Link>
      </div>
    </main>
  );
}
