import { notFound, redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getUserId } from "../../../../src/lib/auth/getUser";
import {
  getDisputeById,
  listDisputeMessages,
} from "../../../../src/lib/disputes";
import { Link } from "../../../../src/i18n/routing";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * M3.9 — Dispute thread viewer (standalone page).
 *
 * Server-rendered read-only view of a dispute thread. The drawer's
 * DisputePanel is the live interaction surface; this page is the link
 * recipients land on from emails / shared URLs and gives admins a
 * quick read on what was said.
 */
export default async function DisputeViewerPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("assistant.surface.dispute");

  if (!UUID_RE.test(id)) notFound();

  const userId = await getUserId();
  if (!userId) {
    redirect(`/${locale}/auth/sign-in?next=/${locale}/disputes/${id}`);
  }

  const dispute = await getDisputeById(id);
  if (!dispute) notFound();
  if (dispute.user_id !== userId) notFound();

  const messages = await listDisputeMessages(id);

  return (
    <main className="w-full max-w-2xl flex flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          {t("title")}
        </p>
        <h1 className="text-2xl font-semibold">{t(`status.${dispute.status}`)}</h1>
        <p className="text-sm text-zinc-400">{dispute.complaint}</p>
      </header>

      <ul className="flex flex-col gap-2">
        {messages.map((m) => (
          <li
            key={m.id}
            className={
              "rounded-lg border p-3 flex flex-col gap-1 " +
              (m.sender === "mediator"
                ? "bg-zinc-900/60 border-zinc-800"
                : m.sender === "user"
                  ? "bg-emerald-900/20 border-emerald-900/40"
                  : "bg-zinc-950/60 border-zinc-800/60")
            }
          >
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">
              {t(`sender.${m.sender}`)}
              {m.kind !== "message" && (
                <span className="ml-1 text-amber-300">
                  · {t(`kind.${m.kind}`)}
                </span>
              )}
            </div>
            <p className="text-zinc-100 leading-snug whitespace-pre-wrap">
              {m.body}
            </p>
          </li>
        ))}
      </ul>

      <Link
        href="/"
        className="text-sm text-zinc-400 hover:text-zinc-200 underline"
      >
        ← Home
      </Link>
    </main>
  );
}
