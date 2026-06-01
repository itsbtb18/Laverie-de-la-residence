import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { saveAuthSession } from "../auth/session";
import type { AppLanguage } from "../i18n";
import backgroundImg from "../assets/background.png";
import logoImg from "../assets/logo.png";

type StaffLoginProps = {
  language: AppLanguage;
  onChangeLanguage?: (language: AppLanguage) => void;
};

type StaffLoginResponse = {
  access_token: string;
  role: "ADMIN" | "SUPER_ADMIN" | "CUSTOMER";
  establishment_id: number | null;
  establishment_name?: string | null;
  user_id: number;
  phone: string;
  detail?: string;
};

export function StaffLogin({ language, onChangeLanguage }: StaffLoginProps) {
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
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/staff/login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneNumber, secret_code: secretCode }),
      });

      const payload = (await response.json()) as StaffLoginResponse;

      if (!response.ok) {
        throw new Error(payload.detail || t("authInvalidCredentials"));
      }

      if (payload.role === "CUSTOMER") {
        throw new Error(t("staffAccessDenied"));
      }

      saveAuthSession({
        accessToken: payload.access_token,
        role: payload.role,
        establishmentId: payload.establishment_id,
        establishmentName: payload.establishment_name ?? null,
        userId: payload.user_id,
        phone: payload.phone,
      });

      if (payload.role === "SUPER_ADMIN") {
        navigate("/superadmin/dashboard", { replace: true });
        return;
      }

      navigate("/admin/dashboard/creation", { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("staffAccessDenied"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      className="relative h-screen w-screen overflow-hidden text-slate-900"
      style={{
        backgroundImage: `linear-gradient(rgba(2, 132, 199, 0.28), rgba(2, 132, 199, 0.14)), url(${backgroundImg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px]" />
      <div className="relative z-10 grid h-full w-full lg:grid-cols-[1.15fr_0.85fr] xl:grid-cols-[1.25fr_0.75fr]">
      {/* Colonne gauche (Présentation Staff - masquée sur mobile) */}
      <div className="hidden lg:flex flex-col justify-between p-10 xl:p-12 h-screen overflow-hidden relative z-10 animate-fade-in">
        {/* Top Header */}
        <div className="flex items-center gap-3 bg-white/90 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-sky-100/50 shadow-sm self-start">
          <img src={logoImg} alt="Logo" className="h-7 w-auto animate-scale-in" />
          <span className="text-base font-black tracking-tight text-slate-900">Laverie de la residence</span>
        </div>

        {/* Center Presentation - Glassmorphism hero box tailored for Staff Control */}
        <div className="max-w-xl bg-white/92 backdrop-blur-lg rounded-[2rem] border border-sky-100/70 p-8 xl:p-10 shadow-[0_24px_60px_rgba(14,165,233,0.12)] my-auto space-y-4">
          <span className="inline-block rounded-full bg-slate-950 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-white">
            {t("staffHeroBadge")}
          </span>
          <h1 className="text-3xl xl:text-4xl font-black text-slate-900 leading-[1.3] tracking-tight">
            {isArabic ? (
              <>
                {t("staffHeroTitle")}
              </>
            ) : (
              <>
                {t("staffHeroTitle")}
              </>
            )}
          </h1>
          {t("staffHeroSubtitle") ? (
            <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4 text-xs xl:text-sm text-slate-600 leading-relaxed">
              {t("staffHeroSubtitle")}
            </div>
          ) : null}
        </div>

        <div className="h-1" />
      </div>

      {/* Colonne droite (Formulaire de Connexion Staff) */}
      <div
        dir={isArabic ? "rtl" : "ltr"}
        lang={language}
        className="w-full h-screen bg-white/92 border-l border-sky-100 shadow-[0_0_80px_rgba(14,165,233,0.14)] flex flex-col justify-center p-8 sm:p-12 xl:p-16 backdrop-blur-md relative z-10 overflow-hidden"
      >
        <div className="my-auto space-y-6 w-full max-w-sm mx-auto">
          {/* Logo & Header */}
          <div className="text-center space-y-3">
            <img
              src={logoImg}
              alt="Logo Laverie de la residence"
              className="mx-auto h-20 w-auto drop-shadow-sm transition duration-300 hover:scale-105 animate-scale-in"
            />
            <div className="space-y-1">
              <h2 className="text-2xl font-black tracking-tight text-slate-900 animate-fade-in-up delay-100">
                {t("staffLoginTitle")}
              </h2>
              <p className="text-xs text-slate-400 animate-fade-in-up delay-200">
                {t("staffLoginSubtitle")}
              </p>
            </div>
          </div>

          {/* Sélecteur de Langue Premium */}
          <div className="inline-flex w-full overflow-hidden rounded-2xl border border-sky-100 bg-sky-50/50 p-1 text-xs font-semibold animate-fade-in-up delay-300">
            <button
              type="button"
              onClick={() => switchLanguage("fr")}
              className={`flex-1 rounded-xl py-2.5 text-center transition ${
                language === "fr"
                  ? "bg-sky-600 text-white shadow-md shadow-sky-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Français
            </button>
            <button
              type="button"
              onClick={() => switchLanguage("ar")}
              className={`flex-1 rounded-xl py-2.5 text-center transition ${
                language === "ar"
                  ? "bg-sky-600 text-white shadow-md shadow-sky-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              العربية
            </button>
          </div>

          {/* Formulaire */}
          <form onSubmit={submit} className="space-y-4 animate-fade-in-up delay-400">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                {t("phoneNumber")}
              </label>
              <input
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                inputMode="numeric"
                dir="ltr"
                placeholder=""
                className="w-full rounded-2xl border border-sky-100 bg-sky-50/30 px-4 py-3 text-slate-950 shadow-sm outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100 text-base font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                {t("secretCode")}
              </label>
              <input
                value={secretCode}
                onChange={(event) => setSecretCode(event.target.value)}
                type="password"
                inputMode="numeric"
                dir="ltr"
                placeholder=""
                className="w-full rounded-2xl border border-sky-100 bg-sky-50/30 px-4 py-3 text-slate-950 shadow-sm outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100 text-base font-medium tracking-[0.25em]"
              />
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700 animate-scale-in">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-200 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-slate-200 cursor-pointer mt-2"
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
                t("staffSignIn")
              )}
            </button>
          </form>
        </div>
      </div>
      </div>
    </main>
  );
}
