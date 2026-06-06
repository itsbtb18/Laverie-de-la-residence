import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { saveAuthSession } from "../auth/session";
import type { AppLanguage } from "../i18n";
import {
  readApiErrorPayload,
  resolveApiErrorMessage,
  validateLoginForm,
} from "../utils/apiErrors";
import { normalizePhoneInput } from "../utils/validation";
import { ClientBrandPanel } from "../components/ClientBrandPanel";
import logoImg from "../assets/logo.png";

type UserLoginProps = {
  language: AppLanguage;
  onChangeLanguage?: (language: AppLanguage) => void;
};

type LoginResponse = {
  access_token: string;
  role: "CUSTOMER" | "ADMIN" | "SUPER_ADMIN";
  establishment_id: number | null;
  establishment_name?: string | null;
  user_id: number;
  phone: string;
};

export function UserLogin({ language, onChangeLanguage }: UserLoginProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [secretCode, setSecretCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isArabic = language === "ar";

  const switchLanguage = (nextLanguage: AppLanguage) => {
    i18n.changeLanguage(nextLanguage);
    onChangeLanguage?.(nextLanguage);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const validationError = validateLoginForm(phoneNumber, secretCode, t);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: normalizePhoneInput(phoneNumber),
          secret_code: secretCode.trim(),
        }),
      });

      const payload = await readApiErrorPayload(response);

      if (!response.ok) {
        setError(
          resolveApiErrorMessage(payload, "customerLogin", t, {
            status: response.status,
          })
        );
        return;
      }

      const data = payload as LoginResponse;
      saveAuthSession({
        accessToken: data.access_token,
        role: data.role,
        establishmentId: data.establishment_id,
        establishmentName: data.establishment_name ?? null,
        userId: data.user_id,
        phone: data.phone,
      });

      navigate("/appointments", { replace: true });
    } catch {
      setError(t("errors.networkError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-screen w-full text-slate-900">
      <div className="relative z-10 grid min-h-screen w-full lg:grid-cols-[1.15fr_0.85fr] xl:grid-cols-[1.25fr_0.75fr]">
      {/* Colonne gauche (Présentation - masquée sur mobile) */}
      <ClientBrandPanel className="hidden lg:flex lg:min-h-screen" />

      {/* Colonne droite (Formulaire de Connexion style Sidebar Plein Écran) */}
      <div
        dir={isArabic ? "rtl" : "ltr"}
        lang={language}
        className="w-full min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50/60 border-l border-sky-100 shadow-[0_0_80px_rgba(14,165,233,0.14)] flex flex-col justify-center p-8 sm:p-12 xl:p-16 backdrop-blur-md relative z-10 overflow-y-auto"
      >
        {/* Tech grid background pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0891b203_1px,transparent_1px),linear-gradient(to_bottom,#0891b206_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

        {/* Premium glowing mesh accents */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-16 top-10 h-56 w-56 rounded-full bg-cyan-200/10 blur-[90px]" />
          <div className="absolute -left-10 bottom-10 h-56 w-56 rounded-full bg-sky-200/15 blur-[90px]" />
        </div>

        {/* Back Button */}
        <button
          type="button"
          onClick={() => navigate("/language")}
          className="absolute top-6 right-6 flex items-center justify-center gap-2 rounded-full border border-slate-100 bg-white px-4 py-2 text-xs font-bold text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-100 cursor-pointer z-20"
        >
          {isArabic ? (
            <>
              <span>{t("bookingBack") || "رجوع"}</span>
              <span className="text-sm">→</span>
            </>
          ) : (
            <>
              <span className="text-sm">←</span>
              <span>{t("bookingBack") || "Retour"}</span>
            </>
          )}
        </button>

        <div className="my-auto space-y-6 w-full max-w-sm mx-auto relative z-10">
          {/* Logo & Header */}
          <div className="text-center space-y-3">
            <img
              src={logoImg}
              alt="Logo Laverie de la residence"
              className="mx-auto h-20 w-auto drop-shadow-sm transition duration-300 hover:scale-105 animate-scale-in"
            />
            <div className="space-y-1">
              <h2 className="text-2xl font-black tracking-tight text-slate-900 animate-fade-in-up delay-100 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 bg-clip-text text-transparent">
                {t("userLoginTitle")}
              </h2>
              <p className="text-xs font-medium text-slate-400 animate-fade-in-up delay-200">
                {t("userLoginSubtitle")}
              </p>
            </div>
          </div>

          {/* Sélecteur de Langue Premium */}
          <div className="inline-flex w-full overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/70 p-1 text-xs font-bold shadow-inner animate-fade-in-up delay-300">
            <button
              type="button"
              onClick={() => switchLanguage("fr")}
              className={`flex-1 rounded-xl py-2.5 text-center transition-all duration-200 cursor-pointer ${
                language === "fr"
                  ? "bg-white border border-cyan-100/70 text-cyan-600 font-extrabold shadow-[0_4px_20px_rgba(6,182,212,0.12)]"
                  : "text-slate-500 hover:text-slate-900 hover:bg-white/40"
              }`}
            >
              Français
            </button>
            <button
              type="button"
              onClick={() => switchLanguage("ar")}
              className={`flex-1 rounded-xl py-2.5 text-center transition-all duration-200 cursor-pointer ${
                language === "ar"
                  ? "bg-white border border-cyan-100/70 text-cyan-600 font-extrabold shadow-[0_4px_20px_rgba(6,182,212,0.12)]"
                  : "text-slate-500 hover:text-slate-900 hover:bg-white/40"
              }`}
            >
              العربية
            </button>
          </div>

          {/* Formulaire */}
          <form onSubmit={submit} className="space-y-4 animate-fade-in-up delay-400">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                {t("phoneNumber")}
              </label>
              <div className="relative flex items-center">
                <input
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  inputMode="numeric"
                  dir="ltr"
                  placeholder={t("phonePlaceholder")}
                  className="peer w-full rounded-2xl border border-slate-100 bg-slate-50/60 pl-11 pr-4 py-3.5 text-slate-950 shadow-sm outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-50/70 text-base font-semibold"
                />
                <svg className="absolute left-4 h-4.5 w-4.5 text-slate-400 transition-colors duration-200 peer-focus:text-cyan-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                {t("secretCode")}
              </label>
              <div className="relative flex items-center">
                <input
                  value={secretCode}
                  onChange={(event) => setSecretCode(event.target.value)}
                  type="password"
                  inputMode="numeric"
                  dir="ltr"
                  placeholder={t("secretCodePlaceholder")}
                  className="peer w-full rounded-2xl border border-slate-100 bg-slate-50/60 pl-11 pr-4 py-3.5 text-slate-950 shadow-sm outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-50/70 text-base font-semibold tracking-[0.25em]"
                />
                <svg className="absolute left-4 h-4.5 w-4.5 text-slate-400 transition-colors duration-200 peer-focus:text-cyan-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700 animate-scale-in">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-sky-600 px-5 py-4 text-xs font-extrabold uppercase tracking-wider text-white shadow-lg shadow-cyan-100 transition duration-200 hover:-translate-y-0.5 hover:from-cyan-400 hover:to-sky-500 hover:shadow-[0_12px_30px_rgba(6,182,212,0.35)] disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-cyan-100/80 cursor-pointer mt-2"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t("loading")}
                </span>
              ) : (
                t("signIn")
              )}
            </button>
          </form>

          {/* In-person registration notice */}
          <div className="rounded-2xl border border-cyan-100 bg-cyan-50/50 p-4 animate-fade-in-up delay-500">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-cyan-600">
                <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-xs leading-5 text-slate-600">
                  {t("loginInPersonNotice")}
                </p>
                <p className="mt-1 text-[11px] font-bold text-cyan-700">
                  {t("loginInPersonNoticeHighlight")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </main>
  );
}
