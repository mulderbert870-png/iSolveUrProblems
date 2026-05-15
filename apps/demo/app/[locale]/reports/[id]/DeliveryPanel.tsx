"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useUser } from "../../../../src/lib/auth/AuthProvider";

type Channel = "email" | "sms" | "whatsapp";

type Profile = {
  email: string | null;
  phone: string | null;
  preferred_channels: {
    preferred?: Channel;
    sms_consent?: boolean;
    whatsapp_consent?: boolean;
  } | null;
};

type SendOutcome = {
  ok?: boolean;
  channel?: Channel;
  resolved_channel?: Channel;
  used_fallback?: boolean;
  fallback_reason?: string | null;
  error?: string;
  provider_id?: string;
};

/**
 * Lets the report owner pick a channel and deliver the report.
 * Captures phone + consent inline when the user picks SMS/WhatsApp
 * for the first time. Persists choices to users.preferred_channels.
 */
export default function DeliveryPanel({
  reportId,
  whatsappEnabled,
}: {
  reportId: string;
  whatsappEnabled: boolean;
}) {
  const { user, loading: authLoading } = useUser();
  const t = useTranslations("reports.deliver");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [channel, setChannel] = useState<Channel>("email");
  const [phone, setPhone] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [waConsent, setWaConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);

  // Load profile once auth is settled.
  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/user/profile");
        if (!res.ok) return;
        const data = (await res.json()) as Profile;
        if (cancelled) return;
        setProfile(data);
        if (data.preferred_channels?.preferred) {
          setChannel(data.preferred_channels.preferred);
        }
        if (data.phone) setPhone(data.phone);
        if (data.preferred_channels?.sms_consent) setSmsConsent(true);
        if (data.preferred_channels?.whatsapp_consent) setWaConsent(true);
      } catch {
        // ignore — fall back to defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const needsPhone = channel === "sms" || channel === "whatsapp";
  const needsSmsConsent = channel === "sms" && !smsConsent;
  const needsWaConsent = channel === "whatsapp" && !waConsent;

  const canSubmit =
    !busy &&
    !!user &&
    (channel === "email"
      ? !!profile?.email
      : !!phone && (channel === "sms" ? smsConsent : waConsent));

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;
      setBusy(true);
      setOutcome(null);
      try {
        // Persist phone/consent + preferred channel before sending so
        // resolveChannel sees the latest state.
        const prefsPatch: Record<string, unknown> = {
          preferred_channels: {
            preferred: channel,
            ...(channel === "sms" ? { sms_consent: smsConsent } : {}),
            ...(channel === "whatsapp" ? { whatsapp_consent: waConsent } : {}),
          },
        };
        if (needsPhone && phone) prefsPatch.phone = phone;
        await fetch("/api/user/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(prefsPatch),
        });

        const res = await fetch(
          `/api/reports/${encodeURIComponent(reportId)}/send`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel }),
          },
        );
        const data = (await res.json()) as SendOutcome;
        setOutcome(data);
      } catch (err) {
        setOutcome({
          ok: false,
          error: err instanceof Error ? err.message : "send threw",
        });
      } finally {
        setBusy(false);
      }
    },
    [
      canSubmit,
      channel,
      smsConsent,
      waConsent,
      phone,
      needsPhone,
      reportId,
    ],
  );

  if (authLoading) {
    return <p className="text-sm text-zinc-400">…</p>;
  }
  if (!user) {
    return <p className="text-sm text-zinc-400">{t("signInRequired")}</p>;
  }

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="text-sm uppercase tracking-wide text-amber-300 mb-2">
        {t("title")}
      </h2>
      <p className="text-sm text-zinc-400 mb-4">{t("blurb")}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs text-zinc-500 mb-1">
            {t("channelLabel")}
          </legend>
          <ChannelChoice
            value="email"
            current={channel}
            onChange={setChannel}
            label={t("channel.email")}
            sub={profile?.email ?? t("channel.emailMissing")}
            disabled={!profile?.email}
          />
          <ChannelChoice
            value="sms"
            current={channel}
            onChange={setChannel}
            label={t("channel.sms")}
            sub={profile?.phone ?? t("channel.smsSub")}
          />
          <ChannelChoice
            value="whatsapp"
            current={channel}
            onChange={setChannel}
            label={t("channel.whatsapp")}
            sub={
              whatsappEnabled
                ? (profile?.phone ?? t("channel.whatsappSub"))
                : t("channel.whatsappDisabled")
            }
            disabled={!whatsappEnabled}
          />
        </fieldset>

        {needsPhone && (
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            {t("phoneLabel")}
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+1 555 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
            />
          </label>
        )}

        {channel === "sms" && (
          <label className="flex items-start gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={smsConsent}
              onChange={(e) => setSmsConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span>{t("consentSms")}</span>
          </label>
        )}
        {channel === "whatsapp" && (
          <label className="flex items-start gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={waConsent}
              onChange={(e) => setWaConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span>{t("consentWhatsapp")}</span>
          </label>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="self-start rounded-md bg-amber-400 text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? t("sending") : t("send")}
        </button>

        {needsSmsConsent && channel === "sms" && (
          <p className="text-xs text-amber-300">{t("needsSmsConsent")}</p>
        )}
        {needsWaConsent && channel === "whatsapp" && (
          <p className="text-xs text-amber-300">{t("needsWaConsent")}</p>
        )}
      </form>

      {outcome && (
        <div className="mt-4 text-sm">
          {outcome.ok ? (
            <p className="text-emerald-400">
              {t("sentVia", {
                channel: outcome.resolved_channel ?? channel,
              })}
              {outcome.used_fallback && outcome.fallback_reason
                ? ` (${t("fallbackUsed")}: ${outcome.fallback_reason})`
                : ""}
            </p>
          ) : (
            <p className="text-rose-400">
              {t("sendFailed")}: {outcome.error ?? "unknown error"}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ChannelChoice({
  value,
  current,
  onChange,
  label,
  sub,
  disabled,
}: {
  value: Channel;
  current: Channel;
  onChange: (c: Channel) => void;
  label: string;
  sub: string;
  disabled?: boolean;
}) {
  const checked = current === value;
  return (
    <label
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
        checked
          ? "border-amber-400/60 bg-amber-400/10"
          : "border-zinc-800 bg-zinc-900/30"
      } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <input
        type="radio"
        name="delivery-channel"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="mt-1"
      />
      <span className="flex flex-col">
        <span className="font-medium text-zinc-100">{label}</span>
        <span className="text-xs text-zinc-400">{sub}</span>
      </span>
    </label>
  );
}
