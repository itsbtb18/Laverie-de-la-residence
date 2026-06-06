import { useNavigate } from "react-router-dom";

import { ClientBrandPanel } from "../components/ClientBrandPanel";

export function PaymentFailurePage() {
  const navigate = useNavigate();

  return (
    <main dir="ltr" className="relative min-h-screen w-full overflow-hidden text-slate-900">
      <div className="grid min-h-screen w-full lg:grid-cols-[1.15fr_0.85fr]">
        <ClientBrandPanel className="hidden lg:flex" />

        <section className="flex min-h-[100dvh] items-center justify-center bg-[radial-gradient(circle_at_top,_#fff1f2,_#ffffff_55%)] px-6 py-12 sm:px-10">
          <div className="w-full max-w-sm space-y-6 text-center animate-scale-in">
            {/* Icon */}
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-rose-50 ring-4 ring-rose-100 shadow-[0_24px_60px_rgba(244,63,94,0.22)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-12 w-12 text-rose-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>

            {/* Badge */}
            <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.32em] text-rose-700 ring-1 ring-rose-100">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              Paiement échoué
            </span>

            {/* Title & message */}
            <div className="space-y-2">
              <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">
                Le paiement n'a pas été effectué
              </h1>
              <p className="text-sm leading-7 font-medium text-slate-500">
                Votre paiement BaridiMob n'a pas abouti. Votre créneau est toujours réservé — vous pouvez réessayer ou opter pour un paiement en espèces sur place.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="w-full rounded-2xl bg-sky-600 px-5 py-3.5 text-sm font-bold text-white shadow-[0_16px_40px_rgba(14,165,233,0.3)] transition hover:-translate-y-0.5 hover:bg-sky-500 focus:outline-none focus:ring-4 focus:ring-sky-200"
              >
                Réessayer le paiement
              </button>
              <button
                type="button"
                onClick={() => navigate("/appointments", { replace: true })}
                className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-bold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100"
              >
                Revenir à l'accueil
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
