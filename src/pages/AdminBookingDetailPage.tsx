import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { authHeader } from "../auth/session";
import type { AppLanguage } from "../i18n";

type Booking = {
  id: number;
  booking_reference: string;
  user: number | null;
  user_first_name?: string;
  user_last_name?: string;
  user_phone: string;
  resource_label: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: "EN_ATTENTE" | "PAYE" | "ANNULE" | "MAINTENANCE";
  payment_method?: "CASH" | "BARIDIMOB" | null;
  total_price: string;
  establishment_name: string;
  validated_by_phone?: string;
  validated_by_first_name?: string;
  validated_by_last_name?: string;
  validated_at?: string;
};

type AdminBookingDetailPageProps = {
  language: AppLanguage;
};

function getClientName(booking: Booking) {
  return [booking.user_first_name, booking.user_last_name].filter(Boolean).join(" ") || booking.user_phone || "-";
}

function getValidatedByLabel(booking: Booking) {
  const name = [booking.validated_by_first_name, booking.validated_by_last_name].filter(Boolean).join(" ");
  const phone = booking.validated_by_phone;
  if (name && phone) return `${name} (${phone})`;
  if (name) return name;
  if (phone) return phone;
  return "-";
}

function dateToLongLabel(dateValue: string, language: AppLanguage) {
  const current = new Date(`${dateValue}T12:00:00`);
  return new Intl.DateTimeFormat(language === "ar" ? "ar-DZ" : "fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(current);
}

function getMinutesFromTime(timeValue: string) {
  const [hours, minutes] = timeValue.split(":").map(Number);
  return hours * 60 + minutes;
}

function getWashMode(booking: Booking) {
  const start = booking.start_time.slice(0, 5);
  const end = booking.end_time.slice(0, 5);
  const duration = Math.max(getMinutesFromTime(end) - getMinutesFromTime(start), 10);
  if (duration <= 15) return "Rapide (15 min)";
  if (duration <= 30) return "Express (30 min)";
  if (duration <= 45) return "Premium (45 min)";
  return "VIP (60 min)";
}

function getDurationLabel(booking: Booking) {
  const start = booking.start_time.slice(0, 5);
  const end = booking.end_time.slice(0, 5);
  const duration = Math.max(getMinutesFromTime(end) - getMinutesFromTime(start), 0);
  return `${duration} minutes`;
}

function formatDateTime(isoString: string | undefined, language: AppLanguage) {
  if (!isoString) return "-";
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat(language === "ar" ? "ar-DZ" : "fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return isoString;
  }
}

function DetailCard({ label, value, accent }: { label: string; value: string; accent?: "rose" | "default" }) {
  return (
    <div className={`rounded-[1.5rem] border p-4 shadow-[0_10px_24px_rgba(15,23,42,0.02)] hover:shadow-[0_15px_30px_rgba(15,23,42,0.04)] transition-all duration-300 ${
      accent === "rose" ? "border-rose-100/60 bg-rose-50/40" : "border-sky-100/50 bg-white"
    }`}>
      <p className={`text-[10px] font-black uppercase tracking-[0.25em] ${accent === "rose" ? "text-rose-500" : "text-sky-500"}`}>{label}</p>
      <p className="mt-2.5 break-words text-sm sm:text-base font-bold leading-6 text-slate-900">{value}</p>
    </div>
  );
}

export function AdminBookingDetailPage({ language }: AdminBookingDetailPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const bookingId = params.bookingId ? Number(params.bookingId) : null;
  const navigationState = location.state as { booking?: Booking; returnTo?: string } | null;
  const initialBooking = useMemo(() => navigationState?.booking ?? null, [location.state]);
  const [booking, setBooking] = useState<Booking | null>(initialBooking);
  const [loading, setLoading] = useState(!initialBooking);
  const [error, setError] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [paidSuccess, setPaidSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    const loadBooking = async () => {
      if (!bookingId || booking) return;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/bookings/${bookingId}/`, { headers: authHeader() });
        if (!response.ok) throw new Error("Réservation introuvable.");
        const payload = (await response.json()) as Booking;
        if (active) setBooking(payload);
      } catch (errorValue) {
        if (active) setError(errorValue instanceof Error ? errorValue.message : "Erreur de chargement.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadBooking();
    return () => { active = false; };
  }, [booking, bookingId]);

  const handleMarkPaid = async () => {
    if (!bookingId) return;
    setMarkingPaid(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ status: "PAYE", payment_method: "CASH" }),
      });
      if (res.ok) {
        const updated = (await res.json()) as Booking;
        setBooking(updated);
        setPaidSuccess(true);
        setTimeout(() => setPaidSuccess(false), 3000);
      }
    } finally {
      setMarkingPaid(false);
    }
  };

  const backToDashboard = () => navigate(navigationState?.returnTo ?? "/admin/dashboard/calendar", { replace: true });
  const isMaintenance = booking?.status === "MAINTENANCE";

  return (
    <main className="min-h-screen w-screen overflow-y-auto bg-gradient-to-br from-slate-50 via-sky-50/20 to-white text-slate-900 pb-12 animate-fade-in-up">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className={`absolute -left-20 top-20 h-72 w-72 rounded-full blur-3xl animate-float-soft ${isMaintenance ? "bg-rose-100/30" : "bg-sky-100/40"}`} />
        <div className={`absolute right-0 top-1/3 h-96 w-96 rounded-full blur-3xl animate-float-soft delay-300 ${isMaintenance ? "bg-orange-50/30" : "bg-indigo-50/30"}`} />
      </div>

      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
        {/* Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-[2rem] border border-sky-100/60 bg-white/85 p-5 sm:p-6 shadow-[0_18px_50px_rgba(15,23,42,0.04)] backdrop-blur-xl">
          <div className="flex items-center gap-4 min-w-0">
            <div className={`h-12 w-12 sm:h-14 sm:w-14 shrink-0 rounded-2xl flex items-center justify-center text-white shadow-lg ${
              isMaintenance
                ? "bg-gradient-to-br from-rose-400 via-rose-500 to-orange-500 shadow-rose-500/20"
                : "bg-gradient-to-br from-sky-400 via-sky-500 to-indigo-500 shadow-sky-500/20"
            }`}>
              {isMaintenance ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
            </div>
            <div className="min-w-0">
              <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.15em] border mb-1 ${
                isMaintenance ? "bg-rose-50 text-rose-600 border-rose-100/50" : "bg-sky-50 text-sky-600 border-sky-100/50"
              }`}>
                {isMaintenance ? "Maintenance" : "Détail Réservation"}
              </div>
              <h1 className="truncate text-lg sm:text-2xl font-black tracking-tight text-slate-900 leading-tight">
                {loading ? "Chargement..." : isMaintenance ? `Maintenance — ${booking?.resource_label}` : booking ? getClientName(booking) : "..."}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
            {booking?.status === "EN_ATTENTE" && (
              <button
                type="button"
                onClick={handleMarkPaid}
                disabled={markingPaid}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-bold text-white shadow-md transition hover:bg-emerald-500 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {markingPaid ? (
                  <>
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    Validation...
                  </>
                ) : paidSuccess ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Payé !
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    Marquer comme payé
                  </>
                )}
              </button>
            )}
            <button type="button" onClick={backToDashboard}
              className="group inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-xs font-bold text-white shadow-md transition hover:bg-slate-800 hover:-translate-x-0.5 active:scale-95 cursor-pointer">
              <svg className="w-4 h-4 transition group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Retour
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 rounded-[2rem] border border-sky-100/50 bg-white/80 shadow-lg">
            <div className="h-10 w-10 rounded-full border-[3px] border-slate-200 border-t-sky-500 animate-spin" />
            <p className="mt-4 text-sm font-semibold text-slate-400">Chargement...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-[2rem] border border-rose-100 bg-rose-50/50 shadow-lg text-rose-800 text-center px-6">
            <p className="text-lg font-black">{error}</p>
            <button type="button" onClick={backToDashboard} className="mt-6 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition">
              Retour
            </button>
          </div>
        ) : booking ? (
          <div className="w-full space-y-6">
            <section className={`rounded-[2rem] border backdrop-blur-xl p-5 sm:p-8 shadow-[0_20px_50px_rgba(15,23,42,0.03)] relative overflow-hidden ${
              isMaintenance ? "border-rose-100/40 bg-rose-50/30" : "border-sky-100/40 bg-white/70"
            }`}>
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className={`absolute right-0 top-0 h-48 w-48 rounded-full blur-2xl ${isMaintenance ? "bg-rose-100/20" : "bg-sky-100/10"}`} />
              </div>

              <div className="relative z-10">
                {/* Reference + status row */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${
                      isMaintenance ? "bg-rose-50 border-rose-100 text-rose-500" : "bg-sky-50 border-sky-100 text-sky-500"
                    }`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2H9a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Référence</p>
                      <h2 className="text-lg sm:text-2xl font-black text-slate-900 truncate">{booking.booking_reference}</h2>
                    </div>
                  </div>
                  {isMaintenance ? (
                    <span className="rounded-full px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] border bg-rose-50 text-rose-700 border-rose-200">
                      Maintenance
                    </span>
                  ) : (
                    <span className={`rounded-full px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] border ${
                      booking.status === "PAYE" ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                      : booking.status === "ANNULE" ? "bg-rose-50 text-rose-700 border-rose-100"
                      : "bg-amber-50 text-amber-700 border-amber-100"
                    }`}>
                      {booking.status === "PAYE" ? "Payé" : booking.status === "ANNULE" ? "Annulé" : "En attente"}
                    </span>
                  )}
                </div>

                {/* Fields grid */}
                <div className="mt-6 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {isMaintenance ? (
                    <>
                      <DetailCard label="Machine / Ressource" value={booking.resource_label} accent="rose" />
                      <DetailCard label="Date" value={dateToLongLabel(booking.booking_date, language)} accent="rose" />
                      <DetailCard label="Horaire" value={`${booking.start_time.slice(0, 5)} – ${booking.end_time.slice(0, 5)}`} accent="rose" />
                      <DetailCard label="Durée" value={getDurationLabel(booking)} accent="rose" />
                      <DetailCard label="Établissement" value={booking.establishment_name} accent="rose" />
                      <DetailCard label="Planifié par" value={getValidatedByLabel(booking)} accent="rose" />
                      <DetailCard label="Créé le" value={formatDateTime(booking.validated_at, language)} accent="rose" />
                    </>
                  ) : (
                    <>
                      {/* Clickable client card → goes to customer detail */}
                      <div
                        className={`rounded-[1.5rem] border border-sky-100/50 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.02)] transition-all duration-300 ${booking.user ? "cursor-pointer hover:border-sky-300 hover:shadow-[0_15px_30px_rgba(14,165,233,0.10)] group" : ""}`}
                        onClick={() => booking.user && navigate(`/admin/dashboard/customers/${booking.user}`)}
                        role={booking.user ? "button" : undefined}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sky-500">Client</p>
                          {booking.user && (
                            <svg className="w-3.5 h-3.5 text-sky-300 transition group-hover:text-sky-500 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                          )}
                        </div>
                        <p className={`mt-2.5 break-words text-sm sm:text-base font-bold leading-6 ${booking.user ? "text-sky-700 underline-offset-2 group-hover:underline" : "text-slate-900"}`}>
                          {getClientName(booking)}
                        </p>
                      </div>
                      <DetailCard label="Téléphone" value={booking.user_phone || "-"} />
                      <DetailCard label="Machine / Ressource" value={booking.resource_label} />
                      <DetailCard label="Mode de lavage" value={getWashMode(booking)} />
                      <DetailCard label="Date" value={dateToLongLabel(booking.booking_date, language)} />
                      <DetailCard label="Horaire" value={`${booking.start_time.slice(0, 5)} – ${booking.end_time.slice(0, 5)}`} />
                      <DetailCard label="Montant" value={`${booking.total_price} DA`} />
                      <DetailCard label="Établissement" value={booking.establishment_name} />
                      <DetailCard
                        label="Moyen de paiement"
                        value={booking.status === "PAYE" ? (booking.payment_method === "BARIDIMOB" ? "BaridiMob" : "Espèces") : "En attente"}
                      />
                      <DetailCard
                        label="Date / Heure de paiement"
                        value={booking.status === "PAYE" ? formatDateTime(booking.validated_at, language) : "-"}
                      />
                      <DetailCard label="Validé par" value={getValidatedByLabel(booking)} />
                    </>
                  )}
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
