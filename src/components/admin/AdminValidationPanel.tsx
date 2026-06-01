import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  ParsedWhatsAppQr,
  WhatsAppQrScanner,
} from "../WhatsAppQrScanner";

export type ValidationBooking = {
  id: number;
  booking_reference: string;
  user: number;
  user_first_name?: string;
  user_last_name?: string;
  user_phone: string;
  resource: number;
  resource_label: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: "EN_ATTENTE" | "PAYE" | "ANNULE";
  total_price: string;
  validated_by_phone?: string;
};

export type ValidationCustomer = {
  id: number;
  phone: string;
  first_name: string;
  last_name: string;
};

type AdminValidationPanelProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  isBookingReferenceMode: boolean;
  foundBookings: ValidationBooking[];
  foundClients: ValidationCustomer[];
  loading: boolean;
  resolvingQr: boolean;
  selectedBooking: ValidationBooking | null;
  onSelectBooking: (booking: ValidationBooking | null) => void;
  onSelectClient: (client: ValidationCustomer) => void;
  onScan: (payload: ParsedWhatsAppQr) => void;
  onScanStatusChange?: (status: string) => void;
  validationState: "idle" | "submitting";
  onValidateCash: (bookingId: number) => void;
  onCancelBooking: (bookingId: number) => void;
  onPrintReceipt: (bookingId: number) => void;
  printingBookingId: number | null;
  getBookingClientName: (booking: ValidationBooking) => string;
};

