import { useTranslation } from "react-i18next";

import type { AppLanguage } from "../i18n";
import backgroundImg from "../assets/background.png";
import logoImg from "../assets/logo.png";

type LanguageSelectionPageProps = {
  onSelectLanguage: (language: AppLanguage) => void;
};

const languageCards: Array<{ code: AppLanguage; label: string; sub: string; flag: string }> = [
  { code: "fr", label: "Français", sub: "Continuer en français", flag: "🇫🇷" },
  { code: "ar", label: "العربية", sub: "المتابعة بالعربية", flag: "🇩🇿" },
];

function CheckIcon() {
  return (
    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25 backdrop-blur">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-4 w-4 text-white">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </span>
  );
}

export function LanguageSelectionPage({ onSelectLanguage }: LanguageSelectionPageProps) {
  const { i18n } = useTranslation();
  const tFr = i18n.getFixedT("fr");
  const tAr = i18n.getFixedT("ar");

  const features = [
    { fr: tFr("brandFeature1"), ar: tAr("brandFeature1") },
    { fr: tFr("brandFeature2"), ar: tAr("brandFeature2") },
    { fr: tFr("brandFeature3"), ar: tAr("brandFeature3") },
  ];

  return (
    <main dir="ltr" className="relative min-h-screen w-full overflow-hidden text-slate-900">
      <div className="grid min-h-screen w-full lg:grid-cols-[1.15fr_0.85fr] xl:grid-cols-[1.2fr_0.8fr]">
        {/* ---------- LEFT: bilingual brand panel ---------- */}
        <aside className="relative isolate flex min-h-[46vh] flex-col overflow-hidden px-6 py-8 text-white sm:px-10 sm:py-10 lg:min-h-screen">
          {/* Background photo */}
          <div
            className="absolute inset-0 -z-20 scale-105"
            style={{ backgroundImage: `url(${backgroundImg})`, backgroundSize: "cover", backgroundPosition: "center" }}
          />
          {/* Legibility gradients (dark, not blue) */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-slate-950/92 via-slate-950/58 to-slate-900/35" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-slate-950/55 to-transparent" />
          {/* Glow accents */}
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -left-28 bottom-10 h-72 w-72 rounded-full bg-sky-500/20 blur-[100px]" />
            <div className="absolute -right-20 top-0 h-64 w-64 rounded-full bg-cyan-400/15 blur-[100px]" />
          </div>

          {/* Brand identity */}
          <div className="relative z-10 flex items-center gap-4 animate-fade-in">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white shadow-[0_18px_45px_rgba(2,6,23,0.4)] ring-1 ring-white/60 sm:h-20 sm:w-20">
              <img src={logoImg} alt={tFr("appName")} className="h-11 w-auto sm:h-14" />
            </span>
            <div className="leading-tight">
              <p className="text-xl font-black tracking-tight text-white drop-shadow-[0_3px_16px_rgba(2,6,23,0.5)] sm:text-3xl">
                {tFr("appName")}
              </p>
              <p className="mt-1.5 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.4em] text-white/60 sm:text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                {tFr("brandTrustLabel")}
              </p>
            </div>
          </div>

          {/* Bilingual hero */}
          <div className="relative z-10 flex flex-1 flex-col justify-center gap-7 py-9 sm:gap-8 sm:py-10">
            {/* Slogan — FR + AR */}
            <div className="space-y-3 animate-fade-in-up delay-100">
              <h1 className="max-w-[16ch] text-3xl font-black leading-[1.05] tracking-tight drop-shadow-[0_6px_30px_rgba(2,6,23,0.45)] sm:text-4xl xl:text-5xl">
                {tFr("brandSlogan")}
              </h1>
              <h2
                dir="rtl"
                lang="ar"
                className="text-2xl font-black leading-[1.2] tracking-tight text-white/85 sm:text-3xl xl:text-4xl"
              >
                {tAr("brandSlogan")}
              </h2>
            </div>

            {/* Tagline — FR + AR */}
            <div className="max-w-md space-y-2 animate-fade-in-up delay-200">
              <p className="text-sm leading-7 text-white/80 sm:text-[15px]">{tFr("brandTagline")}</p>
              <p dir="rtl" lang="ar" className="text-sm leading-7 text-white/65 sm:text-[15px]">
                {tAr("brandTagline")}
              </p>
            </div>

            {/* Features — bilingual rows */}
            <ul className="grid gap-4 animate-fade-in-up delay-300">
              {features.map((feature) => (
                <li key={feature.fr} className="flex items-start gap-3.5">
                  <CheckIcon />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white/95 sm:text-[15px]">{feature.fr}</p>
                    <p dir="rtl" lang="ar" className="text-xs font-medium text-white/55 sm:text-sm">
                      {feature.ar}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* ---------- RIGHT: language choice ---------- */}
        <section className="relative flex min-h-[54vh] items-center justify-center bg-[radial-gradient(circle_at_top,_#eaf4ff,_#ffffff_55%)] px-6 py-12 sm:px-10 lg:min-h-screen">
          <div className="w-full max-w-sm">
            {/* Heading */}
            <div className="text-center animate-fade-in-up">
              <span className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.32em] text-sky-600">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                Langue / اللغة
              </span>
              <h2 className="mt-5 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                {tFr("chooseLanguageTitle")}
              </h2>
              <p dir="rtl" lang="ar" className="mt-1 text-lg font-bold text-slate-500 sm:text-xl">
                {tAr("chooseLanguageTitle")}
              </p>
              <p className="mt-3 text-sm font-medium text-slate-400">{tFr("chooseLanguageSubtitle")}</p>
            </div>

            {/* Language buttons */}
            <div className="mt-8 grid gap-4">
              {languageCards.map((language, index) => {
                const isAr = language.code === "ar";
                return (
                  <button
                    key={language.code}
                    type="button"
                    onClick={() => onSelectLanguage(language.code)}
                    dir={isAr ? "rtl" : "ltr"}
                    className="group flex w-full items-center gap-4 rounded-[1.4rem] border border-sky-100 bg-white px-5 py-4 text-left shadow-[0_16px_40px_rgba(14,165,233,0.1)] transition duration-300 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_24px_60px_rgba(14,165,233,0.22)] focus:outline-none focus:ring-4 focus:ring-sky-200/70 animate-fade-in-up"
                    style={{ animationDelay: `${140 + index * 110}ms` }}
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-50 to-cyan-50 text-2xl shadow-inner ring-1 ring-sky-100">
                      {language.flag}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-black text-slate-900 sm:text-xl">{language.label}</span>
                      <span className="block text-xs font-medium text-slate-500">{language.sub}</span>
                    </span>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 text-lg text-white shadow-[0_10px_24px_rgba(14,165,233,0.4)] transition group-hover:scale-110">
                      {isAr ? "←" : "→"}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Footer note */}
            <p className="mt-9 text-center text-xs font-medium text-slate-400">
              {tFr("brandTrustLabel")} • {tFr("appName")}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
