import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { authHeader, clearAuthSession, getAuthSession } from "../auth/session";
import { ClientBrandPanel } from "../components/ClientBrandPanel";
import type { AppLanguage } from "../i18n";
import cashImg from "../assets/cash.png";
import backgroundImg from "../assets/background.png";

type ConfirmationDraft = {
  booking_date: string;
  start_time: string;
  end_time: string;
  total_price: string;
  modeLabel: string;
  modeKey?: string;
  paymentMethod: "cash" | "baridimob";
  clientName: string;
  establishmentName: string;
  establishmentAddress: string;
  bookingId: number | null;
};

type ConfirmedBooking = ConfirmationDraft & {
  booking_reference: string;
};

const CONFIRMATION_STORAGE_KEY = "chrono-dz-confirmation";
const CONFIRMATION_DRAFT_STORAGE_KEY = "chrono-dz-confirmation-draft";
// Marge tampon (min) entre deux réservations — alignée sur BOOKING_BUFFER_MINUTES (api/views.py).
const BOOKING_BUFFER_MINUTES = 5;

function dateToLongLabel(dateValue: string, language: AppLanguage) {
  const current = new Date(`${dateValue}T12:00:00`);
  return new Intl.DateTimeFormat(language === "ar" ? "ar-DZ" : "fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(current);
}

function normalizePaymentMethod(value: unknown): "cash" | "baridimob" {
  return value === "baridimob" ? "baridimob" : "cash";
}

function loadConfirmationDraft(state: unknown): ConfirmationDraft | ConfirmedBooking | null {
  if (state && typeof state === "object") {
    const candidate = state as Partial<ConfirmationDraft & ConfirmedBooking>;
    if (
      typeof candidate.booking_date === "string" &&
      typeof candidate.start_time === "string" &&
      typeof candidate.end_time === "string" &&
      typeof candidate.total_price === "string" &&
      typeof candidate.modeLabel === "string" &&
      typeof candidate.clientName === "string" &&
      typeof candidate.establishmentName === "string" &&
      typeof candidate.establishmentAddress === "string" &&
      (candidate.bookingId === null || typeof candidate.bookingId === "number")
    ) {
      return {
        ...candidate,
        paymentMethod: normalizePaymentMethod(candidate.paymentMethod),
      } as ConfirmationDraft & ConfirmedBooking;
    }
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    const confirmedRaw = window.sessionStorage.getItem(CONFIRMATION_STORAGE_KEY);
    if (confirmedRaw) {
      const parsedConfirmed = JSON.parse(confirmedRaw) as Partial<ConfirmedBooking>;
      if (
        typeof parsedConfirmed.booking_reference === "string" &&
        typeof parsedConfirmed.booking_date === "string" &&
        typeof parsedConfirmed.start_time === "string" &&
        typeof parsedConfirmed.end_time === "string" &&
        typeof parsedConfirmed.total_price === "string" &&
        typeof parsedConfirmed.modeLabel === "string" &&
        typeof parsedConfirmed.clientName === "string" &&
        typeof parsedConfirmed.establishmentName === "string" &&
        typeof parsedConfirmed.establishmentAddress === "string" &&
        (parsedConfirmed.bookingId === null || typeof parsedConfirmed.bookingId === "number")
      ) {
        return {
          ...parsedConfirmed,
          paymentMethod: normalizePaymentMethod(parsedConfirmed.paymentMethod),
        } as ConfirmedBooking;
      }
    }

    const raw = window.sessionStorage.getItem(CONFIRMATION_DRAFT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<ConfirmationDraft>;
    if (
      typeof parsed.booking_date === "string" &&
      typeof parsed.start_time === "string" &&
      typeof parsed.end_time === "string" &&
      typeof parsed.total_price === "string" &&
      typeof parsed.modeLabel === "string" &&
      typeof parsed.clientName === "string" &&
      typeof parsed.establishmentName === "string" &&
      typeof parsed.establishmentAddress === "string" &&
      (parsed.bookingId === null || typeof parsed.bookingId === "number")
    ) {
      return {
        ...parsed,
        paymentMethod: normalizePaymentMethod(parsed.paymentMethod),
      } as ConfirmationDraft;
    }
  } catch {
    return null;
  }

  return null;
}

export function ReservationConfirmationPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const session = getAuthSession();
  const isArabic = i18n.language === "ar";
  const confirmation = useMemo(() => loadConfirmationDraft(location.state), [location.state]);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [slotAvailable, setSlotAvailable] = useState<boolean | null>(null);
  const [checkingSlotAvailability, setCheckingSlotAvailability] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "baridimob">(
    confirmation?.paymentMethod === "baridimob" ? "baridimob" : "cash"
  );
  const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(() => {
    return confirmation && "booking_reference" in confirmation ? confirmation : null;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (confirmedBooking) {
      window.sessionStorage.setItem(CONFIRMATION_STORAGE_KEY, JSON.stringify(confirmedBooking));
      window.sessionStorage.removeItem(CONFIRMATION_DRAFT_STORAGE_KEY);
      return;
    }

    if (confirmation && !("booking_reference" in confirmation)) {
      window.sessionStorage.setItem(
        CONFIRMATION_DRAFT_STORAGE_KEY,
        JSON.stringify({ ...confirmation, paymentMethod })
      );
    }
  }, [confirmation, confirmedBooking, paymentMethod]);

  useEffect(() => {
    if (confirmation && !confirmedBooking && "booking_reference" in confirmation) {
      setConfirmedBooking(confirmation);
    }
  }, [confirmation, confirmedBooking]);

  useEffect(() => {
    let isMounted = true;

    const checkSlotAvailability = async () => {
      if (!session || !confirmation || confirmedBooking || "booking_reference" in confirmation) {
        return;
      }

      setSubmissionError(null);
      setCheckingSlotAvailability(true);

      try {
        const establishmentId = session.establishmentId ?? 1;
        const activeResourceId = await resolveAvailableResourceId({
          establishmentId,
          bookingDate: confirmation.booking_date,
          startTime: confirmation.start_time,
          endTime: confirmation.end_time,
          ignoreBookingId: confirmation.bookingId,
        });

        if (!isMounted) {
          return;
        }

        if (!activeResourceId) {
          setSlotAvailable(false);
          setSubmissionError("Aucun créneau libre n'est disponible sur cette date.");
          return;
        }

        setSlotAvailable(true);
        setSubmissionError((previousError) =>
          previousError === "Aucun créneau libre n'est disponible sur cette date." ? null : previousError
        );
      } catch {
        if (!isMounted) {
          return;
        }
        setSlotAvailable(null);
      } finally {
        if (isMounted) {
          setCheckingSlotAvailability(false);
        }
      }
    };

    void checkSlotAvailability();

    return () => {
      isMounted = false;
    };
  }, [
    confirmation,
    confirmedBooking,
    session?.establishmentId,
    session?.userId,
  ]);

  const handleLogout = () => {
    clearAuthSession();
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(CONFIRMATION_STORAGE_KEY);
      window.sessionStorage.removeItem(CONFIRMATION_DRAFT_STORAGE_KEY);
    }
    navigate("/login", { replace: true });
  };

  const confirmReservation = async () => {
    if (!session || !confirmation || "booking_reference" in confirmation) {
      return;
    }

    if (slotAvailable === false) {
      setSubmissionError("Aucun créneau libre n'est disponible sur cette date.");
      return;
    }

    setSubmitting(true);
    setSubmissionError(null);

    try {
      const establishmentId = session.establishmentId ?? 1;
      const activeResourceId = await resolveAvailableResourceId({
        establishmentId,
        bookingDate: confirmation.booking_date,
        startTime: confirmation.start_time,
        endTime: confirmation.end_time,
        ignoreBookingId: confirmation.bookingId,
      });

      if (!activeResourceId) {
        setSubmissionError("Aucun créneau libre n'est disponible sur cette date.");
        return;
      }

      const payload = {
        user: session.userId,
        resource: activeResourceId,
        booking_date: confirmation.booking_date,
        start_time: confirmation.start_time,
        end_time: confirmation.end_time,
        status: "EN_ATTENTE",
        payment_method: paymentMethod.toUpperCase(),
        total_price: confirmation.total_price,
      };

      const response = await fetch(
        confirmation.bookingId ? `/api/bookings/${confirmation.bookingId}/` : "/api/bookings/",
        {
          method: confirmation.bookingId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeader(),
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.detail || "Impossible d'enregistrer le rendez-vous.");
      }

      const result = (await response.json()) as { id: number; booking_reference: string };

      // ── BaridiMob → redirect to Chargily checkout ──────────────────────
      if (paymentMethod === "baridimob") {
        const checkoutResp = await fetch("/api/payments/chargily/create-checkout/", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader() },
          body: JSON.stringify({ booking_id: result.id }),
        });

        if (!checkoutResp.ok) {
          const errPayload = await checkoutResp.json().catch(() => ({}));
          throw new Error(errPayload?.error || "Impossible de créer le paiement BaridiMob.");
        }

        const { checkout_url } = (await checkoutResp.json()) as { checkout_url: string };
        // Full redirect to Chargily payment page
        window.location.href = checkout_url;
        return; // stop here — success page handles the rest
      }

      // ── Cash → show inline confirmation (existing behaviour) ────────────
      const nextConfirmedBooking: ConfirmedBooking = {
        ...confirmation,
        paymentMethod,
        booking_reference: result.booking_reference,
      };

      setConfirmedBooking(nextConfirmedBooking);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(CONFIRMATION_STORAGE_KEY, JSON.stringify(nextConfirmedBooking));
        window.sessionStorage.removeItem(CONFIRMATION_DRAFT_STORAGE_KEY);
      }
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Erreur inattendue.");
    } finally {
      setSubmitting(false);
    }
  };

  const backToDashboard = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(CONFIRMATION_STORAGE_KEY);
      window.sessionStorage.removeItem(CONFIRMATION_DRAFT_STORAGE_KEY);
    }
    navigate("/appointments", { replace: true });
  };

  const backToTimeSelection = () => {
    navigate("/appointments/time", { replace: true, state: confirmation });
  };

  const bookingDateLabel = confirmation ? dateToLongLabel(confirmation.booking_date, i18n.language as AppLanguage) : "-";
  const bookingRangeLabel = confirmation ? `${confirmation.start_time} - ${confirmation.end_time}` : "-";

  return (
    <main dir={isArabic ? "rtl" : "ltr"} className="relative min-h-screen w-full overflow-x-hidden text-slate-900">
      {/* Fond plein écran + filtre cyan (comme la page de sélection de langue) */}
      <div
        className="absolute inset-0 -z-20"
        style={{ backgroundImage: `url(${backgroundImg})`, backgroundSize: "cover", backgroundPosition: "center" }}
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-cyan-900/55 via-sky-900/45 to-slate-900/55" />

      <div className="relative z-10 flex min-h-screen w-full items-stretch justify-stretch">
        <section className="flex w-full">
          <div className="grid w-full lg:min-h-screen lg:grid-cols-[0.92fr_1.08fr]">
            <ClientBrandPanel
              hideBackground
              className="hidden lg:flex lg:min-h-screen"
              footer={
                <div className="grid gap-3 rounded-[1.75rem] border border-white/15 bg-white/10 p-5 shadow-[0_18px_50px_rgba(2,132,199,0.18)] backdrop-blur-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">{t("bookingDetailsMode")}</span>
                    <span className="text-sm font-black text-white">{confirmation?.modeLabel ?? confirmedBooking?.modeLabel ?? "-"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">{t("bookingDetailsTime")}</span>
                    <span className="text-sm font-black text-white">{bookingRangeLabel}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">{t("priceTotal")}</span>
                    <span className="text-sm font-black text-white">{confirmation?.total_price ?? confirmedBooking?.total_price ?? "-"} {t("currency")}</span>
                  </div>
                </div>
              }
            />

            <div className="flex min-h-0 flex-col px-4 py-4 pb-7 sm:px-6 sm:py-8 lg:px-8 lg:py-9 animate-fade-in-up">
              {/* Action buttons (Logout) */}
              <div className="mb-2 flex justify-end w-full">
                <button
                  type="button"
                  onClick={handleLogout}
                  title={t("logout")}
                  aria-label={t("logout")}
                  className="group flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 hover:shadow-md"
                >
                  <svg className="h-5 w-5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>

              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-cyan-200 drop-shadow-[0_1px_8px_rgba(2,6,23,0.4)]">
                    {confirmedBooking ? t("bookingCreatedLabel") : t("bookingStepFinal")}
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-white drop-shadow-[0_2px_14px_rgba(2,6,23,0.4)] sm:text-3xl lg:text-4xl">
                    {confirmedBooking ? t("bookingRecordedLabel") : t("bookingValidateInfo")}
                  </h2>
                </div>
                {confirmation && !confirmedBooking ? (
                  <button
                    type="button"
                    onClick={backToTimeSelection}
                    className="group inline-flex shrink-0 items-center gap-2 rounded-2xl border border-sky-100 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-sky-300 hover:text-sky-700"
                  >
                    <span className="transition group-hover:-translate-x-0.5">{isArabic ? "→" : "←"}</span>
                    {t("bookingBack")}
                  </button>
                ) : null}
              </div>

              {!confirmation ? (
                <div className="flex flex-1 items-center justify-center rounded-[2rem] border border-dashed border-sky-200 bg-slate-50 px-6 py-10 text-center text-slate-500">
                  {t("bookingNoConfirmation")}
                </div>
              ) : confirmedBooking ? (
                <div className="flex flex-1 flex-col gap-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard label={t("bookingReference")} value={confirmedBooking.booking_reference} />
                    <SummaryCard label={t("bookingDate")} value={dateToLongLabel(confirmedBooking.booking_date, i18n.language as AppLanguage)} />
                    <SummaryCard label={t("bookingDetailsTime")} value={bookingRangeLabel} />
                    <SummaryCard label={t("priceTotal")} value={`${confirmedBooking.total_price} ${t("currency")}`} />
                  </div>

                  <div className="rounded-[2rem] border border-sky-100 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">{t("bookingSummaryTitle")}</p>
                        <h3 className="mt-2 text-2xl font-black text-slate-900">{t("bookingReservationConfirmed")}</h3>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
                        {t("bookingConfirmedBadge")}
                      </span>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <DetailRow label={t("bookingDetailsMode")} value={confirmedBooking.modeLabel} />
                      <DetailRow label={t("bookingPaymentLabel")} value={confirmedBooking.paymentMethod === "baridimob" ? t("bookingPaymentBaridimobLabel") : t("bookingPaymentCashLabel")} />
                      <DetailRow label={t("bookingDetailsEstablishment")} value={confirmedBooking.establishmentName} />
                      <DetailRow label={t("address")} value={confirmedBooking.establishmentAddress} className="md:col-span-2" />
                    </div>

                    <div className="mt-5 rounded-[1.5rem] bg-slate-50 px-5 py-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">{t("bookingStatusLabel")}</p>
                      <p className="mt-2 text-lg font-black text-slate-900">{t("bookingHandledText")}</p>
                      <p className="mt-2 text-sm font-bold text-slate-600">
                        {confirmedBooking.paymentMethod === "cash"
                          ? t("bookingPaymentCashNote")
                          : t("bookingPaymentBaridimobNote")}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col gap-6">
                  <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                    <SummaryCard label={t("clientName")} value={confirmation.clientName} />
                    <SummaryCard label={t("bookingDetailsEstablishment")} value={confirmation.establishmentName} />
                    <SummaryCard label={t("address")} value={confirmation.establishmentAddress} className="md:col-span-2" />
                    <SummaryCard label={t("bookingDate")} value={`${bookingDateLabel} • ${bookingRangeLabel}`} />
                    <SummaryCard label={t("bookingDetailsMode")} value={confirmation.modeLabel} />
                  </div>

                  <div className="rounded-[2rem] border border-sky-100 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">{t("priceTotal")}</p>
                        <p className="mt-2 text-3xl font-black text-slate-900">{confirmation.total_price} {t("currency")}</p>
                      </div>
                    </div>

                    <div className="mt-5 rounded-[1.5rem] border border-slate-100 bg-slate-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">{t("bookingPaymentLabel")}</p>
                      <div className="mt-4">
                        <div className="flex items-center gap-3 rounded-[1.25rem] border border-sky-500 bg-sky-50 px-4 py-3 text-sky-900 shadow-[0_14px_34px_rgba(14,165,233,0.16)]">
                          <img src={cashImg} alt="Cash" className="h-8 w-8 rounded-lg object-cover shadow-sm" />
                          <span className="block text-sm font-black">{t("bookingPaymentCashLabel")}</span>
                          <span className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-sky-500 text-white">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </span>
                        </div>
                      </div>

                      {checkingSlotAvailability ? (
                        <p className="mt-3 text-xs font-semibold text-slate-500">Vérification du créneau en cours...</p>
                      ) : null}
                    </div>

                    {submissionError ? (
                      <div className="mt-4 rounded-[1.25rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                        {submissionError}
                      </div>
                    ) : null}
                  </div>

                  <p className="mt-6 text-xl font-black tracking-tight text-white drop-shadow-[0_2px_14px_rgba(2,6,23,0.4)] sm:text-2xl">
                    {t("bookingConfirmQuestion")}
                  </p>

                  <div className={`mt-4 flex justify-end ${isArabic ? "flex-row-reverse" : ""}`}>
                    <button
                      type="button"
                      onClick={confirmReservation}
                      disabled={submitting || checkingSlotAvailability || slotAvailable === false}
                      className="w-full rounded-2xl bg-sky-600 px-8 py-3.5 text-sm font-bold text-white shadow-[0_16px_35px_rgba(14,165,233,0.28)] transition hover:-translate-y-0.5 hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-sky-300 sm:w-auto"
                    >
                      {submitting ? t("bookingLoading") : t("bookingConfirmButton")}
                    </button>
                  </div>
                </div>
              )}

              {confirmedBooking ? (
                <div className="mt-6 flex flex-col items-stretch justify-end gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={backToDashboard}
                    className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-[0_16px_40px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:bg-slate-800 sm:ml-auto sm:w-auto"
                  >
                    {t("bookingBackHome")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-2xl border border-cyan-100 bg-white/95 p-4 shadow-[0_12px_30px_rgba(8,145,178,0.1)] ${className ?? ""}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">{label}</p>
      <p className="mt-1.5 break-words text-base font-bold leading-6 text-slate-900">{value}</p>
    </div>
  );
}

function DetailRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-2xl border border-cyan-100 bg-white/95 px-4 py-3 ${className ?? ""}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">{label}</p>
      <p className="mt-1.5 text-base font-bold leading-6 text-slate-900">{value}</p>
    </div>
  );
}

async function resolveAvailableResourceId({
  establishmentId,
  bookingDate,
  startTime,
  endTime,
  ignoreBookingId,
}: {
  establishmentId: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  ignoreBookingId: number | null;
}) {
  const toMinutes = (timeValue: string) => {
    const normalized = timeValue.slice(0, 5);
    const [hours, minutes] = normalized.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const requestedStartMinutes = toMinutes(startTime);
  const requestedEndMinutes = toMinutes(endTime);

  const [resourcesResponse, bookingsResponse] = await Promise.all([
    fetch(`/api/resources/?establishment_id=${establishmentId}`, { headers: authHeader() }),
    fetch(`/api/bookings/?establishment_id=${establishmentId}&date=${bookingDate}`, { headers: authHeader() }),
  ]);

  if (!resourcesResponse.ok || !bookingsResponse.ok) {
    return null;
  }

  const resources = (await resourcesResponse.json()) as Array<{ id: number; status: string }>;
  const bookings = (await bookingsResponse.json()) as Array<{
    id: number;
    resource: number;
    start_time: string;
    end_time: string;
    status: string;
  }>;

  const activeResources = resources.filter((resource) => resource.status === "ACTIF");
  if (activeResources.length === 0) {
    return null;
  }

  for (const resource of activeResources) {
    const conflict = bookings.some((booking) => {
      if (ignoreBookingId && booking.id === ignoreBookingId) {
        return false;
      }

      if (booking.status === "ANNULE") {
        return false;
      }

      if (!booking.resource) {
        return false;
      }

      const bookingStartMinutes = toMinutes(booking.start_time);
      const bookingEndMinutes = toMinutes(booking.end_time);
      const overlaps =
        bookingStartMinutes < requestedEndMinutes + BOOKING_BUFFER_MINUTES &&
        bookingEndMinutes > requestedStartMinutes - BOOKING_BUFFER_MINUTES;
      return overlaps && booking.resource === resource.id;
    });

    if (!conflict) {
      return resource.id;
    }
  }

  return null;
}