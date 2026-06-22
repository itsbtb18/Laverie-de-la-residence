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
import backgroundImg from "../assets/background.png";

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

export function UserLogin({ language }: UserLoginProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [secretCode, setSecretCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isArabic = language === "ar";

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
      {/* Full-screen background photo (shared behind both columns) */}
      <div
        className="absolute inset-0 -z-20"
        style={{
          backgroundImage: `url(${backgroundImg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      {/* Brand cyan tint across the whole screen for consistent text legibility */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-cyan-900/55 via-sky-900/45 to-slate-900/55" />

      {/* Back Button — pinned to the top-right of the page (both LTR & RTL) */}
      <button
        type="button"
        onClick={() => navigate("/language")}
        className={`absolute top-6 z-30 flex items-center justify-center gap-2 rounded-full border border-slate-100 bg-white px-4 py-2 text-xs font-bold text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-100 cursor-pointer ${isArabic ? "left-6" : "right-6"}`}
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

      <div className="relative z-10 grid min-h-screen w-full lg:grid-cols-[1.15fr_0.85fr] xl:grid-cols-[1.25fr_0.75fr]">
      {/* Colonne gauche (Présentation - masquée sur mobile) */}
      <ClientBrandPanel hideBackground className="hidden lg:flex lg:min-h-screen" />

      {/* Colonne droite (Formulaire de Connexion style Sidebar Plein Écran) */}
      <div
        dir={isArabic ? "rtl" : "ltr"}
        lang={language}
        className="w-full min-h-screen flex flex-col justify-center p-8 sm:p-12 xl:p-16 relative z-10 overflow-y-auto"
      >
        <div className="my-auto space-y-6 w-full max-w-sm mx-auto relative z-10 rounded-3xl border border-white/60 bg-white/90 p-8 shadow-[0_30px_80px_rgba(2,6,23,0.35)] backdrop-blur-xl">
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
                  className={`peer w-full rounded-2xl border border-slate-100 bg-slate-50/60 py-3.5 text-slate-950 shadow-sm outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-50/70 text-base font-semibold ${isArabic ? "pr-11 pl-4 text-right" : "pl-11 pr-4"}`}
                />
                <svg className={`absolute h-4.5 w-4.5 text-slate-400 transition-colors duration-200 peer-focus:text-cyan-500 pointer-events-none ${isArabic ? "right-4" : "left-4"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                  className={`peer w-full rounded-2xl border border-slate-100 bg-slate-50/60 py-3.5 text-slate-950 shadow-sm outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-50/70 text-base font-semibold tracking-[0.25em] ${isArabic ? "pr-11 pl-4 text-right" : "pl-11 pr-4"}`}
                />
                <svg className={`absolute h-4.5 w-4.5 text-slate-400 transition-colors duration-200 peer-focus:text-cyan-500 pointer-events-none ${isArabic ? "right-4" : "left-4"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
          <div className="rounded-2xl border-2 border-cyan-200 bg-cyan-50 p-6 shadow-sm animate-fade-in-up delay-500">
            <div className="flex items-start gap-4">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-cyan-600">
                <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-base leading-6 text-slate-700">
                  <button
                    type="button"
                    onClick={() => navigate("/guide")}
                    className="font-black text-sky-600 underline decoration-sky-300 decoration-2 underline-offset-2 transition hover:text-sky-700 hover:decoration-sky-500"
                  >
                    {t("loginFirstVisitQuestion")}
                  </button>{" "}
                  {t("loginInPersonNotice")}
                </p>
                <p className="mt-2 text-base font-bold text-cyan-700">
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
