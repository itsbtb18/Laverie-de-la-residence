import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import i18n from "../i18n";
import { readApiErrorPayload, resolveApiErrorMessage } from "../utils/apiErrors";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { clearAuthSession, getAuthSession } from "../auth/session";
import logoImg from "../assets/logo.png";

/* ──────────────────────── Types ──────────────────────── */

type SuperAdminDashboardPageProps = { language: "fr" | "ar" };

type Establishment = { id: number; name: string; address: string; city: string; created_at: string; machine_count?: number };

type Assistant = {
  id: number; phone: string; first_name: string; last_name: string;
  role: string; establishment: number | null; establishment_name?: string | null;
  date_joined: string; is_active: boolean; is_staff: boolean;
};

type FinancialHistoryItem = {
  id: number; establishment_id: number; establishment_name: string;
  resource_label: string; booking_date: string; start_time: string; end_time: string;
  status: string; total_price: string;
  client: { id: number; phone: string; first_name: string; last_name: string; role: string };
  validated_by: { id: number; phone: string; first_name: string; last_name: string; role: string } | null;
  validated_at: string | null; created_at: string;
};

type SaturationStat = {
  establishment_id: number; establishment_name: string; active_resources: number;
  occupied_slots: number; total_week_slots: number; saturation_percentage: number;
  needs_more_resources: boolean;
};

type FinancialSummary = {
  today: { revenue: number; bookings_count: number };
  this_week: { revenue: number; bookings_count: number };
  this_month: { revenue: number; bookings_count: number };
  by_establishment: Array<{ id: number; name: string; revenue_today: number; revenue_week: number; revenue_month: number; bookings_today: number }>;
  hourly_frequency: Array<{ hour: string; count: number }>;
  daily_frequency: Array<{ day: string; count: number }>;
};

type SystemConfig = {
  default_slot_duration: number;
  bookings_paused: boolean;
  pause_reason: string;
};

type ModalMode = "create" | "edit";
type ActiveTab = "overview" | "establishments" | "assistants" | "history" | "stats" | "settings";

type EstablishmentFormState = { id?: number; name: string; address: string; city: string; machine_count: number };
type AssistantFormState = { id?: number; phone: string; first_name: string; last_name: string; establishment: string; secret_code: string };

/* ──────────────────────── SVG Icons ──────────────────────── */

const Icons = {
  home: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" /></svg>,
  building: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
  users: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" /></svg>,
  history: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>,
  chart: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  settings: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  logout: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  refresh: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
  plus: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>,
};

/* ──────────────────────── Main Component ──────────────────────── */

