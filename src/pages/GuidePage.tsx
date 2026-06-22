import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import logoImg from "../assets/logo.png";
import heroBgImg from "../assets/background1.png";

const APP_GRADIENT = "from-sky-500 via-blue-600 to-indigo-700";

export function GuidePage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const goLogin = () => navigate("/login");

  return (
    <main dir={isArabic ? "rtl" : "ltr"} className="relative min-h-screen w-full bg-gradient-to-b from-white via-sky-50/40 to-white">
      {/* ── Navbar ── */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-slate-100 bg-white/85 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-[0_6px_20px_rgba(14,165,233,0.18)] ring-1 ring-sky-100 sm:h-12 sm:w-12">
            <img src={logoImg} alt="Logo" className="h-8 w-auto sm:h-9" />
          </div>
          <span className="truncate text-sm font-black tracking-tight text-slate-800 sm:text-lg">Laverie de la residence</span>
        </div>
        <button
          type="button"
          onClick={goLogin}
          className="group inline-flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-sky-300 hover:text-sky-700"
        >
          <span className="transition group-hover:-translate-x-0.5">{isArabic ? "→" : "←"}</span>
          <span className="hidden sm:inline">{t("guideNavConnect")}</span>
        </button>
      </header>

      {/* ── HERO (plein écran) ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBgImg} alt="" className="h-full w-full object-cover object-top" />
          <div className={`absolute inset-0 bg-gradient-to-br ${APP_GRADIENT} opacity-80`} />
        </div>
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-56 w-56 rounded-full bg-blue-300/10 blur-3xl" />

        <div className="relative z-10 w-full px-5 py-14 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
          <span className="inline-flex animate-fade-in-up items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-white backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            {t("guideBadge")}
          </span>
          <h1 className="mt-5 animate-fade-in-up text-4xl font-black leading-[1.05] tracking-tight text-white drop-shadow-[0_2px_14px_rgba(2,6,23,0.35)] sm:text-5xl lg:text-6xl" style={{ animationDelay: "60ms" }}>
            {t("guideHeroTitle")}
          </h1>
          <p className="mt-4 max-w-2xl animate-fade-in-up text-base leading-relaxed text-white/90 sm:text-lg" style={{ animationDelay: "120ms" }}>
            {t("guideHeroSubtitle")}
          </p>
          <button
            type="button"
            onClick={goLogin}
            className="mt-7 inline-flex animate-fade-in-up items-center justify-center gap-2 rounded-2xl bg-white px-7 py-3.5 text-sm font-black text-blue-700 shadow-[0_14px_34px_rgba(2,6,23,0.22)] transition hover:-translate-y-0.5"
            style={{ animationDelay: "180ms" }}
          >
            {t("guideHeroCta")}
            <span>{isArabic ? "←" : "→"}</span>
          </button>
        </div>
      </section>

      {/* ── CONTENU (plein écran) ── */}
      <div className="w-full space-y-6 px-4 py-10 sm:px-8 sm:py-14 lg:px-12">
        {/* 1 — blanc */}
        <Section
          index={0}
          variant="light"
          kicker={t("guideS1Kicker")}
          title={t("guideS1Title")}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1m-4 0h4" /></svg>
          }
        >
          <p className="text-base font-bold text-slate-800">{t("guideS1Lead")}</p>
          <p className="mt-3 leading-7 text-slate-600">{t("guideS1Body")}</p>
        </Section>

        {/* 2 — bleu */}
        <Section
          index={1}
          variant="blue"
          kicker={t("guideS2Kicker")}
          title={t("guideS2Title")}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          }
        >
          <div className="mb-4 flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-3 text-sm font-black text-white ring-1 ring-white/20">
            <span>🔐</span> {t("guideS2Badge")}
          </div>
          <p className="leading-7 text-white/90">
            {(() => {
              const body = t("guideS2Body");
              const strong = t("guideS2BodyStrong");
              if (body.includes(strong)) {
                const [before, after] = body.split(strong);
                return (<>{before}<span className="font-black text-white">{strong}</span>{after}</>);
              }
              return body;
            })()}
          </p>
          <ol className="mt-5 space-y-3">
            <StepItem dark n={1}>{t("guideS2Step1")}</StepItem>
            <StepItem dark n={2}>{t("guideS2Step2")}</StepItem>
            <StepItem dark n={3}>{t("guideS2Step3")}</StepItem>
          </ol>
        </Section>

        {/* 3 — blanc */}
        <Section
          index={2}
          variant="light"
          kicker={t("guideS3Kicker")}
          title={t("guideS3Title")}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
          }
        >
          <div className="mb-4 flex items-center gap-2 rounded-2xl bg-cyan-50 px-4 py-3 text-sm font-black text-cyan-700">
            <span>📱</span> {t("guideS3Badge")}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <MiniCard n={1} title={t("guideS3C1Title")}>{t("guideS3C1Body")}</MiniCard>
            <MiniCard n={2} title={t("guideS3C2Title")}>{t("guideS3C2Body")}</MiniCard>
            <MiniCard n={3} title={t("guideS3C3Title")}>{t("guideS3C3Body")}</MiniCard>
          </div>
        </Section>

        {/* 4 — bleu */}
        <Section
          index={3}
          variant="blue"
          kicker={t("guideS4Kicker")}
          title={t("guideS4Title")}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5l2.2 4.46 4.92.72-3.56 3.47.84 4.9-4.4-2.31-4.4 2.31.84-4.9L4.36 8.68l4.92-.72 2.2-4.46z" /></svg>
          }
        >
          <div className="space-y-4">
            <RuleCard dark emoji="⚖️" title={t("guideS4R1Title")}>{t("guideS4R1Body")}</RuleCard>
            <RuleCard dark emoji="🧼" title={t("guideS4R2Title")}>{t("guideS4R2Body")}</RuleCard>
          </div>
        </Section>

        {/* 5 — blanc */}
        <Section
          index={4}
          variant="light"
          kicker={t("guideS5Kicker")}
          title={t("guideS5Title")}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          }
        >
          <ul className="space-y-3">
            <CheckItem>{t("guideS5Check1")}</CheckItem>
            <CheckItem>{t("guideS5Check2")}</CheckItem>
          </ul>
        </Section>

        {/* CTA final */}
        <div className="animate-fade-in-up overflow-hidden rounded-[2rem] border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-8 text-center shadow-sm sm:p-10">
          <h3 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{t("guideCtaTitle")}</h3>
          <p className="mt-2 text-slate-500">{t("guideCtaSubtitle")}</p>
          <button
            type="button"
            onClick={goLogin}
            className={`mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r ${APP_GRADIENT} px-8 py-3.5 text-sm font-bold text-white shadow-[0_14px_34px_rgba(37,99,235,0.35)] transition hover:-translate-y-0.5`}
          >
            {t("guideCtaButton")}
            <span>{isArabic ? "←" : "→"}</span>
          </button>
        </div>

        <p className="text-center text-xs font-semibold text-slate-400">{t("guideFooter")}</p>
      </div>
    </main>
  );
}

