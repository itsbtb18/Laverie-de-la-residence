import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { authHeader, getAuthSession } from "../auth/session";
import { ClientBrandPanel } from "../components/ClientBrandPanel";

type PaymentStatus = "checking" | "paid" | "failed" | "error";

type BookingInfo = {
  booking_reference: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  total_price: string;
  resource_label: string;
  establishment_name: string;
};

export function PaymentSuccessPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get("booking_id");

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("checking");
  const [bookingInfo, setBookingInfo] = useState<BookingInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const attemptRef = useRef(0);
  const maxAttempts = 6;

  const session = getAuthSession();

  useEffect(() => {
    if (!session) {
      navigate("/login", { replace: true });
      return;
    }
    if (!bookingId) {
      navigate("/appointments", { replace: true });
      return;
    }

    let cancelled = false;

    const check = async () => {
      if (cancelled || attemptRef.current >= maxAttempts) {
        if (!cancelled) {
          setPaymentStatus("error");
          setErrorMessage("Le paiement n'a pas pu être confirmé. Veuillez contacter le support.");
        }
        return;
      }

      attemptRef.current += 1;

      try {
        const resp = await fetch(
          `/api/payments/chargily/verify/?booking_id=${bookingId}`,
          { headers: authHeader() }
        );

        if (!resp.ok) {
          throw new Error("Erreur serveur lors de la vérification.");
        }

        const data = (await resp.json()) as {
          status: "paid" | "pending" | "failed";
          error?: string;
        } & Partial<BookingInfo>;

        if (cancelled) return;

        if (data.status === "paid") {
          setBookingInfo({
            booking_reference: data.booking_reference ?? "",
            booking_date: data.booking_date ?? "",
            start_time: data.start_time ?? "",
            end_time: data.end_time ?? "",
            total_price: data.total_price ?? "",
            resource_label: data.resource_label ?? "",
            establishment_name: data.establishment_name ?? "",
          });
          setPaymentStatus("paid");
          return;
        }

        if (data.status === "failed") {
          setPaymentStatus("failed");
          return;
        }

        // Pending — retry after delay (2s, then 3s, then 4s…)
        const delay = 2000 + attemptRef.current * 1000;
        setTimeout(check, delay);
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : "Erreur inattendue.");
          setPaymentStatus("error");
        }
      }
    };

    check();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  return (
    <main dir="ltr" className="relative min-h-screen w-full overflow-hidden text-slate-900">
      <div className="grid min-h-screen w-full lg:grid-cols-[1.15fr_0.85fr]">
        <ClientBrandPanel className="hidden lg:flex" />

        <section className="flex min-h-[100dvh] items-center justify-center bg-[radial-gradient(circle_at_top,_#eaf4ff,_#ffffff_55%)] px-6 py-12 sm:px-10">
          <div className="w-full max-w-sm space-y-6">

            {/* CHECKING */}
            {paymentStatus === "checking" && (
              <div className="text-center space-y-5 animate-fade-in-up">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-sky-50 ring-4 ring-sky-100">
                  <svg className="animate-spin h-9 w-9 text-sky-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900">Vérification en cours…</h2>
                  <p className="mt-2 text-sm font-medium text-slate-500">
                    Nous confirmons votre paiement BaridiMob. Patientez quelques secondes.
                  </p>
                </div>
                <div className="flex justify-center gap-1.5">
                  {Array.from({ length: maxAttempts }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                        i < attemptRef.current ? "bg-sky-500 scale-125" : "bg-slate-200"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* PAID */}
            {paymentStatus === "paid" && bookingInfo && (
              <div className="space-y-6 animate-scale-in">
                {/* Success badge */}
                <div className="text-center space-y-4">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 ring-4 ring-emerald-100 shadow-[0_20px_50px_rgba(16,185,129,0.25)]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-10 w-10 text-emerald-500">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.32em] text-emerald-700 ring-1 ring-emerald-100">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Paiement confirmé
                    </span>
                    <h2 className="mt-4 text-2xl font-black text-slate-900 sm:text-3xl">Réservation validée !</h2>
                    <p className="mt-1.5 text-sm font-medium text-slate-500">
                      Votre rendez-vous est confirmé et payé.
                    </p>
                  </div>
                </div>

                {/* Booking card */}
                <div className="overflow-hidden rounded-[1.6rem] border border-sky-100 bg-white shadow-[0_20px_60px_rgba(14,165,233,0.12)]">
                  <div className="bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-3.5">
                    <p className="text-[10px] font-black uppercase tracking-[0.38em] text-white/80">Référence</p>
                    <p className="mt-0.5 text-xl font-black text-white">{bookingInfo.booking_reference}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-slate-100">
                    <InfoCell label="Date" value={new Date(`${bookingInfo.booking_date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" })} />
                    <InfoCell label="Horaire" value={`${bookingInfo.start_time} – ${bookingInfo.end_time}`} />
                    <InfoCell label="Machine" value={bookingInfo.resource_label} />
                    <InfoCell label="Total payé" value={`${bookingInfo.total_price} DA`} highlight />
                  </div>
                  <div className="px-5 py-3.5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-sky-500">Établissement</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{bookingInfo.establishment_name}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => navigate("/appointments", { replace: true })}
                  className="w-full rounded-2xl bg-slate-900 px-5 py-3.5 text-sm font-bold text-white shadow-[0_16px_40px_rgba(15,23,42,0.22)] transition hover:-translate-y-0.5 hover:bg-slate-800"
                >
                  Revenir à l'accueil →
                </button>
              </div>
            )}

            {/* FAILED / ERROR */}
            {(paymentStatus === "failed" || paymentStatus === "error") && (
              <div className="text-center space-y-5 animate-scale-in">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-rose-50 ring-4 ring-rose-100 shadow-[0_20px_50px_rgba(244,63,94,0.2)]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-10 w-10 text-rose-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.32em] text-rose-700 ring-1 ring-rose-100">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    Paiement non confirmé
                  </span>
                  <h2 className="mt-4 text-2xl font-black text-slate-900">Le paiement n'a pas été effectué</h2>
                  <p className="mt-2 text-sm font-medium text-slate-500">
                    {errorMessage ?? "Votre paiement n'a pas abouti. Veuillez réessayer ou choisir un autre moyen de paiement."}
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="w-full rounded-2xl bg-sky-600 px-5 py-3.5 text-sm font-bold text-white shadow-[0_16px_40px_rgba(14,165,233,0.3)] transition hover:-translate-y-0.5 hover:bg-sky-500"
                  >
                    Réessayer le paiement
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/appointments", { replace: true })}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    Revenir à l'accueil
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoCell({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">{label}</p>
      <p className={`mt-1 text-sm font-black ${highlight ? "text-sky-600" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}
