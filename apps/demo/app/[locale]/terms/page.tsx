import { redirect } from "../../../src/i18n/routing";

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/legal", locale });
}
