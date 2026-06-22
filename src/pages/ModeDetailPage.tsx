import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import { authHeader, getAuthSession } from "../auth/session";
import { type AppLanguage } from "../i18n";
import logoImg from "../assets/logo.png";
import detailsBg from "../assets/background.png";

type ModeDetailPageProps = {
  language: AppLanguage;
};

type ApiMode = {
  id: number;
  nom: string;
  nom_ar?: string;
  duree: number;
  prix_base: string | number;
  prix_effectif: string | number;
  capacite_max?: string | number;
  types_vetements?: string[];
  types_vetements_ar?: string[];
  message_guide?: string;
  message_guide_ar?: string;
  textiles_interdits?: string[];
  textiles_interdits_ar?: string[];
  consigne_securite?: string;
  consigne_securite_ar?: string;
  recommande?: boolean;
};

export function ModeDetailPage({ language }: ModeDetailPageProps) {
  const { modeId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isArabic = language === "ar";
  const session = getAuthSession();
  const establishmentId = session?.establishmentId ?? 1;

  const [mode, setMode] = useState<ApiMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!session) {
      navigate("/login", { replace: true });
    }
  }, [session, navigate]);

  useEffect(() => {
    let mounted = true;

    const loadMode = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const response = await fetch(`/api/establishments/${establishmentId}/modes/`, {
          headers: authHeader(),
        });
        if (!response.ok) {
          if (mounted) setNotFound(true);
          return;
        }
        const data = (await response.json()) as ApiMode[];
        const found = Array.isArray(data)
          ? data.find((m) => String(m.id) === String(modeId))
          : null;
        if (mounted) {
          if (found) setMode(found);
          else setNotFound(true);
        }
      } catch {
        if (mounted) setNotFound(true);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadMode();
    return () => {
      mounted = false;
    };
  }, [establishmentId, modeId]);

  const goBack = () => navigate("/appointments/mode");

  const chooseMode = () => {
    if (typeof window !== "undefined" && modeId) {
      window.sessionStorage.setItem("chrono-selected-mode", String(modeId));
    }
    navigate("/appointments/mode");
  };

  // Sélectionne la valeur arabe si disponible et que la langue est l'arabe,
  // sinon retombe sur la version française.
  const pick = (fr?: string, ar?: string) => (isArabic && ar?.trim() ? ar : (fr ?? ""));
  const pickList = (fr?: string[], ar?: string[]) =>
    isArabic && Array.isArray(ar) && ar.length > 0 ? ar : (Array.isArray(fr) ? fr : []);

  const price = mode ? Number(mode.prix_effectif ?? mode.prix_base ?? 0) : 0;
  const duration = mode ? Number(mode.duree) || 0 : 0;
  const modeName = pick(mode?.nom, mode?.nom_ar);
  const modeGuide = pick(mode?.message_guide, mode?.message_guide_ar);
  const modeSafety = pick(mode?.consigne_securite, mode?.consigne_securite_ar);
  const clothTypes = pickList(mode?.types_vetements, mode?.types_vetements_ar);
  const forbiddenTypes = pickList(mode?.textiles_interdits, mode?.textiles_interdits_ar);
  const hasCapacity = mode?.capacite_max != null && Number(mode.capacite_max) > 0;

  const BackButton = (
    <button
      type="button"
      onClick={goBack}
      className="group inline-flex items-center gap-2 rounded-2xl border border-white/30 bg-white/15 px-5 py-3 text-sm font-bold text-white backdrop-blur-md transition hover:border-white/50 hover:bg-white/25"
    >
      <span className="text-base transition group-hover:-translate-x-0.5">{isArabic ? "→" : "←"}</span>
      {t("modeDetailBack")}
    </button>
  );

  return (
    <main
      dir={isArabic ? "rtl" : "ltr"}
      className="relative flex min-h-screen w-full flex-col"
    >
      {/* ── Image de fond pleine page + teinte bleue (continue) ── */}
      <div
        className="fixed inset-0 -z-20 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${detailsBg})` }}
      />
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-cyan-900/55 via-sky-900/45 to-slate-900/55" />

      {/* ── Top bar (plein écran) ── */}
      <header className="relative z-30 flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
        {/* Logo à gauche */}
        <div className="flex min-w-0 items-center gap-4 sm:gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.4rem] bg-white shadow-[0_16px_40px_rgba(2,6,23,0.35)] ring-1 ring-white/60 sm:h-20 sm:w-20 sm:rounded-[1.6rem]">
            <img src={logoImg} alt="Logo" className="h-12 w-auto sm:h-14" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-xl font-black tracking-tight text-white drop-shadow-[0_2px_12px_rgba(2,6,23,0.5)] sm:text-3xl">{t("appName")}</p>
            <p className="hidden text-xs font-bold uppercase tracking-wide text-cyan-200 sm:block sm:text-sm">{t("brandTrustLabel")}</p>
          </div>
        </div>
        {/* Retour à droite */}
        {BackButton}
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-32">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" />
        </div>
      ) : notFound || !mode ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
          </div>
          <p className="text-base font-black text-slate-700">{t("modeDetailNotFound")}</p>
          <div className="mt-6">{BackButton}</div>
        </div>
      ) : (
        <div className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 pb-14 pt-4 sm:px-6 sm:pt-8">
          {/* ── HERO : carte de présentation vitrée à deux colonnes ── */}
          <section className="overflow-hidden rounded-[2.25rem] border border-white/20 bg-white/10 shadow-[0_30px_80px_rgba(2,6,23,0.45)] backdrop-blur-2xl animate-fade-in-up">
            <div className="grid gap-0 lg:grid-cols-[1.35fr_1fr]">
              {/* Colonne gauche : identité du mode */}
              <div className="flex flex-col justify-center p-7 sm:p-10">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-200 sm:text-sm">{t("modeDetailHeroKicker")}</p>

                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                  {mode.recommande && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3.5 py-1.5 text-[0.65rem] font-black uppercase tracking-[0.16em] text-white shadow-sm">
                      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M11.48 3.5l2.2 4.46 4.92.72-3.56 3.47.84 4.9-4.4-2.31-4.4 2.31.84-4.9L4.36 8.68l4.92-.72 2.2-4.46z" /></svg>
                      {t("modeRecommendedBadge")}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3.5 py-1.5 text-[0.65rem] font-black uppercase tracking-[0.16em] text-white ring-1 ring-white/30 backdrop-blur">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" /></svg>
                    {duration} min
                  </span>
                </div>

                <h1 className="mt-4 text-4xl font-black leading-[1.02] tracking-tight text-white drop-shadow-[0_4px_24px_rgba(2,6,23,0.5)] sm:text-5xl lg:text-6xl">{modeName}</h1>

                {modeGuide ? (
                  <p className="mt-4 max-w-lg text-sm font-semibold leading-7 text-white/85 sm:text-base">{modeGuide}</p>
                ) : null}

                <button
                  type="button"
                  onClick={chooseMode}
                  className="group mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-7 py-4 text-sm font-black text-sky-700 shadow-[0_18px_44px_rgba(2,6,23,0.3)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_56px_rgba(2,6,23,0.38)] sm:w-auto"
                >
                  {t("modeDetailChoose")}
                  <span className="transition group-hover:translate-x-1">→</span>
                </button>
              </div>

              {/* Colonne droite : statistiques clés (prix en vedette) */}
              <div className="flex flex-col gap-3 border-t border-white/15 bg-white/[0.06] p-7 sm:p-8 lg:border-l lg:border-t-0">
                <div className="rounded-[1.5rem] bg-gradient-to-br from-sky-500 to-blue-600 p-6 text-white shadow-[0_18px_50px_rgba(14,165,233,0.4)]">
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-white/80">{t("modeDetailTotal")}</p>
                  <p className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">
                    {Number(price).toLocaleString("fr-FR")}<span className="ml-2 text-lg font-bold text-white/80">{t("currency")}</span>
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label={t("modeDetailDuration")} value={`${duration}`} unit="min" icon={
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" /></svg>
                  } />
                  <MiniStat label={t("modeDetailCapacity")} value={hasCapacity ? `${Number(mode.capacite_max)}` : "—"} unit={hasCapacity ? "kg" : ""} icon={
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                  } />
                </div>
              </div>
            </div>
          </section>

          {/* ── Détails : ce qu'on peut laver / à éviter ── */}
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {/* Ce que vous POUVEZ laver */}
            {clothTypes.length > 0 ? (
              <SectionCard
                tone="emerald"
                title={t("modeDetailAllowedTitle")}
                icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              >
                <ul className="grid gap-2.5">
                  {clothTypes.map((type) => (
                    <li key={type} className="flex items-center gap-3 rounded-xl bg-emerald-50/70 px-4 py-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      </span>
                      <span className="text-base font-bold text-slate-800">{type}</span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ) : null}

            {/* À éviter / vérifier */}
            {(forbiddenTypes.length > 0 || modeSafety) ? (
              <SectionCard
                tone="rose"
                title={t("modeDetailForbiddenTitle")}
                icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
              >
                {forbiddenTypes.length > 0 ? (
                  <ul className="grid gap-2.5">
                    {forbiddenTypes.map((type) => (
                      <li key={type} className="flex items-center gap-3 rounded-xl bg-rose-50/70 px-4 py-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </span>
                        <span className="text-base font-bold text-slate-800">{type}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {modeSafety ? (
                  <div className={`flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 ${forbiddenTypes.length > 0 ? "mt-4" : ""}`}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400 text-white">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9l-8 13.8A2 2 0 004 21h16a2 2 0 001.7-3.3l-8-13.8a2 2 0 00-3.4 0z" /></svg>
                    </span>
                    <div>
                      <p className="text-[0.7rem] font-black uppercase tracking-[0.15em] text-amber-600">{t("modeDetailSafetyLabel")}</p>
                      <p className="mt-1 text-sm leading-6 text-amber-900">{modeSafety}</p>
                    </div>
                  </div>
                ) : null}
              </SectionCard>
            ) : null}
          </div>
        </div>
      )}
    </main>
  );
}

function MiniStat({ label, value, unit, icon }: { label: string; value: string; unit: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-[1.25rem] border border-white/20 bg-white/10 p-4 text-white backdrop-blur-md">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-cyan-200 ring-1 ring-white/20">
        {icon}
      </div>
      <p className="mt-3 text-[0.6rem] font-bold uppercase tracking-[0.18em] text-white/70">{label}</p>
      <p className="mt-0.5 text-2xl font-black tracking-tight text-white">
        {value}{unit ? <span className="ml-1 text-sm font-bold text-white/70">{unit}</span> : null}
      </p>
    </div>
  );
}

function SectionCard({ tone, title, icon, children, className }: { tone: "indigo" | "emerald" | "rose"; title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  const tones = {
    indigo: { border: "border-indigo-100", headBg: "bg-indigo-50/60", headBorder: "border-indigo-50", chip: "bg-indigo-100 text-indigo-600", title: "text-indigo-600" },
    emerald: { border: "border-emerald-100", headBg: "bg-emerald-50/60", headBorder: "border-emerald-50", chip: "bg-emerald-100 text-emerald-600", title: "text-emerald-600" },
    rose: { border: "border-rose-100", headBg: "bg-rose-50/60", headBorder: "border-rose-50", chip: "bg-rose-100 text-rose-600", title: "text-rose-600" },
  } as const;
  const c = tones[tone];
  return (
    <div className={`rounded-[1.5rem] border ${c.border} bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)] sm:p-6 ${className ?? ""}`}>
      <div className="mb-4 flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.chip}`}>{icon}</div>
        <p className={`text-sm font-black uppercase tracking-[0.12em] ${c.title}`}>{title}</p>
      </div>
      {children}
    </div>
  );
}