/* ── Sub-components ── */

function Section({
  index,
  variant,
  kicker,
  title,
  icon,
  children,
}: {
  index: number;
  variant: "light" | "blue";
  kicker: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const isBlue = variant === "blue";
  return (
    <section
      className={`animate-fade-in-up overflow-hidden rounded-[2rem] p-6 shadow-[0_14px_45px_rgba(15,23,42,0.07)] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(14,165,233,0.16)] sm:p-8 ${
        isBlue
          ? "border border-transparent bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700 text-white"
          : "border border-slate-100 bg-white text-slate-900"
      }`}
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${isBlue ? "bg-white/20 text-white" : "bg-sky-100 text-sky-600"}`}>{icon}</div>
        <div className="min-w-0">
          <p className={`text-[11px] font-black uppercase tracking-[0.22em] ${isBlue ? "text-white/80" : "text-sky-500"}`}>{kicker}</p>
          <h2 className={`mt-0.5 text-lg font-black leading-tight tracking-tight sm:text-2xl ${isBlue ? "text-white" : "text-slate-900"}`}>{title}</h2>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function StepItem({ n, dark, children }: { n: number; dark?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${dark ? "bg-white/25 text-white" : "bg-indigo-500 text-white"}`}>{n}</span>
      <span className={`text-sm leading-6 ${dark ? "text-white/90" : "text-slate-600"}`}>{children}</span>
    </li>
  );
}

function MiniCard({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-cyan-100 bg-cyan-50/40 p-5 transition hover:-translate-y-1 hover:shadow-[0_14px_36px_rgba(14,165,233,0.14)]">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-sm font-black text-white shadow-sm">{n}</span>
      <p className="mt-3 text-sm font-black text-slate-900">{title}</p>
      <p className="mt-1.5 text-xs leading-5 text-slate-500">{children}</p>
    </div>
  );
}

function RuleCard({ emoji, title, dark, children }: { emoji: string; title: string; dark?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl p-5 ${dark ? "border border-white/20 bg-white/12" : "border border-amber-100 bg-amber-50/50"}`}>
      <p className={`flex items-center gap-2 text-sm font-black ${dark ? "text-white" : "text-amber-800"}`}>
        <span className="text-lg">{emoji}</span> {title}
      </p>
      <p className={`mt-2 text-sm leading-6 ${dark ? "text-white/90" : "text-slate-600"}`}>{children}</p>
    </div>
  );
}

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-emerald-50/60 px-4 py-3 transition hover:bg-emerald-50">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-emerald-500 text-emerald-600">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
      </span>
      <span className="text-sm font-semibold text-slate-700">{children}</span>
    </li>
  );
}