export function SuperAdminDashboardPage({ language }: SuperAdminDashboardPageProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isArabic = language === "ar";
  const session = getAuthSession();

  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [history, setHistory] = useState<FinancialHistoryItem[]>([]);
  const [stats, setStats] = useState<SaturationStat[]>([]);
  const [financials, setFinancials] = useState<FinancialSummary | null>(null);
  const [systemConfig, setSystemConfig] = useState<SystemConfig>({ default_slot_duration: 30, bookings_paused: false, pause_reason: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [historyPhoneSearch, setHistoryPhoneSearch] = useState("");
  const [historyEstablishmentFilter, setHistoryEstablishmentFilter] = useState("all");
  const [historyDateFilter, setHistoryDateFilter] = useState("");

  // Modals
  const [establishmentModalMode, setEstablishmentModalMode] = useState<ModalMode | null>(null);
  const [assistantModalMode, setAssistantModalMode] = useState<ModalMode | null>(null);
  const [establishmentForm, setEstablishmentForm] = useState<EstablishmentFormState>({ name: "", address: "", city: "", machine_count: 0 });
  const [assistantForm, setAssistantForm] = useState<AssistantFormState>({ phone: "", first_name: "", last_name: "", establishment: "", secret_code: "" });

  // Sidebar collapsed on mobile
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const refresh = useCallback(() => setRefreshCounter((v) => v + 1), []);

  /* ── Data Loading ── */
  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      setLoading(true);
      setError(null);

      try {
        const [estRes, mgrRes, histRes, statsRes, finRes, cfgRes] = await Promise.all([
          superAdminFetch("/api/superadmin/establishments/", { signal: controller.signal }),
          superAdminFetch("/api/superadmin/assistants/", { signal: controller.signal }),
          superAdminFetch("/api/superadmin/history/", { signal: controller.signal }),
          superAdminFetch("/api/superadmin/stats/", { signal: controller.signal }),
          superAdminFetch("/api/superadmin/financial-summary/", { signal: controller.signal }).catch(() => null),
          superAdminFetch("/api/superadmin/config/", { signal: controller.signal }).catch(() => null),
        ]);

        if (controller.signal.aborted) return;

        const [estData, mgrData, histData, statsData] = await Promise.all([
          safeJson<Establishment[]>(estRes),
          safeJson<Assistant[]>(mgrRes),
          safeJson<FinancialHistoryItem[]>(histRes),
          safeJson<{ results: SaturationStat[] }>(statsRes),
        ]);

        if (controller.signal.aborted) return;

        setEstablishments(estData ?? []);
        setAssistants(mgrData ?? []);
        setHistory(histData ?? []);
        setStats(statsData?.results ?? []);

        if (finRes) {
          const finData = await safeJson<FinancialSummary>(finRes);
          if (finData) setFinancials(finData);
        }

        if (cfgRes) {
          const cfgData = await safeJson<SystemConfig>(cfgRes);
          if (cfgData) setSystemConfig(cfgData);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadDashboard();
    return () => controller.abort();
  }, [refreshCounter]);

  /* ── Computed ── */
  const overviewMetrics = useMemo(() => {
    const totalRevenue = history.reduce((s, i) => s + Number(i.total_price || 0), 0);
    const saturatedCount = stats.filter((i) => Number(i.saturation_percentage) > 80).length;
    return { establishments: establishments.length, assistants: assistants.length, revenue: totalRevenue, saturatedCount };
  }, [establishments.length, history, assistants.length, stats]);

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const phoneMatch = !historyPhoneSearch.trim() || item.client.phone.includes(historyPhoneSearch.trim());
      const estMatch = historyEstablishmentFilter === "all" || String(item.establishment_id) === historyEstablishmentFilter;
      const dateMatch = !historyDateFilter || item.booking_date === historyDateFilter;
      return phoneMatch && estMatch && dateMatch;
    });
  }, [history, historyPhoneSearch, historyEstablishmentFilter, historyDateFilter]);

  const chartData = useMemo(() => {
    return stats.map((item) => ({
      name: item.establishment_name,
      saturation: Number(item.saturation_percentage),
      resources: item.active_resources,
    }));
  }, [stats]);

  /* ── CRUD Handlers ── */
  const openCreateEstablishment = () => { setEstablishmentForm({ name: "", address: "", city: "", machine_count: 0 }); setEstablishmentModalMode("create"); };
  const openEditEstablishment = (est: Establishment) => {
    setEstablishmentForm({
      id: est.id,
      name: est.name,
      address: est.address,
      city: est.city,
      machine_count: est.machine_count ?? 0,
    });
    setEstablishmentModalMode("edit");
  };

  const openCreateAssistant = () => {
    setAssistantForm({
      phone: "",
      first_name: "",
      last_name: "",
      establishment: establishments[0] ? String(establishments[0].id) : "",
      secret_code: "",
    });
    setAssistantModalMode("create");
  };

  const openEditAssistant = (mgr: Assistant) => {
    setAssistantForm({ id: mgr.id, phone: mgr.phone, first_name: mgr.first_name, last_name: mgr.last_name, establishment: mgr.establishment ? String(mgr.establishment) : "", secret_code: "" });
    setAssistantModalMode("edit");
  };

  const saveEstablishment = async () => {
    const payload = {
      name: establishmentForm.name.trim(),
      address: establishmentForm.address.trim(),
      city: establishmentForm.city.trim(),
      machine_count: Number(establishmentForm.machine_count || 0),
    };
    if (!payload.name || !payload.address || !payload.city) return;
    const endpoint = establishmentModalMode === "edit" && establishmentForm.id ? `/api/superadmin/establishments/${establishmentForm.id}/` : "/api/superadmin/establishments/";
    try {
      await superAdminFetch(endpoint, { method: establishmentModalMode === "edit" ? "PUT" : "POST", body: JSON.stringify(payload) });
      setEstablishmentModalMode(null);
      showSuccess(establishmentModalMode === "edit" ? t("save") : t("addEstablishment"));
      refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
  };

  const saveAssistant = async () => {
    const secretCode = assistantForm.secret_code.trim();
    if (assistantModalMode === "create" && !secretCode) {
      setError(t("secretCodeRequired"));
      return;
    }

    const payload: Record<string, unknown> = {
      phone: assistantForm.phone.trim(), first_name: assistantForm.first_name.trim(), last_name: assistantForm.last_name.trim(),
      establishment: Number(assistantForm.establishment), role: "ADMIN",
    };
    if (secretCode) payload.secret_code = secretCode;
    const endpoint = assistantModalMode === "edit" && assistantForm.id ? `/api/superadmin/assistants/${assistantForm.id}/` : "/api/superadmin/assistants/";
    try {
      await superAdminFetch(endpoint, { method: assistantModalMode === "edit" ? "PUT" : "POST", body: JSON.stringify(payload) });
      setAssistantModalMode(null);
      showSuccess(assistantModalMode === "edit" ? t("save") : t("addAssistant"));
      refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
  };

  const deleteEstablishment = async (id: number) => {
    if (!window.confirm(t("confirmDelete"))) return;
    await superAdminFetch(`/api/superadmin/establishments/${id}/`, { method: "DELETE" });
    refresh();
  };

  const deleteAssistant = async (id: number) => {
    if (!window.confirm(t("confirmDelete"))) return;
    await superAdminFetch(`/api/superadmin/assistants/${id}/`, { method: "DELETE" });
    refresh();
  };

  const resetAssistantPassword = (mgr: Assistant) => {
    if (
      !window.confirm(
        "Générer un nouveau code secret ? Il ne sera appliqué qu'après avoir cliqué sur Enregistrer."
      )
    ) {
      return;
    }
    const newCode = randomSecretCode();
    setAssistantForm({
      id: mgr.id,
      phone: mgr.phone,
      first_name: mgr.first_name,
      last_name: mgr.last_name,
      establishment: mgr.establishment ? String(mgr.establishment) : "",
      secret_code: newCode,
    });
    setAssistantModalMode("edit");
  };

  const saveSystemConfig = async () => {
    try {
      await superAdminFetch("/api/superadmin/config/", { method: "PUT", body: JSON.stringify(systemConfig) });
      showSuccess(t("configSaved"));
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
  };

  const handleLogout = () => { clearAuthSession(); navigate("/staff/login", { replace: true }); };

  const showSuccess = (msg: string) => { setSuccessMessage(msg); setTimeout(() => setSuccessMessage(null), 3000); };

  /* ── Sidebar Tabs Config ── */
  const tabs: Array<{ key: ActiveTab; label: string; icon: React.ReactNode }> = [
    { key: "overview", label: t("overview"), icon: Icons.home },
    { key: "establishments", label: t("establishments"), icon: Icons.building },
    { key: "assistants", label: t("assistants"), icon: Icons.users },
    { key: "history", label: t("auditTrail"), icon: Icons.history },
    { key: "stats", label: t("saturationStats"), icon: Icons.chart },
    { key: "settings", label: t("settingsTitle"), icon: Icons.settings },
  ];

  /* ──────────────────────── RENDER ──────────────────────── */
  return (
    <div dir={isArabic ? "rtl" : "ltr"} className="flex h-screen w-screen overflow-hidden bg-gradient-to-br from-slate-50 via-sky-50/30 to-white">
      {/* ── Sidebar ── */}
      <aside className={`
        fixed inset-y-0 z-40 flex w-72 flex-col bg-white/80 backdrop-blur-xl border-r border-sky-100/60
        shadow-[4px_0_30px_rgba(14,165,233,0.06)] transition-transform duration-300 lg:relative lg:translate-x-0
        ${isArabic ? "right-0 border-l border-r-0" : "left-0"}
        ${sidebarOpen ? "translate-x-0" : (isArabic ? "translate-x-full lg:translate-x-0" : "-translate-x-full lg:translate-x-0")}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-6 border-b border-sky-100/40">
          <img src={logoImg} alt="Logo" className="h-10 w-auto" />
          <div>
            <h1 className="text-lg font-black tracking-tight text-slate-900">Laverie de la residence</h1>
            <p className="text-[10px] font-semibold text-sky-600 uppercase tracking-[0.2em]">{t("superAdminRole")}</p>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setActiveTab(tab.key); setSidebarOpen(false); }}
              className={`
                w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200 cursor-pointer
                ${activeTab === tab.key
                  ? "bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-lg shadow-sky-200/50"
                  : "text-slate-600 hover:bg-sky-50 hover:text-slate-900"
                }
              `}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Bottom User + Logout */}
        <div className="border-t border-sky-100/40 px-4 py-4 space-y-3">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center text-white text-sm font-bold shadow">
              {session?.phone?.slice(-2) || "SA"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{session?.phone || "Super Admin"}</p>
              <p className="text-[10px] text-slate-400 font-medium">{t("superAdminRole")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl border border-rose-100 bg-rose-50/60 text-rose-600 text-sm font-semibold hover:bg-rose-100 transition cursor-pointer"
          >
            {Icons.logout}
            <span>{t("logout")}</span>
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-y-auto">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 bg-white/70 backdrop-blur-xl border-b border-sky-100/40 px-6 py-4">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setSidebarOpen(true)} className="lg:hidden rounded-xl p-2 bg-sky-50 text-sky-700 hover:bg-sky-100 transition cursor-pointer">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <div>
              <h2 className="text-xl font-bold text-slate-900">{tabs.find((t) => t.key === activeTab)?.label}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{t("superAdminDashboardSubtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={refresh} className="flex items-center gap-2 rounded-2xl border border-sky-100 bg-sky-50/60 px-4 py-2.5 text-sm font-semibold text-sky-700 hover:bg-sky-100 transition cursor-pointer">
              {Icons.refresh}
              <span className="hidden sm:inline">{t("refresh")}</span>
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in">
          {/* Success toast */}
          {successMessage && (
            <div className="fixed top-20 right-6 z-50 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700 shadow-lg animate-scale-in">
              ✅ {successMessage}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-32">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-full border-4 border-sky-200 border-t-sky-600 animate-spin" />
                <p className="text-sm font-semibold text-slate-400">{t("loading")}</p>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
              <p className="font-semibold">{error}</p>
              <button type="button" onClick={refresh} className="mt-3 rounded-2xl bg-rose-600 px-4 py-2 text-sm text-white font-semibold hover:bg-rose-700 transition cursor-pointer">{t("refresh")}</button>
            </div>
          ) : (
            <>
              {/* ──── OVERVIEW TAB ──── */}
              {activeTab === "overview" && (
                <div className="space-y-6">
                  {/* KPI Cards */}
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <KPICard icon="💰" label={t("revenueToday")} value={`${(financials?.today?.revenue ?? 0).toLocaleString()} DA`} tone="emerald" />
                    <KPICard icon="📊" label={t("revenueWeek")} value={`${(financials?.this_week?.revenue ?? 0).toLocaleString()} DA`} tone="sky" />
                    <KPICard icon="📈" label={t("revenueMonth")} value={`${(financials?.this_month?.revenue ?? 0).toLocaleString()} DA`} tone="blue" />
                    <KPICard icon="📋" label={t("bookingsMonth")} value={String(financials?.this_month?.bookings_count ?? history.length)} tone="cyan" />
                  </div>

                  {/* Saturation Alerts */}
                  {stats.filter((s) => s.needs_more_resources).map((s) => (
                    <div key={s.establishment_id} className="rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50 to-rose-50/50 p-4 flex items-center gap-4 animate-pulse">
                      <span className="text-2xl">⚠️</span>
                      <div>
                        <p className="font-bold text-rose-800">{t("criticalSaturation")} — {s.establishment_name}</p>
                        <p className="text-sm text-rose-600">{t("addMachinesHint")} ({Number(s.saturation_percentage).toFixed(1)}%)</p>
                      </div>
                    </div>
                  ))}

                  {/* Charts Row */}
                  <div className="grid gap-6 xl:grid-cols-2">
                    {/* Hourly frequency */}
                    <div className="rounded-[1.75rem] border border-sky-100 bg-white/90 backdrop-blur p-6 shadow-sm">
                      <h3 className="text-lg font-bold text-slate-900">{t("hourlyFrequency")}</h3>
                      <p className="text-xs text-slate-400 mt-1">{t("chartSubtitle")}</p>
                      <div className="mt-4 h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={financials?.hourly_frequency ?? []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e0f2fe" />
                            <XAxis dataKey="hour" tick={{ fill: "#64748b", fontSize: 11 }} />
                            <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
                            <Tooltip contentStyle={{ borderRadius: 16, borderColor: "#bae6fd", fontSize: 13 }} />
                            <Area type="monotone" dataKey="count" stroke="#0284c7" fill="url(#blueGradient)" strokeWidth={2.5} />
                            <defs>
                              <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Daily frequency */}
                    <div className="rounded-[1.75rem] border border-sky-100 bg-white/90 backdrop-blur p-6 shadow-sm">
                      <h3 className="text-lg font-bold text-slate-900">{t("dailyFrequency")}</h3>
                      <div className="mt-4 h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={financials?.daily_frequency ?? []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e0f2fe" />
                            <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 11 }} />
                            <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
                            <Tooltip contentStyle={{ borderRadius: 16, borderColor: "#bae6fd", fontSize: 13 }} />
                            <Bar dataKey="count" radius={[10, 10, 0, 0]} fill="#38bdf8" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Saturation Overview Chart */}
                  <div className="rounded-[1.75rem] border border-sky-100 bg-white/90 backdrop-blur p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">{t("weeklySaturation")}</h3>
                        <p className="text-xs text-slate-400 mt-1">{t("chartSubtitle")}</p>
                      </div>
                      <div className="flex gap-2">
                        <span className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-[11px] font-bold text-emerald-700">{t("stableBadge")}</span>
                        <span className="rounded-full bg-rose-50 border border-rose-200 px-3 py-1 text-[11px] font-bold text-rose-700">{t("saturatedBadge")}</span>
                      </div>
                    </div>
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e0f2fe" />
                          <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                          <YAxis tick={{ fill: "#64748b", fontSize: 11 }} domain={[0, 100]} />
                          <Tooltip contentStyle={{ borderRadius: 16, borderColor: "#bae6fd" }} formatter={(v: number) => [`${v.toFixed(1)}%`, t("occupancyRate")]} />
                          <Legend />
                          <Bar dataKey="saturation" name={t("occupancyRate")} radius={[10, 10, 0, 0]}>
                            {chartData.map((entry, idx) => (
                              <Cell key={`c-${idx}`} fill={entry.saturation > 80 ? "#f43f5e" : entry.saturation >= 35 ? "#0ea5e9" : "#38bdf8"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {/* ──── ESTABLISHMENTS TAB ──── */}
              {activeTab === "establishments" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900">{t("establishments")} ({establishments.length})</h3>
                    <button type="button" onClick={openCreateEstablishment} className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-200/50 hover:shadow-xl transition cursor-pointer">
                      {Icons.plus} {t("addEstablishment")}
                    </button>
                  </div>

                  {establishments.length === 0 ? (
                    <div className="rounded-3xl border border-sky-100 bg-sky-50/50 p-12 text-center text-slate-500">{t("noEstablishments")}</div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {establishments.map((est) => {
                        const stat = stats.find((s) => s.establishment_id === est.id);
                        const saturation = Number(stat?.saturation_percentage ?? 0);
                        return (
                          <div key={est.id} className="rounded-[1.5rem] border border-sky-100 bg-white/90 backdrop-blur p-5 shadow-sm hover:shadow-md transition-all duration-300 animate-fade-in-up">
                            <div className="flex items-start justify-between gap-3">
                              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-100 to-cyan-50 flex items-center justify-center text-sky-600 shadow-sm">
                                {Icons.building}
                              </div>
                              <SaturationBadge value={saturation} />
                            </div>
                            <h4 className="mt-3 text-base font-bold text-slate-900">{est.name}</h4>
                            <p className="text-xs text-slate-500 mt-1">{est.address}, {est.city}</p>

                            <div className="mt-4 grid grid-cols-3 gap-2">
                              <MiniStat label={t("machinesActive")} value={stat?.active_resources?.toString() ?? "0"} />
                              <MiniStat label={t("occupancyRate")} value={`${saturation.toFixed(0)}%`} />
                              <MiniStat label={t("createdOn")} value={formatDate(est.created_at, i18n.language)} />
                            </div>

                            <div className="mt-4 flex gap-2">
                              <button type="button" onClick={() => openEditEstablishment(est)} className="flex-1 rounded-xl bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 transition cursor-pointer">{t("edit")}</button>
                              <button type="button" onClick={() => deleteEstablishment(est.id)} className="flex-1 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition cursor-pointer">{t("delete")}</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ──── ASSISTANTS TAB ──── */}
              {activeTab === "assistants" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900">{t("assistants")} ({assistants.length})</h3>
                    <button type="button" onClick={openCreateAssistant} className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-200/50 hover:shadow-xl transition cursor-pointer">
                      {Icons.plus} {t("addAssistant")}
                    </button>
                  </div>

                  {assistants.length === 0 ? (
                    <div className="rounded-3xl border border-sky-100 bg-sky-50/50 p-12 text-center text-slate-500">{t("noAssistants")}</div>
                  ) : (
                    <div className="overflow-hidden rounded-[1.75rem] border border-sky-100 bg-white/90 backdrop-blur shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-gradient-to-r from-sky-50 to-cyan-50/50 text-sky-700">
                            <tr>
                              {[t("phoneNumber"), t("firstName"), t("lastName"), t("establishment"), t("edit"), t("resetPassword"), t("delete")].map((label) => (
                                <th key={label} className="px-5 py-4 font-semibold text-xs uppercase tracking-wider">{label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {assistants.map((assistant) => (
                              <tr key={assistant.id} className="hover:bg-sky-50/40 transition">
                                <td className="px-5 py-4 font-medium text-slate-900">{assistant.phone}</td>
                                <td className="px-5 py-4 text-slate-600">{assistant.first_name}</td>
                                <td className="px-5 py-4 text-slate-600">{assistant.last_name}</td>
                                <td className="px-5 py-4">
                                  <span className="inline-flex rounded-full bg-sky-50 border border-sky-200 px-3 py-1.5 text-xs font-bold text-sky-700">
                                    {assistant.establishment_name || assistant.establishment || "-"}
                                  </span>
                                </td>
                                <td className="px-5 py-4">
                                  <button type="button" onClick={() => openEditAssistant(assistant)} className="rounded-xl bg-sky-50 px-4 py-2 font-semibold text-sky-700 hover:bg-sky-100 text-xs transition cursor-pointer">{t("edit")}</button>
                                </td>
                                <td className="px-5 py-4">
                                  <button type="button" onClick={() => resetAssistantPassword(assistant)} className="rounded-xl bg-amber-50 px-4 py-2 font-semibold text-amber-700 hover:bg-amber-100 text-xs transition cursor-pointer">{t("resetPassword")}</button>
                                </td>
                                <td className="px-5 py-4">
                                  <button type="button" onClick={() => deleteAssistant(assistant.id)} className="rounded-xl bg-rose-50 px-4 py-2 font-semibold text-rose-700 hover:bg-rose-100 text-xs transition cursor-pointer">{t("delete")}</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ──── HISTORY / AUDIT TAB ──── */}
              {activeTab === "history" && (
                <div className="space-y-5">
                  {/* Filters */}
                  <div className="grid gap-4 md:grid-cols-3">
                    <FilterCard label={t("searchByPhone")}>
                      <input
                        value={historyPhoneSearch}
                        onChange={(e) => setHistoryPhoneSearch(e.target.value)}
                        className="w-full rounded-xl border border-sky-100 bg-sky-50/30 px-4 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition"
                        placeholder={t("clientPhoneSearch")}
                      />
                    </FilterCard>
                    <FilterCard label={t("filterByEstablishment")}>
                      <select
                        value={historyEstablishmentFilter}
                        onChange={(e) => setHistoryEstablishmentFilter(e.target.value)}
                        className="w-full rounded-xl border border-sky-100 bg-sky-50/30 px-4 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition"
                      >
                        <option value="all">{t("allEstablishments")}</option>
                        {establishments.map((est) => <option key={est.id} value={String(est.id)}>{est.name}</option>)}
                      </select>
                    </FilterCard>
                    <FilterCard label={t("dateFilter")}>
                      <input
                        type="date"
                        value={historyDateFilter}
                        onChange={(e) => setHistoryDateFilter(e.target.value)}
                        className="w-full rounded-xl border border-sky-100 bg-sky-50/30 px-4 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition"
                      />
                    </FilterCard>
                  </div>

                  {/* History List */}
                  <div className="space-y-3">
                    {filteredHistory.length === 0 ? (
                      <div className="rounded-3xl border border-sky-100 bg-sky-50/50 p-12 text-center text-slate-500">{t("noData")}</div>
                    ) : (
                      filteredHistory.map((item) => (
                        <div key={item.id} className="rounded-2xl border border-sky-100 bg-white/90 backdrop-blur p-5 shadow-sm hover:shadow-md transition-all animate-fade-in">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <p className="text-sm font-bold text-slate-900">
                                {item.client.first_name} {item.client.last_name}{" "}
                                <span className="text-slate-400 font-medium">({item.client.phone})</span>
                              </p>
                              <p className="text-sm text-slate-600 mt-1">
                                {t("transactionLine")} <span className="font-bold text-emerald-700">{item.total_price} DA</span> — {item.establishment_name}
                              </p>
                              {item.validated_by && (
                                <p className="text-xs text-slate-400 mt-2">
                                  {t("validatedByEmployee")} <span className="font-semibold text-slate-600">{item.validated_by.first_name} {item.validated_by.last_name}</span>
                                  {" "}{t("onDateTime")} {formatDateTime(item.validated_at || item.created_at, i18n.language)}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <StatusBadge status={item.status} />
                              <span className="text-[11px] text-slate-400">{formatDate(item.booking_date, i18n.language)}</span>
                              <span className="text-[11px] text-slate-400">{item.start_time} — {item.end_time}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* ──── STATS TAB ──── */}
              {activeTab === "stats" && (
                <div className="space-y-6">
                  <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-[1.75rem] border border-sky-100 bg-white/90 backdrop-blur p-6 shadow-sm">
                      <h3 className="text-lg font-bold text-slate-900">{t("weeklySaturation")}</h3>
                      <p className="text-xs text-slate-400 mt-1">{t("chartSubtitle")}</p>
                      <div className="mt-4 h-[360px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e0f2fe" />
                            <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} angle={-15} textAnchor="end" height={60} />
                            <YAxis tick={{ fill: "#64748b", fontSize: 11 }} domain={[0, 100]} />
                            <Tooltip contentStyle={{ borderRadius: 16, borderColor: "#bae6fd" }} formatter={(v: number) => [`${v.toFixed(1)}%`, t("occupancyRate")]} />
                            <Area type="monotone" dataKey="saturation" stroke="#0284c7" fill="url(#satGradient)" strokeWidth={2.5} />
                            <defs>
                              <linearGradient id="satGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {stats.map((item) => (
                        <div key={item.establishment_id} className="rounded-[1.5rem] border border-sky-100 bg-white/90 backdrop-blur p-5 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="text-base font-bold text-slate-900">{item.establishment_name}</h4>
                              <p className="text-xs text-slate-500 mt-1">{t("occupancyRate")}: {Number(item.saturation_percentage).toFixed(1)}%</p>
                            </div>
                            <SaturationBadge value={item.saturation_percentage} />
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-2">
                            <MiniStat label={t("activeResources")} value={item.active_resources.toString()} />
                            <MiniStat label={t("occupiedSlots")} value={item.occupied_slots.toString()} />
                            <MiniStat label={t("totalWeekSlots")} value={item.total_week_slots.toString()} />
                          </div>
                          {item.needs_more_resources && (
                            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 font-medium animate-pulse">
                              {t("criticalSaturation")} — {t("addMachinesHint")}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ──── SETTINGS TAB ──── */}
              {activeTab === "settings" && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <div className="rounded-[1.75rem] border border-sky-100 bg-white/90 backdrop-blur p-8 shadow-sm">
                    <h3 className="text-xl font-bold text-slate-900">{t("settingsTitle")}</h3>
                    <p className="text-sm text-slate-400 mt-1">{t("settingsSubtitle")}</p>

                    <div className="mt-8 space-y-6">
                      {/* Toggle Bookings */}
                      <div className="flex items-center justify-between gap-4 p-5 rounded-2xl border border-sky-100 bg-sky-50/30">
                        <div>
                          <p className="font-bold text-slate-900">{t("toggleBookings")}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {systemConfig.bookings_paused ? t("bookingsPaused") : t("bookingsActive")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSystemConfig((s) => ({ ...s, bookings_paused: !s.bookings_paused }))}
                          className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors cursor-pointer ${systemConfig.bookings_paused ? "bg-rose-500" : "bg-emerald-500"}`}
                        >
                          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${systemConfig.bookings_paused ? "translate-x-1" : "translate-x-8"}`} />
                        </button>
                      </div>

                      {/* Pause Reason */}
                      {systemConfig.bookings_paused && (
                        <div className="space-y-2 animate-fade-in">
                          <label className="block text-sm font-semibold text-slate-700">{t("pauseReason")}</label>
                          <input
                            value={systemConfig.pause_reason}
                            onChange={(e) => setSystemConfig((s) => ({ ...s, pause_reason: e.target.value }))}
                            placeholder={t("pauseReasonPlaceholder")}
                            className="w-full rounded-2xl border border-sky-100 bg-sky-50/30 px-4 py-3 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition"
                          />
                        </div>
                      )}

                      {/* Slot Duration */}
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-slate-700">{t("slotDuration")}</label>
                        <p className="text-xs text-slate-400">{t("slotDurationHint")}</p>
                        <div className="flex gap-3 mt-2">
                          {[15, 30, 60].map((dur) => (
                            <button
                              key={dur}
                              type="button"
                              onClick={() => setSystemConfig((s) => ({ ...s, default_slot_duration: dur }))}
                              className={`flex-1 rounded-2xl py-3 text-sm font-bold transition cursor-pointer ${
                                systemConfig.default_slot_duration === dur
                                  ? "bg-sky-600 text-white shadow-lg shadow-sky-200"
                                  : "border border-sky-100 bg-sky-50/50 text-slate-600 hover:bg-sky-100"
                              }`}
                            >
                              {dur} {t("minutes")}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Save */}
                      <button
                        type="button"
                        onClick={saveSystemConfig}
                        className="w-full rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-sky-200/50 hover:shadow-xl transition cursor-pointer"
                      >
                        {t("save")}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* ── Modals ── */}
      {establishmentModalMode && (
        <ModalShell title={establishmentModalMode === "create" ? t("addEstablishment") : t("edit")} onClose={() => setEstablishmentModalMode(null)}>
          <div className="grid gap-4">
            <TextInput label={t("name")} value={establishmentForm.name} onChange={(v) => setEstablishmentForm((s) => ({ ...s, name: v }))} placeholder="Laverie Centre" />
            <TextInput label={t("address")} value={establishmentForm.address} onChange={(v) => setEstablishmentForm((s) => ({ ...s, address: v }))} placeholder="Adresse" />
            <TextInput label={t("city")} value={establishmentForm.city} onChange={(v) => setEstablishmentForm((s) => ({ ...s, city: v }))} placeholder="Ville" />
            <TextInput label={t("resourceCount")} value={String(establishmentForm.machine_count)} onChange={(v) => setEstablishmentForm((s) => ({ ...s, machine_count: parseInt(v) || 0 }))} placeholder="0" />
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setEstablishmentModalMode(null)} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer">{t("cancel")}</button>
              <button type="button" onClick={saveEstablishment} className="rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-3 font-semibold text-white shadow-lg shadow-sky-200/50 transition cursor-pointer">{t("save")}</button>
            </div>
          </div>
        </ModalShell>
      )}

      {assistantModalMode && (
        <ModalShell title={assistantModalMode === "create" ? t("addAssistant") : t("edit")} onClose={() => setAssistantModalMode(null)}>
          <div className="grid gap-4">
            <TextInput label={t("phoneNumber")} value={assistantForm.phone} onChange={(v) => setAssistantForm((s) => ({ ...s, phone: v }))} placeholder="07XXXXXXXX" />
            <div className="grid gap-4 md:grid-cols-2">
              <TextInput label={t("firstName")} value={assistantForm.first_name} onChange={(v) => setAssistantForm((s) => ({ ...s, first_name: v }))} placeholder={t("firstName")} />
              <TextInput label={t("lastName")} value={assistantForm.last_name} onChange={(v) => setAssistantForm((s) => ({ ...s, last_name: v }))} placeholder={t("lastName")} />
            </div>
            <SelectInput
              label={t("changeEstablishment")}
              value={assistantForm.establishment}
              onChange={(v) => setAssistantForm((s) => ({ ...s, establishment: v }))}
              options={establishments.map((e) => ({ label: e.name, value: String(e.id) }))}
            />
            <div className="space-y-2">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <TextInput
                    label={t("newPassword")}
                    value={assistantForm.secret_code}
                    onChange={(v) => setAssistantForm((s) => ({ ...s, secret_code: v }))}
                    placeholder="6 chiffres"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setAssistantForm((s) => ({ ...s, secret_code: randomSecretCode() }))
                  }
                  className="mb-0.5 shrink-0 rounded-2xl border border-slate-200 bg-slate-900 px-4 py-3 text-xs font-bold text-white transition hover:bg-slate-800 cursor-pointer"
                >
                  {t("generateCode")}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                {assistantModalMode === "edit"
                  ? "Laissez vide pour garder le code actuel. Remplissez ou générez un code puis Enregistrer pour le changer."
                  : "Saisissez le code souhaité (ex. 000000) ou cliquez sur Générer."}
              </p>
            </div>
            {assistantForm.secret_code && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                {t("newCodeGenerated")}: <span className="font-bold tracking-widest">{assistantForm.secret_code}</span>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setAssistantModalMode(null)} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer">{t("cancel")}</button>
              <button type="button" onClick={saveAssistant} className="rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-3 font-semibold text-white shadow-lg shadow-sky-200/50 transition cursor-pointer">{t("save")}</button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

/* ──────────────────────── Helpers ──────────────────────── */

function superAdminFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");

  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("laverie-de-la-residence-access-token") || window.localStorage.getItem("laverie-de-la-residence-superadmin-token");
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(path, { ...options, headers, credentials: "include" }).then(async (response) => {
    if (!response.ok) {
      const payload = await readApiErrorPayload(response);
      throw new Error(
        resolveApiErrorMessage(payload, "superAdmin", i18n.t.bind(i18n), {
          status: response.status,
        })
      );
    }
    return response;
  });
}

async function safeJson<T = unknown>(response: Response): Promise<T | null> {
  try { return (await response.json()) as T; } catch { return null; }
}

function randomSecretCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function formatDate(value: string, locale: string) {
  return new Date(value).toLocaleDateString(locale, { year: "numeric", month: "short", day: "2-digit" });
}

function formatDateTime(value: string, locale: string) {
  return new Date(value).toLocaleString(locale, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/* ──────────────────────── Sub-Components ──────────────────────── */

function KPICard({ icon, label, value, tone }: { icon: string; label: string; value: string; tone: "sky" | "blue" | "cyan" | "emerald" }) {
  const bgMap = { sky: "from-sky-500 to-sky-600", blue: "from-blue-500 to-blue-600", cyan: "from-cyan-500 to-cyan-600", emerald: "from-emerald-500 to-emerald-600" };
  return (
    <div className={`rounded-[1.5rem] bg-gradient-to-br ${bgMap[tone]} p-5 text-white shadow-lg animate-fade-in-up`}>
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        <span className="rounded-full bg-white/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-4 text-3xl font-black tracking-tight">{value}</p>
      <p className="mt-1 text-xs opacity-80">{label}</p>
    </div>
  );
}

function SaturationBadge({ value }: { value: number | string }) {
  const numVal = Number(value || 0);
  if (numVal > 80) return <span className="inline-flex rounded-full bg-rose-100 border border-rose-200 px-3 py-1.5 text-[11px] font-bold text-rose-700 animate-pulse">⚠️ {numVal.toFixed(0)}%</span>;
  if (numVal >= 35) return <span className="inline-flex rounded-full bg-emerald-100 border border-emerald-200 px-3 py-1.5 text-[11px] font-bold text-emerald-700">{numVal.toFixed(0)}%</span>;
  return <span className="inline-flex rounded-full bg-sky-100 border border-sky-200 px-3 py-1.5 text-[11px] font-bold text-sky-700">{numVal.toFixed(0)}%</span>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PAYE: "bg-emerald-100 text-emerald-700 border-emerald-200",
    EN_ATTENTE: "bg-amber-100 text-amber-700 border-amber-200",
    ANNULE: "bg-rose-100 text-rose-700 border-rose-200",
  };
  const labelMap: Record<string, string> = { PAYE: "Payé", EN_ATTENTE: "En attente", ANNULE: "Annulé" };
  return <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold ${map[status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>{labelMap[status] || status}</span>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-2.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400 truncate">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}

function FilterCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[1.5rem] border border-sky-100 bg-white/90 backdrop-blur p-4 shadow-sm">
      <label className="block text-xs font-bold text-slate-700 mb-2">{label}</label>
      {children}
    </div>
  );
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl rounded-[2rem] border border-sky-100 bg-white shadow-[0_30px_90px_rgba(14,165,233,0.22)] animate-scale-in">
        <div className="flex items-center justify-between gap-4 border-b border-sky-100 px-6 py-5">
          <h3 className="text-xl font-bold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-full bg-sky-50 px-3 py-1.5 font-bold text-sky-700 hover:bg-sky-100 transition cursor-pointer">✕</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-sky-100 bg-sky-50/40 px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 text-sm" />
    </label>
  );
}

function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ label: string; value: string }> }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-sky-100 bg-sky-50/40 px-4 py-3 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 text-sm">
        <option value="">--</option>
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </label>
  );
}