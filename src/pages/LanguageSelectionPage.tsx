import { useTranslation } from "react-i18next";

import { ClientBrandPanel } from "../components/ClientBrandPanel";
import backgroundImg from "../assets/background.png";
import logoImg from "../assets/logo.png";
import type { AppLanguage } from "../i18n";

type LanguageSelectionPageProps = {
  onSelectLanguage: (language: AppLanguage) => void;
};

const languageCards: Array<{ code: AppLanguage; label: string }> = [
  { code: "fr", label: "Français" },
  { code: "ar", label: "العربية" },
];

export function LanguageSelectionPage({ onSelectLanguage }: LanguageSelectionPageProps) {
  const { t, i18n } = useTranslation();
  const tFr = i18n.getFixedT("fr");
  const tAr = i18n.getFixedT("ar");

  return (
    <main dir="ltr" className="relative min-h-screen w-full text-slate-900">
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

      <div className="grid min-h-screen w-full lg:grid-cols-[1.15fr_0.85fr] xl:grid-cols-[1.2fr_0.8fr]">
        {/* ---------- LEFT: bilingual brand panel (same template as login) ---------- */}
        <ClientBrandPanel bilingual hideBackground className="hidden lg:flex lg:min-h-screen" />

        {/* ---------- RIGHT: language choice ---------- */}
        <section className="relative flex min-h-screen w-full items-center justify-center overflow-y-auto px-6 py-12 sm:px-10 lg:min-h-screen">
          <div className="relative w-full max-w-sm">
            {/* Mobile-only brand header — big logo + name, centered */}
            <div className="mb-10 flex flex-col items-center text-center lg:hidden">
              <span className="flex h-28 w-28 shrink-0 items-center justify-center rounded-[2rem] bg-white shadow-[0_20px_55px_rgba(2,6,23,0.4)] ring-1 ring-white/60 sm:h-32 sm:w-32">
                <img src={logoImg} alt={t("appName")} className="h-20 w-auto sm:h-24" />
              </span>
              <p className="mt-5 text-3xl font-black tracking-tight text-white drop-shadow-[0_4px_20px_rgba(2,6,23,0.55)] sm:text-4xl">
                {t("appName")}
              </p>
            </div>

            {/* Heading */}
            <div className="text-center animate-fade-in-up">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-100 bg-cyan-50/60 px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.35em] text-cyan-600 shadow-[0_2px_12px_rgba(6,182,212,0.08)] backdrop-blur-md">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
                Langue / اللغة
              </span>
              <h2 className="mt-6 text-3xl font-black tracking-tight text-white drop-shadow-[0_4px_20px_rgba(2,6,23,0.55)] sm:text-4xl lg:text-4xl">
                {tFr("chooseLanguageTitle")}
              </h2>
              <p dir="rtl" lang="ar" className="mt-2 text-3xl font-black tracking-tight text-white drop-shadow-[0_4px_20px_rgba(2,6,23,0.55)] sm:text-4xl">
                {tAr("chooseLanguageTitle")}
              </p>
            </div>

            {/* Language buttons */}
            <div className="mt-9 grid gap-4">
              {languageCards.map((language, index) => {
                const isAr = language.code === "ar";
                return (
                  <button
                    key={language.code}
                    type="button"
                    onClick={() => onSelectLanguage(language.code)}
                    dir={isAr ? "rtl" : "ltr"}
                    className="group relative flex w-full items-center gap-5 overflow-hidden rounded-3xl border border-slate-100 bg-white px-6 py-5 text-start shadow-[0_12px_40px_rgba(8,145,178,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-200/80 hover:shadow-[0_22px_60px_rgba(8,145,178,0.15)] focus:outline-none focus:ring-4 focus:ring-cyan-100/80 cursor-pointer animate-fade-in-up"
                    style={{ animationDelay: `${140 + index * 120}ms` }}
                  >
                    {/* Hover sheen */}
                    <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-cyan-50/40 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                    {/* Accent bar */}
                    <span className="pointer-events-none absolute inset-y-0 start-0 w-1.5 bg-gradient-to-b from-cyan-400 to-sky-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                    {/* Badge — always at the leading end (left for FR, right for AR) */}
                    <span className="relative flex h-10 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-50 border border-cyan-100/80 text-xs font-black uppercase tracking-wider text-cyan-600 transition-colors duration-300 group-hover:bg-cyan-100 group-hover:text-cyan-700">
                      {language.code}
                    </span>

                    {/* Label — fills the middle */}
                    <span
                      lang={language.code}
                      className="relative min-w-0 flex-1 text-lg font-black tracking-tight text-slate-800 transition-colors duration-300 group-hover:text-cyan-950 text-start"
                    >
                      {language.label}
                    </span>

                    {/* Arrow circle — always on the trailing end (right for FR, left for AR) */}
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-50 border border-slate-100 text-slate-400 transition-all duration-300 group-hover:bg-cyan-500 group-hover:border-cyan-500 group-hover:text-white">
                      <span className={`transition-transform duration-300 flex items-center justify-center ${isAr ? "group-hover:-translate-x-1" : "group-hover:translate-x-1"}`}>
                        {isAr ? "←" : "→"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
