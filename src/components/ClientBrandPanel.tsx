import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import backgroundImg from "../assets/background.png";
import logoImg from "../assets/logo.png";

type ClientBrandPanelProps = {
  /** Extra classes appended to the root <aside> (e.g. min-height tweaks per page). */
  className?: string;
  /** Optional content rendered at the bottom of the panel (summary card, stats, etc.). */
  footer?: ReactNode;
  /** Optional eyebrow text shown above the slogan. */
  eyebrow?: string;
  /**
   * When true, the slogan / tagline / features are shown in BOTH French and
   * Arabic (used on the language-selection page so visitors of either language
   * understand it). Typography stays identical to the single-language version.
   */
  bilingual?: boolean;
};

function CheckIcon() {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25 backdrop-blur">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-4 w-4 text-white">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </span>
  );
}

/**
 * Unified brand panel used as the left column across every client-facing page
 * (language selection, login, booking wizard, confirmation...).
 *
 * Photo-forward design: the laundry background stays fully visible behind an
 * elegant dark gradient (no flat blue wash), with the logo, slogan, feature
 * highlights and an optional footer slot giving every client page one
 * consistent, premium template.
 */
export function ClientBrandPanel({ className = "", footer, eyebrow, bilingual = false }: ClientBrandPanelProps) {
  const { t, i18n } = useTranslation();
  const tFr = i18n.getFixedT("fr");
  const tAr = i18n.getFixedT("ar");

  const features = bilingual
    ? [
        { main: tFr("brandFeature1"), sub: tAr("brandFeature1") },
        { main: tFr("brandFeature2"), sub: tAr("brandFeature2") },
        { main: tFr("brandFeature3"), sub: tAr("brandFeature3") },
      ]
    : [{ main: t("brandFeature1") }, { main: t("brandFeature2") }, { main: t("brandFeature3") }];

  return (
    <aside
      className={`relative isolate flex min-h-[42vh] flex-col justify-between overflow-hidden px-6 py-8 text-white sm:px-10 sm:py-12 lg:min-h-full ${className}`}
    >
      {/* Background photo */}
      <div
        className="absolute inset-0 -z-20 scale-105"
        style={{
          backgroundImage: `url(${backgroundImg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      {/* Elegant legibility gradients (dark, not blue) */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-slate-950/92 via-slate-950/55 to-slate-900/30" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(2,6,23,0.55),transparent)] ltr:bg-[linear-gradient(to_right,rgba(2,6,23,0.55),transparent)] rtl:bg-[linear-gradient(to_left,rgba(2,6,23,0.55),transparent)]" />
      {/* Subtle brand glow accents */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-28 bottom-10 h-72 w-72 rounded-full bg-sky-500/20 blur-[90px]" />
        <div className="absolute -right-20 top-0 h-64 w-64 rounded-full bg-cyan-400/15 blur-[90px]" />
      </div>

      {/* Top: brand identity — the hero element (big, premium, modern) */}
      <div className="relative z-10 flex items-center gap-4 animate-fade-in sm:gap-6">
        <span className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.5rem] bg-white shadow-[0_24px_60px_rgba(2,6,23,0.45)] ring-1 ring-white/60 sm:h-28 sm:w-28 sm:rounded-[1.85rem]">
          <span className="absolute -inset-1 -z-10 rounded-[1.85rem] bg-gradient-to-br from-sky-400/40 to-cyan-300/30 blur-md sm:rounded-[2.1rem]" />
          <img src={logoImg} alt={t("appName")} className="h-14 w-auto sm:h-20" />
        </span>
        <div className="leading-none">
          <p className="text-2xl font-black leading-[1.05] tracking-tight text-white drop-shadow-[0_4px_20px_rgba(2,6,23,0.5)] sm:text-4xl lg:text-[2.75rem]">
            {t("appName")}
          </p>
          {!bilingual && (
            <p className="mt-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.42em] text-white/70 sm:mt-3 sm:text-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
              {t("brandTrustLabel")}
            </p>
          )}
        </div>
      </div>

      {/* Center: slogan + supporting copy + feature highlights */}
      <div className="relative z-10 flex flex-1 flex-col justify-center py-10 sm:py-12">
        {eyebrow ? (
          <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.32em] text-white/85 backdrop-blur animate-fade-in-up">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
            {eyebrow}
          </span>
        ) : null}

        {/* Slogan */}
        <h1 className="max-w-[22ch] self-start text-left text-4xl font-black leading-[1.05] tracking-tight drop-shadow-[0_6px_30px_rgba(2,6,23,0.45)] sm:text-5xl lg:text-6xl animate-fade-in-up delay-100">
          {bilingual ? tFr("brandSlogan") : t("brandSlogan")}
        </h1>
        {bilingual ? (
          <h2
            dir="rtl"
            lang="ar"
            className="mt-3 max-w-[22ch] self-start text-left text-3xl font-black leading-[1.2] tracking-tight text-white/85 sm:text-4xl lg:text-5xl animate-fade-in-up delay-100"
          >
            {tAr("brandSlogan")}
          </h2>
        ) : null}

        {/* Tagline */}
        <p className="mt-5 max-w-2xl self-start text-left text-sm leading-7 text-white/80 sm:text-base animate-fade-in-up delay-200">
          {bilingual ? tFr("brandTagline") : t("brandTagline")}
        </p>
        {bilingual ? (
          <p
            dir="rtl"
            lang="ar"
            className="mt-2 max-w-2xl self-start text-left text-sm leading-7 text-white/60 sm:text-base animate-fade-in-up delay-200"
          >
            {tAr("brandTagline")}
          </p>
        ) : null}

        {/* Features */}
        <ul className="mt-8 grid gap-3.5 animate-fade-in-up delay-300">
          {features.map((feature) => (
            <li key={feature.main} className="flex flex-col items-start text-sm font-medium text-white/90 sm:text-base">
              <div className="flex items-center gap-3 w-full">
                <CheckIcon />
                <span className="block text-start leading-snug flex-1">{feature.main}</span>
              </div>
              {"sub" in feature && feature.sub ? (
                <span dir="rtl" lang="ar" className="block text-start text-xs font-medium leading-snug text-white/55 sm:text-sm pl-10 mt-0.5">
                  {feature.sub}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {/* Bottom: optional page-specific footer (summary / stats) */}
      {footer ? <div className="relative z-10 animate-fade-in-up delay-400">{footer}</div> : <div aria-hidden="true" />}
    </aside>
  );
}
