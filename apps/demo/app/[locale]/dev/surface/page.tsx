import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import DevSurfaceClient from "./DevSurfaceClient";

export const dynamic = "force-dynamic";

/**
 * Dev-only sandbox for the M3.0b Assistant Surface. Each button pushes a
 * canned payload into the surface store so we can verify the drawer
 * renders each variant correctly before M3.0e ships.
 *
 * Production: returns 404. Reachable only in NODE_ENV !== 'production'.
 */
export default async function DevSurfacePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { locale } = await params;
  setRequestLocale(locale);
  return <DevSurfaceClient />;
}
