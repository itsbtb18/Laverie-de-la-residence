import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import { authHeader, getAuthSession } from "../auth/session";
import type { AppLanguage } from "../i18n";
import { readApiErrorPayload, resolveApiErrorMessage } from "../utils/apiErrors";
import { isValidAlgerianPhone, isValidSecretCode, normalizePhoneInput } from "../utils/validation";

type AdminCustomerDetailPageProps = {
  language: AppLanguage;
};

type Customer = {
  id: number;
  phone: string;
  first_name: string;
  last_name: string;
  role: string;
  date_joined: string;
  secret_code_preview?: string;
  secret_code_plain?: string;
  establishment_name?: string | null;
};

type Booking = {
  id: number;
  booking_reference: string;
  resource_label: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: "EN_ATTENTE" | "PAYE" | "ANNULE";
  total_price: string;
  validated_by_phone?: string;
  validated_at?: string;
};

export function AdminCustomerDetailPage({ language }: AdminCustomerDetailPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const session = getAuthSession();
  const customerId = params.customerId ? Number(params.customerId) : null;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [secretCode, setSecretCode] = useState("");

  useEffect(() => {
    let active = true;

    const loadCustomer = async () => {
      if (!customerId) {
        setError("Client introuvable.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/users/${customerId}/`, { headers: authHeader() });
        if (!response.ok) {
          throw new Error("Client introuvable.");
        }

        const payload = (await response.json()) as Customer;
        if (!active) {
          return;
        }

        setCustomer(payload);
        setFirstName(payload.first_name || "");
        setLastName(payload.last_name || "");
        setPhone(payload.phone || "");

        const bookingResponse = await fetch(`/api/bookings/?search=${encodeURIComponent(payload.phone)}`, {
          headers: authHeader(),
        });

        if (bookingResponse.ok) {
          const bookingPayload = (await bookingResponse.json()) as Booking[];
          if (active) {
            setBookings(bookingPayload.filter((booking) => booking.total_price !== undefined));
          }
        }
      } catch (errorValue) {
        if (active) {
          setError(errorValue instanceof Error ? errorValue.message : "Erreur de chargement.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadCustomer();

    return () => {
      active = false;
    };
  }, [customerId]);

  const bookingStats = useMemo(() => {
    return {
      total: bookings.length,
      paid: bookings.filter((booking) => booking.status === "PAYE").length,
      pending: bookings.filter((booking) => booking.status === "EN_ATTENTE").length,
      cancelled: bookings.filter((booking) => booking.status === "ANNULE").length,
    };
  }, [bookings]);

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!customerId) {
      return;
    }

    setSaving(true);
    setError(null);

    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      setError(t("errors.clientFormRequired"));
      setSaving(false);
      return;
    }
    if (!isValidAlgerianPhone(phone)) {
      setError(t("errors.phoneInvalidFormat"));
      setSaving(false);
      return;
    }
    if (secretCode.trim() && !isValidSecretCode(secretCode)) {
      setError(t("errors.secretCodeInvalidFormat"));
      setSaving(false);
      return;
    }

    try {
      const payload: Record<string, string> = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: normalizePhoneInput(phone),
      };

      if (secretCode.trim()) {
        payload.secret_code = secretCode.trim();
      }

      const response = await fetch(`/api/users/${customerId}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeader(),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await readApiErrorPayload(response);
        throw new Error(
          resolveApiErrorMessage(errorPayload, "adminUpdateCustomer", t, {
            status: response.status,
          })
        );
      }

      const updated = (await response.json()) as Customer;
      setCustomer(updated);
      setSecretCode("");
    } catch (errorValue) {
      setError(
        errorValue instanceof Error ? errorValue.message : t("errors.generic")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    // open the in-site confirmation modal
    setShowDeleteModal(true);
  };

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const cancelDelete = () => {
    setShowDeleteModal(false);
  };

  const confirmDelete = async () => {
    if (!customerId) return;
    setDeleting(true);
    setError(null);

    try {
      // delete bookings first
      if (bookings && bookings.length > 0) {
        for (const b of bookings) {
          const res = await fetch(`/api/bookings/${b.id}/`, {
            method: "DELETE",
            headers: authHeader(),
          });

          if (!res.ok) {
            let body = "";
            try {
              const parsed = await res.json();
              body = parsed.detail || JSON.stringify(parsed);
            } catch (e) {
              body = await res.text().catch(() => "(no body)");
            }
            throw new Error(`Impossible de supprimer la réservation ${b.id}: ${body}`);
          }
        }
      }

      // delete user
      const response = await fetch(`/api/users/${customerId}/`, {
        method: "DELETE",
        headers: authHeader(),
      });

      if (!response.ok) {
        const payload = await readApiErrorPayload(response);
        throw new Error(
          resolveApiErrorMessage(payload, "adminGeneral", t, {
            status: response.status,
          })
        );
      }

      setShowDeleteModal(false);
      navigate("/admin/dashboard/creation", { replace: true });
    } catch (err) {
      console.error("Delete client error:", err);
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setDeleting(false);
    }
  };

  const randomSecretCode = () => String(Math.floor(100000 + Math.random() * 900000));

  return (
    <main className="min-h-screen w-screen overflow-y-auto bg-gradient-to-br from-slate-50 via-sky-50/20 to-white text-slate-900 pb-12 animate-fade-in-up">
      {/* Decorative background blooms */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-sky-100/40 blur-3xl animate-float-soft" />
        <div className="absolute right-0 top-1/3 h-96 w-96 rounded-full bg-indigo-50/30 blur-3xl animate-float-soft delay-300" />
      </div>

      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between rounded-[2rem] border border-sky-100/60 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.04)] backdrop-blur-xl">
          <div className="flex items-center gap-4 min-w-0">
            {/* Initials Avatar with custom gradient */}
            <div className="h-14 w-14 shrink-0 rounded-2xl bg-gradient-to-br from-sky-400 via-sky-500 to-indigo-500 flex items-center justify-center text-white text-xl font-black shadow-lg shadow-sky-500/20">
              {customer ? `${(customer.first_name?.[0] || "").toUpperCase()}${(customer.last_name?.[0] || "").toUpperCase()}` : "C"}
            </div>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.15em] text-sky-600 border border-sky-100/50 mb-1">
                Fiche Client
              </div>
              <h1 className="truncate text-xl sm:text-2xl font-black tracking-tight text-slate-900 leading-tight">
                {customer ? `${customer.first_name} ${customer.last_name}` : "Chargement..."}
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            {customer && (
              <button
                type="button"
                onClick={() => navigate(`/admin/dashboard/customers/${customerId}/ticket`)}
                className="group inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-5 text-xs font-bold text-white shadow-md shadow-sky-500/10 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:scale-95 cursor-pointer"
              >
                <svg className="w-4.5 h-4.5 shrink-0 transition-transform group-hover:scale-115" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                Consulter le ticket
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate("/admin/dashboard/creation", { replace: true })}
              className="group inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-xs font-bold text-white shadow-md transition-all duration-200 hover:bg-slate-800 hover:-translate-x-0.5 active:scale-95 cursor-pointer"
            >
              <svg className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              Retour
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 rounded-[2rem] border border-sky-100/50 bg-white/80 backdrop-blur-xl shadow-lg">
            <div className="h-10 w-10 rounded-full border-[3px] border-slate-200 border-t-sky-500 animate-spin" />
            <p className="mt-4 text-sm font-semibold text-slate-400">Chargement de la fiche client...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 rounded-[2rem] border border-rose-100 bg-rose-50/50 backdrop-blur-xl shadow-lg text-rose-800 max-w-2xl mx-auto text-center px-6">
            <svg className="w-12 h-12 text-rose-500 mb-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" /></svg>
            <h3 className="text-lg font-black">{error}</h3>
            <button
              type="button"
              onClick={() => navigate("/admin/dashboard/creation", { replace: true })}
              className="mt-6 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition"
            >
              Retour à la création
            </button>
          </div>
        ) : customer ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Card: Customer Information Form (5 cols) */}
            <div className="lg:col-span-5 rounded-[2rem] border border-sky-100/40 bg-white/70 backdrop-blur-xl p-6 sm:p-8 shadow-[0_20px_50px_rgba(15,23,42,0.03)] relative overflow-hidden flex flex-col justify-between">
              {/* Decorative blobs */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-sky-100/10 blur-2xl" />
                <div className="absolute left-0 bottom-0 h-32 w-32 rounded-full bg-cyan-100/10 blur-2xl" />
              </div>

              <form onSubmit={handleSave} className="relative z-10 w-full space-y-6">
                {/* Form Title */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-500">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-slate-900">Informations client</h2>
                      <p className="text-xs text-slate-400 mt-0.5">Modifiez et mettez à jour les informations du profil.</p>
                    </div>
                  </div>
                  <div className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-sky-600 border border-sky-100/50 shrink-0">
                    {customer.role}
                  </div>
                </div>

                {/* Nom & Prénom */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Nom</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Nom de famille"
                      className="w-full rounded-xl border border-slate-200 bg-white/80 px-4 py-3.5 text-sm font-medium text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-sky-400 focus:shadow-[0_0_0_4px_rgba(14,165,233,0.06)]"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Prénom</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Prénom"
                      className="w-full rounded-xl border border-slate-200 bg-white/80 px-4 py-3.5 text-sm font-medium text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-sky-400 focus:shadow-[0_0_0_4px_rgba(14,165,233,0.06)]"
                      required
                    />
                  </div>
                </div>

                {/* Téléphone */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Numéro de téléphone</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-slate-400">
                      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    </div>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="05XX XXX XXX"
                      dir="ltr"
                      className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm font-medium text-slate-900 outline-none transition-all duration-300 focus:border-sky-400 focus:shadow-[0_0_0_4px_rgba(14,165,233,0.06)]"
                      required
                    />
                  </div>
                </div>

                {/* Nouveau Code Secret */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Nouveau code secret (Optionnel)</label>
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-slate-400">
                        <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                      </div>
                      <input
                        type="text"
                        value={secretCode}
                        onChange={(e) => setSecretCode(e.target.value)}
                        placeholder="Laisser vide pour ne pas modifier"
                        className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 tracking-[0.3em] text-sm font-bold text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-400 placeholder:tracking-normal focus:border-sky-400 focus:shadow-[0_0_0_4px_rgba(14,165,233,0.06)]"
                        maxLength={6}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setSecretCode(randomSecretCode())}
                      className="shrink-0 rounded-xl bg-slate-950 px-5 py-3.5 text-xs font-bold text-white shadow-lg transition-all duration-200 hover:bg-slate-800 hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                    >
                      Générer
                    </button>
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex gap-3 pt-4 border-t border-sky-100/40">
                  <button
                    type="submit"
                    disabled={saving}
                    className="group relative flex-1 min-h-12 overflow-hidden rounded-xl bg-gradient-to-r from-sky-600 via-sky-500 to-cyan-500 px-5 py-3 text-xs font-bold text-white shadow-[0_14px_35px_rgba(14,165,233,0.22)] transition-all duration-300 hover:shadow-[0_18px_45px_rgba(14,165,233,0.32)] hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {saving ? (
                        <>
                          <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          Enregistrement...
                        </>
                      ) : (
                        <>
                          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                          Enregistrer
                        </>
                      )}
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-sky-500 to-cyan-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50/40 px-5 py-3 text-xs font-bold text-rose-700 transition hover:bg-rose-100/70 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                  >
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Supprimer
                  </button>
                </div>
              </form>
            </div>

            {/* Right Panel: Summary Stats + Bookings List (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Summary Stats Grid */}
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 rounded-[2rem] border border-sky-100/60 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.03)] backdrop-blur-xl relative overflow-hidden">
                <div className="rounded-2xl border border-sky-50 bg-sky-50/20 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sky-500">Téléphone</p>
                  <p className="mt-2 text-sm font-bold text-slate-800 truncate" dir="ltr">{customer.phone}</p>
                </div>
                <div className="rounded-2xl border border-sky-50 bg-sky-50/20 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sky-500">Créé le</p>
                  <p className="mt-2 text-sm font-bold text-slate-800 truncate">
                    {new Date(customer.date_joined).toLocaleString(language === "ar" ? "ar-DZ" : "fr-FR").split(" ")[0]}
                  </p>
                </div>
                <div className="rounded-2xl border border-sky-50 bg-sky-50/20 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sky-500">Établissement</p>
                  <p className="mt-2 text-sm font-bold text-slate-800 truncate">{customer.establishment_name || session?.establishmentName || "-"}</p>
                </div>
              </div>

              {/* Bookings Statistics Card & List */}
              <div className="rounded-[2rem] border border-sky-100/40 bg-white/70 backdrop-blur-xl p-6 sm:p-8 shadow-[0_20px_50px_rgba(15,23,42,0.03)] relative overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-slate-900">Historique des réservations</h2>
                      <p className="text-xs text-slate-400 mt-0.5">Suivi de tous ses rendez-vous passés et futurs.</p>
                    </div>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-600">
                    {bookingStats.total} total
                  </div>
                </div>

                {/* Substats dashboard */}
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-6">
                  <StatCard label="Total" value={bookingStats.total} tone="sky" />
                  <StatCard label="Payés" value={bookingStats.paid} tone="emerald" />
                  <StatCard label="En attente" value={bookingStats.pending} tone="amber" />
                  <StatCard label="Annulés" value={bookingStats.cancelled} tone="rose" />
                </div>

                {/* List Container */}
                <div className="max-h-[350px] overflow-y-auto pr-1 scrollbar-thin">
                  {bookings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center rounded-[1.25rem] border border-dashed border-sky-100 bg-slate-50/20">
                      <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                        <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      </div>
                      <p className="text-xs font-semibold text-slate-500">Aucune réservation pour ce client.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {bookings.map((booking) => (
                        <button
                          key={booking.id}
                          type="button"
                          onClick={() => navigate(`/admin/dashboard/bookings/${booking.id}`)}
                          className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-sky-100/60 bg-white/90 p-4 text-left shadow-[0_10px_24px_rgba(15,23,42,0.02)] transition-all duration-200 hover:-translate-y-px hover:border-sky-200 hover:shadow-[0_18px_34px_rgba(15,23,42,0.06)] cursor-pointer"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-black text-slate-800 group-hover:text-sky-600 transition-colors">{booking.booking_reference}</p>
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">{booking.resource_label}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-400">
                              <span className="flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                {booking.booking_date}
                              </span>
                              <span className="flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                {booking.start_time.slice(0, 5)} - {booking.end_time.slice(0, 5)}
                              </span>
                            </div>
                          </div>
                          
                          {/* Booking Status Badge */}
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.15em] border ${
                                booking.status === "PAYE"
                                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                  : booking.status === "ANNULE"
                                    ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                                    : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                              }`}
                            >
                              {booking.status === "PAYE" ? "Payé" : booking.status === "ANNULE" ? "Annulé" : "En attente"}
                            </span>
                            <svg className="w-4 h-4 text-slate-300 transition-all duration-200 group-hover:text-sky-500 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-scale-in">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={cancelDelete} />
          <div className="relative z-10 w-full max-w-lg rounded-3xl bg-white p-6 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-slate-100 animate-scale-in">
            {/* Warning Header */}
            <div className="flex items-center gap-3.5 mb-4 text-rose-600">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center">
                <svg className="w-6 h-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" /></svg>
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-950 leading-tight">Confirmer la suppression</h3>
                <p className="text-xs text-rose-500/80 font-bold tracking-wide uppercase mt-0.5">Cette action est irréversible</p>
              </div>
            </div>
            
            <p className="text-sm text-slate-500 leading-relaxed">
              {bookings && bookings.length > 0
                ? `Ce client possède actuellement ${bookings.length} réservation(s). Supprimer le compte entraînera également la suppression irrévocable de toutes ses réservations associées.`
                : "Êtes-vous sûr de vouloir supprimer définitivement ce compte client ? Ses données de connexion seront perdues."}
            </p>

            {bookings && bookings.length > 0 && (
              <div className="mt-4 max-h-40 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50/50 p-3.5 space-y-2 scrollbar-thin">
                {bookings.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 last:border-b-0">
                    <div className="min-w-0">
                      <div className="truncate font-bold text-xs text-slate-800">{b.booking_reference}</div>
                      <div className="mt-0.5 text-[10px] text-slate-400 font-semibold">{b.booking_date} • {b.start_time.slice(0,5)} - {b.end_time.slice(0,5)}</div>
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-100">{b.resource_label}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3">
              <button
                type="button"
                onClick={cancelDelete}
                disabled={deleting}
                className="w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="w-full sm:w-auto rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-black text-white hover:bg-rose-700 transition cursor-pointer"
              >
                {deleting ? "Suppression..." : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "sky" | "emerald" | "amber" | "rose";
}) {
  const toneClasses = {
    sky: "border-sky-100 bg-sky-50/30 text-sky-500 shadow-sky-100/10",
    emerald: "border-emerald-100 bg-emerald-50/30 text-emerald-500 shadow-emerald-100/10",
    amber: "border-amber-100 bg-amber-50/30 text-amber-500 shadow-amber-100/10",
    rose: "border-rose-100 bg-rose-50/30 text-rose-500 shadow-rose-100/10",
  }[tone];

  return (
    <div className={`rounded-2xl border p-4.5 transition-all duration-300 hover:shadow-md ${toneClasses}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-900 tracking-tight">{value}</p>
    </div>
  );
}
