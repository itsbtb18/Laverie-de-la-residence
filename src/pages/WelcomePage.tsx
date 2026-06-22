import { useTranslation } from "react-i18next";

import { ClientBrandPanel } from "../components/ClientBrandPanel";
import backgroundImg from "../assets/background.png";
import logoImg from "../assets/logo.png";

type WelcomePageProps = {
  onStart: () => void;
};

export function WelcomePage({ onStart }: WelcomePageProps) {
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

        {/* ---------- RIGHT: welcome / start ---------- */}
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

            {/* Mobile-only slogan (the desktop one lives in the left brand panel) */}
            <div className="mb-10 text-center lg:hidden">
              <h1 className="text-4xl font-black leading-[1.1] tracking-tight text-white drop-shadow-[0_4px_20px_rgba(2,6,23,0.55)] sm:text-5xl">
                {tFr("brandSlogan")}
              </h1>
              <h2
                dir="rtl"
                lang="ar"
                className="mt-4 text-3xl font-black leading-[1.3] tracking-tight text-white drop-shadow-[0_4px_20px_rgba(2,6,23,0.55)] sm:text-4xl"
              >
                {tAr("brandSlogan")}
              </h2>
            </div>

            {/* Heading (desktop) */}
            <div className="hidden text-center animate-fade-in-up lg:block">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-100 bg-cyan-50/60 px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.35em] text-cyan-600 shadow-[0_2px_12px_rgba(6,182,212,0.08)] backdrop-blur-md">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
                Bienvenue / مرحباً
              </span>
              <h2 className="mt-6 text-3xl font-black tracking-tight text-white drop-shadow-[0_4px_20px_rgba(2,6,23,0.55)] sm:text-4xl">
                {tFr("brandSlogan")}
              </h2>
            </div>

            {/* Start button */}
            <div className="mt-9 grid gap-4">
              <button
                type="button"
                onClick={onStart}
                className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-3xl bg-gradient-to-r from-cyan-500 to-sky-500 px-6 py-5 text-center text-lg font-black tracking-tight text-white shadow-[0_18px_50px_rgba(8,145,178,0.35)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_26px_70px_rgba(8,145,178,0.45)] focus:outline-none focus:ring-4 focus:ring-cyan-200/80 cursor-pointer animate-fade-in-up"
              >
                {/* Hover sheen */}
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                <span className="relative">{tFr("getStarted")}</span>
                <span className="relative transition-transform duration-300 group-hover:translate-x-1">→</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