function StatusBadge({ status }: { status: ValidationBooking["status"] }) {
  const styles =
    status === "PAYE"
      ? "bg-emerald-500/20 text-emerald-300 ring-emerald-400/30"
      : status === "ANNULE"
        ? "bg-rose-500/20 text-rose-300 ring-rose-400/30"
        : "bg-amber-500/20 text-amber-200 ring-amber-400/30";

  const label =
    status === "PAYE" ? "Payé" : status === "ANNULE" ? "Annulé" : "En attente";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ring-1 ${styles}`}
    >
      {label}
    </span>
  );
}

export function AdminValidationPanel({
  searchQuery,
  onSearchChange,
  isBookingReferenceMode,
  foundBookings,
  foundClients,
  loading,
  resolvingQr,
  selectedBooking,
  onSelectBooking,
  onSelectClient,
  onScan,
  onScanStatusChange,
  validationState,
  onValidateCash,
  onCancelBooking,
  onPrintReceipt,
  printingBookingId,
  getBookingClientName,
}: AdminValidationPanelProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"search" | "scan">("search");

  const hasQuery = searchQuery.trim().length > 0;
  const showEmpty =
    hasQuery && !loading && foundBookings.length === 0 && foundClients.length === 0;

  const searchHint = useMemo(() => {
    if (isBookingReferenceMode) {
      return "Référence rendez-vous (ex. CRN-2026-…)";
    }
    return "Nom, prénom ou numéro de téléphone";
  }, [isBookingReferenceMode]);

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-[#070b14] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float-soft absolute -left-24 top-0 h-72 w-72 rounded-full bg-cyan-500/20 blur-[100px]" />
        <div className="animate-float-soft absolute -right-16 top-1/3 h-80 w-80 rounded-full bg-indigo-600/25 blur-[110px] delay-300" />
        <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-sky-500/10 blur-[90px]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <header className="relative z-10 shrink-0 border-b border-white/5 bg-[#070b14]/80 backdrop-blur-xl">
        <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 animate-fade-in-up">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-400/90">
                Rendez-vous
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
                Validation
              </h1>
              <p className="mt-1 max-w-md text-xs font-medium leading-relaxed text-slate-400 sm:text-sm">
                Recherchez une réservation par référence, un client par nom ou téléphone, ou
                scannez un QR ticket.
              </p>
            </div>
            {resolvingQr ? (
              <div className="flex shrink-0 items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-bold text-cyan-300 animate-pulse-soft">
                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                Identification…
              </div>
            ) : null}
          </div>

          <div className="flex rounded-2xl border border-white/10 bg-white/5 p-1 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setMode("search")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition-all duration-300 sm:text-sm ${
                mode === "search"
                  ? "bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 text-white shadow-[0_8px_32px_rgba(14,165,233,0.35)]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Recherche
            </button>
            <button
              type="button"
              onClick={() => setMode("scan")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition-all duration-300 sm:text-sm ${
                mode === "scan"
                  ? "bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 text-white shadow-[0_8px_32px_rgba(14,165,233,0.35)]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              Scanner QR
            </button>
          </div>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        {mode === "search" ? (
          <div className="flex min-h-0 flex-1 flex-col animate-fade-in">
            <div className="shrink-0 px-4 pt-2 sm:px-6 lg:px-8">
              <div className="group relative">
                <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 opacity-40 blur transition duration-500 group-focus-within:opacity-70" />
                <div className="relative flex items-center rounded-2xl border border-white/10 bg-[#0d1320]/90 shadow-2xl backdrop-blur-xl">
                  <span className="pl-4 text-slate-500">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </span>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={searchHint}
                    autoComplete="off"
                    className="w-full bg-transparent py-4 pl-3 pr-4 text-sm font-medium text-white outline-none placeholder:text-slate-500 sm:py-5 sm:text-base"
                  />
                  {hasQuery ? (
                    <button
                      type="button"
                      onClick={() => onSearchChange("")}
                      className="mr-3 rounded-lg px-2 py-1 text-xs font-bold text-slate-500 transition hover:bg-white/10 hover:text-white"
                    >
                      Effacer
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="mt-2 px-1 text-[11px] font-medium text-slate-500">
                {isBookingReferenceMode
                  ? "Mode référence — résultats rendez-vous uniquement"
                  : "Mode client — saisissez au moins 2 caractères"}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 lg:px-8">
              {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
                  <p className="text-sm font-semibold text-slate-400">{t("loading")}</p>
                </div>
              ) : !hasQuery ? (
                <div className="flex flex-col items-center justify-center py-12 text-center animate-fade-in-up sm:py-20">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                    <svg className="h-8 w-8 text-cyan-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-slate-300">Commencez une recherche</p>
                  <p className="mt-2 max-w-xs text-xs leading-relaxed text-slate-500">
                    Référence <span className="font-mono text-cyan-400/90">CRN-…</span> pour un
                    rendez-vous, ou nom / téléphone pour un client.
                  </p>
                  <button
                    type="button"
                    onClick={() => setMode("scan")}
                    className="mt-6 inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-2.5 text-xs font-bold text-cyan-300 transition hover:bg-cyan-500/20"
                  >
                    Ouvrir le scanner
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                </div>
              ) : showEmpty ? (
                <p className="py-12 text-center text-sm font-medium text-slate-500 animate-fade-in">
                  {isBookingReferenceMode ? t("noBookingsFound") : t("noClientsFound")}
                </p>
              ) : (
                <div className="space-y-3 pb-8">
                  {foundClients.map((client, index) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => onSelectClient(client)}
                      style={{ animationDelay: `${index * 40}ms` }}
                      className="animate-fade-in-up group flex w-full items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.04] p-4 text-left transition duration-300 hover:border-cyan-500/30 hover:bg-white/[0.07] hover:shadow-[0_12px_40px_rgba(6,182,212,0.12)] active:scale-[0.99]"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 text-lg font-black shadow-lg shadow-cyan-500/20">
                        {(client.first_name?.[0] || "?").toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-bold text-white group-hover:text-cyan-100">
                          {client.first_name} {client.last_name}
                        </p>
                        <p className="mt-0.5 text-sm font-medium text-slate-400">{client.phone}</p>
                      </div>
                      <span className="shrink-0 text-xs font-bold text-cyan-400 opacity-0 transition group-hover:opacity-100">
                        Fiche →
                      </span>
                    </button>
                  ))}

                  {foundBookings.map((booking, index) => (
                    <button
                      key={booking.id}
                      type="button"
                      onClick={() => onSelectBooking(booking)}
                      style={{ animationDelay: `${index * 40}ms` }}
                      className={`animate-fade-in-up group flex w-full flex-col gap-2 rounded-2xl border p-4 text-left transition duration-300 active:scale-[0.99] sm:flex-row sm:items-center sm:justify-between ${
                        selectedBooking?.id === booking.id
                          ? "border-cyan-400/50 bg-cyan-500/10 shadow-[0_12px_40px_rgba(6,182,212,0.15)]"
                          : "border-white/8 bg-white/[0.04] hover:border-cyan-500/25 hover:bg-white/[0.07]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-black text-cyan-300">
                            {booking.booking_reference}
                          </span>
                          <StatusBadge status={booking.status} />
                        </div>
                        <p className="mt-1 truncate text-sm font-semibold text-white">
                          {getBookingClientName(booking)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {booking.user_phone} · {booking.resource_label} ·{" "}
                          {booking.booking_date}{" "}
                          {booking.start_time.slice(0, 5)}–{booking.end_time.slice(0, 5)}
                        </p>
                      </div>
                      <span className="text-lg font-bold text-cyan-400/80 group-hover:text-cyan-300">
                        →
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6 lg:px-8 animate-fade-in">
            <div className="mx-auto w-full max-w-2xl flex-1">
              <div className="rounded-3xl border border-white/10 bg-white p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-6">
                <p className="mb-4 text-center text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
                  QR ticket client ou rendez-vous
                </p>
                <WhatsAppQrScanner
                  instruction="Scannez le QR du ticket de création (compte) ou le QR de validation du rendez-vous."
                  onScan={onScan}
                  onStatusChange={onScanStatusChange}
                />
              </div>
              <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-500">
                Utilisez{" "}
                <span className="font-semibold text-slate-400">https://</span> sur téléphone pour
                activer la caméra. Acceptez l&apos;accès caméra du navigateur.
              </p>
            </div>
          </div>
        )}
      </div>

      {selectedBooking ? (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-md animate-fade-in sm:items-center sm:justify-center sm:p-6"
          role="presentation"
          onClick={() => onSelectBooking(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Détails du rendez-vous"
            onClick={(e) => e.stopPropagation()}
            className="animate-fade-in-up flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-[#0d1320] shadow-[0_-20px_80px_rgba(0,0,0,0.5)] sm:max-w-lg sm:rounded-[2rem]"
          >
            <div className="premium-accent shrink-0 px-6 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/70">
                    Rendez-vous
                  </p>
                  <h2 className="mt-1 truncate text-xl font-black text-white sm:text-2xl">
                    {selectedBooking.booking_reference}
                  </h2>
                  <p className="mt-1 truncate text-sm font-semibold text-white/85">
                    {getBookingClientName(selectedBooking)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectBooking(null)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
                  aria-label="Fermer"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Téléphone", selectedBooking.user_phone],
                  ["Poste", selectedBooking.resource_label],
                  ["Date", selectedBooking.booking_date],
                  [
                    "Horaire",
                    `${selectedBooking.start_time.slice(0, 5)} – ${selectedBooking.end_time.slice(0, 5)}`,
                  ],
                  ["Montant", `${selectedBooking.total_price} DA`],
                  [
                    "Statut",
                    selectedBooking.status === "PAYE"
                      ? "Payé"
                      : selectedBooking.status === "ANNULE"
                        ? "Annulé"
                        : "En attente",
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-3"
                  >
                    <dt className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      {label}
                    </dt>
                    <dd className="mt-1 font-bold text-white">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="shrink-0 border-t border-white/8 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {selectedBooking.status === "EN_ATTENTE" ? (
                  <button
                    type="button"
                    disabled={validationState === "submitting"}
                    onClick={() => onValidateCash(selectedBooking.id)}
                    className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-500/25 transition hover:brightness-110 disabled:opacity-50"
                  >
                    {t("paymentCash")}
                  </button>
                ) : null}
                {selectedBooking.status !== "ANNULE" ? (
                  <button
                    type="button"
                    disabled={validationState === "submitting"}
                    onClick={() => onCancelBooking(selectedBooking.id)}
                    className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-5 py-3.5 text-sm font-bold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    {t("cancelBooking")}
                  </button>
                ) : null}
                {selectedBooking.status === "PAYE" ? (
                  <button
                    type="button"
                    disabled={printingBookingId !== null}
                    onClick={() => onPrintReceipt(selectedBooking.id)}
                    className="flex-1 rounded-2xl bg-white py-3.5 text-sm font-black text-slate-900 transition hover:bg-slate-100 disabled:opacity-50"
                  >
                    {printingBookingId === selectedBooking.id
                      ? "Impression…"
                      : "Imprimer le ticket"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function isBookingReferenceQuery(query: string): boolean {
  return /^CRN-/i.test(query.trim());
}
