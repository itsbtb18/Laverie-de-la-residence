import { useTranslation } from "react-i18next";

import { ClientBrandPanel } from "../components/ClientBrandPanel";
import type { AppLanguage } from "../i18n";

type LanguageSelectionPageProps = {
  onSelectLanguage: (language: AppLanguage) => void;
};

const languageCards: Array<{ code: AppLanguage; label: string }> = [
  { code: "fr", label: "Français" },
  { code: "ar", label: "العربية" },
];

export function LanguageSelectionPage({ onSelectLanguage }: LanguageSelectionPageProps) {
  const { i18n } = useTranslation();
  const tFr = i18n.getFixedT("fr");
  const tAr = i18n.getFixedT("ar");

  return (
    <main dir="ltr" className="relative min-h-screen w-full text-slate-900">
      <div className="grid min-h-screen w-full lg:grid-cols-[1.15fr_0.85fr] xl:grid-cols-[1.2fr_0.8fr]">
        {/* ---------- LEFT: bilingual brand panel (same template as login) ---------- */}
        <ClientBrandPanel bilingual className="hidden lg:flex lg:min-h-screen" />

        {/* ---------- RIGHT: language choice ---------- */}
        <section className="relative flex min-h-screen w-full items-center justify-center overflow-y-auto bg-gradient-to-b from-slate-50 via-white to-slate-50/60 px-6 py-12 sm:px-10 lg:min-h-screen">
          {/* Tech grid background pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#0891b206_1px,transparent_1px),linear-gradient(to_bottom,#0891b206_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

          {/* Premium glowing mesh accents */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-cyan-300/10 to-transparent blur-[120px]" />
            <div className="absolute right-[-10%] top-[-10%] h-[350px] w-[350px] rounded-full bg-cyan-200/15 blur-[90px]" />
            <div className="absolute left-[-10%] bottom-[-10%] h-[350px] w-[350px] rounded-full bg-sky-200/20 blur-[95px]" />
          </div>

          <div className="relative w-full max-w-sm">
            {/* Heading */}
            <div className="text-center animate-fade-in-up">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-100 bg-cyan-50/60 px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.35em] text-cyan-600 shadow-[0_2px_12px_rgba(6,182,212,0.08)] backdrop-blur-md">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
                Langue / اللغة
              </span>
              <h2 className="mt-6 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 bg-clip-text text-transparent">
                {tFr("chooseLanguageTitle")}
              </h2>
              <p dir="rtl" lang="ar" className="mt-2 text-xl font-extrabold tracking-tight text-slate-400 sm:text-2xl">
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
