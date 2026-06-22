import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

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
import { setManagedEstablishment } from "../auth/managedEstablishment";
import logoImg from "../assets/logo.png";

/* ──────────────────────── Types ──────────────────────── */

type SuperAdminDashboardPageProps = { language: "fr" | "ar" };

type AssignedMode = { mode: number; nom: string; duree: number; prix_base: string | number; prix_specifique: string | number | null; prix_effectif: string | number; recommande?: boolean };
type Establishment = { id: number; name: string; address: string; city: string; created_at: string; machine_count?: number; opening_time?: string; closing_time?: string; assigned_modes?: AssignedMode[] };

type Assistant = {
  id: number; phone: string; first_name: string; last_name: string;
  role: string; establishment: number | null; establishment_name?: string | null;
  date_joined: string; is_active: boolean; is_staff: boolean;
};

type FinancialHistoryItem = {
  id: number; booking_reference?: string; establishment_id: number; establishment_name: string;
  resource_label: string; booking_date: string; start_time: string; end_time: string;
  status: string; payment_method?: "CASH" | "BARIDIMOB" | null; total_price: string;
  client: { id: number; phone: string; first_name: string; last_name: string; role: string };
  validated_by: { id: number; phone: string; first_name: string; last_name: string; role: string } | null;
  validated_at: string | null; created_at: string;
};

type HistoryKind = "all" | "cash" | "baridimob" | "reservation" | "cancellation" | "maintenance";

type SaturationStat = {
  establishment_id: number; establishment_name: string; active_resources: number;
  occupied_slots: number; total_week_slots: number; saturation_percentage: number;
  needs_more_resources: boolean;
};

type FinancialSummary = {
  today: { revenue: number; bookings_count: number; pending_count?: number };
  this_week: { revenue: number; bookings_count: number };
  this_month: { revenue: number; bookings_count: number };
  by_establishment: Array<{
    id: number; name: string;
    revenue_today: number; revenue_week: number; revenue_month: number;
    bookings_today: number; pending_today?: number; paid_today?: number;
  }>;
  hourly_frequency: Array<{ hour: string; count: number }>;
  daily_frequency: Array<{ day: string; count: number }>;
};

type SystemConfig = {
  default_slot_duration: number;
  bookings_paused: boolean;
  pause_reason: string;
};

type ModalMode = "create" | "edit";
type ActiveTab = "overview" | "modes" | "establishments" | "assistants" | "history" | "settings";

type Mode = {
  id: number;
  nom: string;
  nom_ar?: string;
  duree: number;
  prix_base: string | number;
  capacite_max: string | number;
  types_vetements: string[];
  types_vetements_ar?: string[];
  message_guide: string;
  message_guide_ar?: string;
  textiles_interdits?: string[];
  textiles_interdits_ar?: string[];
  consigne_securite?: string;
  consigne_securite_ar?: string;
  establishment_count?: number;
  created_at?: string;
};

type ModeFormState = {
  id?: number;
  nom: string;
  nom_ar: string;
  duree: string;
  prix_base: string;
  capacite_max: string;
  types_vetements: string; // saisie séparée par des virgules
  types_vetements_ar: string;
  message_guide: string;
  message_guide_ar: string;
  textiles_interdits: string; // saisie séparée par des virgules
  textiles_interdits_ar: string;
  consigne_securite: string;
  consigne_securite_ar: string;
};

type ModeAssignment = { checked: boolean; price: string; recommande: boolean };
type EstablishmentFormState = {
  id?: number; name: string; address: string; city: string; machine_count: number;
  opening_time: string; closing_time: string;
  // Modes attribués à cet établissement (clé = id du mode)
  modeAssignments: Record<number, ModeAssignment>;
  // Assistants rattachés à cet établissement
  assistantIds: number[];
  // Optional first assistant when creating
  withAssistant: boolean;
  assistantFirstName: string; assistantLastName: string;
  assistantPhone: string; assistantSecretCode: string;
};
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
  washingMachine: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3h14a1 1 0 011 1v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" /><path strokeLinecap="round" strokeLinejoin="round" d="M7 6h.01M10 6h.01" /><circle cx="12" cy="14" r="4.5" /><path strokeLinecap="round" strokeLinejoin="round" d="M9.7 13.2c.7-.6 1.6-.6 2.3 0 .7.6 1.6.6 2.3 0" /></svg>,
  plus: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>,
};

/* ──────────────────────── Main Component ──────────────────────── */

export function SuperAdminDashboardPage({ language }: SuperAdminDashboardPageProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isArabic = language === "ar";
  const session = getAuthSession();

  // ── Tab ↔ URL mapping ──
  const TAB_PATHS: Record<ActiveTab, string> = {
    overview:       "/superadmin/dashboard",
    modes:          "/superadmin/modes",
    establishments: "/superadmin/establishments",
    assistants:     "/superadmin/assistants",
    history:        "/superadmin/history",
    settings:       "/superadmin/settings",
  };
  const activeTab: ActiveTab =
    (Object.entries(TAB_PATHS).find(([, p]) =>
      location.pathname === p || location.pathname.startsWith(p + "/")
    )?.[0] as ActiveTab) ?? "overview";
  const goToTab = (tab: ActiveTab) => { navigate(TAB_PATHS[tab]); setSidebarOpen(false); };

  // Detail view: assistant id from URL
  const assistantDetailId = location.pathname.startsWith("/superadmin/assistants/")
    ? Number(location.pathname.split("/superadmin/assistants/")[1]) || null
    : null;
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [modes, setModes] = useState<Mode[]>([]);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [history, setHistory] = useState<FinancialHistoryItem[]>([]);
  const [stats, setStats] = useState<SaturationStat[]>([]);
  const [financials, setFinancials] = useState<FinancialSummary | null>(null);
  const [systemConfig, setSystemConfig] = useState<SystemConfig>({ default_slot_duration: 30, bookings_paused: false, pause_reason: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Overview establishment filter (null = all)
  const [overviewEstFilter, setOverviewEstFilter] = useState<number | null>(null);
  const [estPickerOpen, setEstPickerOpen] = useState(false);
  const [estPickerSearch, setEstPickerSearch] = useState("");

  // Filters
  const [estSearchQuery, setEstSearchQuery] = useState("");
  // Settings — super admin management
  const [superAdmins, setSuperAdmins] = useState<Assistant[]>([]);
  const [saForm, setSaForm] = useState({ first_name: "", last_name: "", phone: "", secret_code: "" });
  const [savingSa, setSavingSa] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const [assistantSearch, setAssistantSearch] = useState("");
  const [assistantEstFilter, setAssistantEstFilter] = useState<string>("all");
  const [assistantHistoryFilter, setAssistantHistoryFilter] = useState<"all"|"cash"|"baridimob"|"reservation"|"cancellation"|"maintenance">("all");
  const [assistantHistorySearch, setAssistantHistorySearch] = useState("");
  const [historyPhoneSearch, setHistoryPhoneSearch] = useState("");
  const [historyEstablishmentFilter, setHistoryEstablishmentFilter] = useState("all");
  const [historyDateFilter, setHistoryDateFilter] = useState("");
  const [historyKind, setHistoryKind] = useState<HistoryKind>("all");

  // Modes
  const [modeSearch, setModeSearch] = useState("");
  const [modeModalMode, setModeModalMode] = useState<ModalMode | null>(null);
  const [modeForm, setModeForm] = useState<ModeFormState>({ nom: "", nom_ar: "", duree: "", prix_base: "", capacite_max: "", types_vetements: "", types_vetements_ar: "", message_guide: "", message_guide_ar: "", textiles_interdits: "", textiles_interdits_ar: "", consigne_securite: "", consigne_securite_ar: "" });
  const [savingMode, setSavingMode] = useState(false);

  // Modals
  const [establishmentModalMode, setEstablishmentModalMode] = useState<ModalMode | null>(null);
  const [assistantModalMode, setAssistantModalMode] = useState<ModalMode | null>(null);
  const [establishmentForm, setEstablishmentForm] = useState<EstablishmentFormState>({ name: "", address: "", city: "", machine_count: 0, opening_time: "08:00", closing_time: "22:00", modeAssignments: {}, assistantIds: [], withAssistant: false, assistantFirstName: "", assistantLastName: "", assistantPhone: "", assistantSecretCode: "" });
  // Recherche dans les dropdowns d'affectation (modes & assistants) du modal établissement
  const [modeAssignSearch, setModeAssignSearch] = useState("");
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const [assistantAssignSearch, setAssistantAssignSearch] = useState("");
  const [assistantDropdownOpen, setAssistantDropdownOpen] = useState(false);
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
        const [estRes, modesRes, mgrRes, histRes, statsRes, finRes, cfgRes, saRes] = await Promise.all([
          superAdminFetch("/api/superadmin/establishments/", { signal: controller.signal }),
          superAdminFetch("/api/superadmin/modes/", { signal: controller.signal }).catch(() => null),
          superAdminFetch("/api/superadmin/assistants/", { signal: controller.signal }),
          superAdminFetch("/api/superadmin/history/", { signal: controller.signal }),
          superAdminFetch("/api/superadmin/stats/", { signal: controller.signal }),
          superAdminFetch("/api/superadmin/financial-summary/", { signal: controller.signal }).catch(() => null),
          superAdminFetch("/api/superadmin/config/", { signal: controller.signal }).catch(() => null),
          superAdminFetch("/api/superadmin/super-admins/", { signal: controller.signal }).catch(() => null),
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
        if (modesRes) { const modesData = await safeJson<Mode[]>(modesRes); if (modesData) setModes(modesData); }
        setAssistants(mgrData ?? []);
        setHistory(histData ?? []);
        setStats(statsData?.results ?? []);
        if (saRes) { const saData = await safeJson<Assistant[]>(saRes); if (saData) setSuperAdmins(saData); }

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
    // Seuls les rendez-vous validés (payés) comptent dans le revenu total.
    const totalRevenue = history.filter((i) => i.status === "PAYE").reduce((s, i) => s + Number(i.total_price || 0), 0);
    const saturatedCount = stats.filter((i) => Number(i.saturation_percentage) > 80).length;
    return { establishments: establishments.length, assistants: assistants.length, revenue: totalRevenue, saturatedCount };
  }, [establishments.length, history, assistants.length, stats]);

  // Un rendez-vous n'apparaît dans le journal qu'une fois VALIDÉ (payé).
  // - PAYE : affiché (transaction réelle)
  // - ANNULE : affiché uniquement s'il avait été validé avant l'annulation
  // - EN_ATTENTE : jamais affiché
  // - MAINTENANCE : événement opérationnel, conservé
  const isAuditable = (item: FinancialHistoryItem) =>
    item.status === "PAYE" ||
    item.status === "MAINTENANCE";

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      if (!isAuditable(item)) return false;
      const phoneMatch = !historyPhoneSearch.trim() || (item.client?.phone ?? "").includes(historyPhoneSearch.trim());
      const estMatch = historyEstablishmentFilter === "all" || String(item.establishment_id) === historyEstablishmentFilter;
      const dateMatch = !historyDateFilter || item.booking_date === historyDateFilter;
      let kindMatch = true;
      if (historyKind === "cash") kindMatch = item.status === "PAYE" && item.payment_method === "CASH";
      else if (historyKind === "baridimob") kindMatch = item.status === "PAYE" && item.payment_method === "BARIDIMOB";
      else if (historyKind === "cancellation") kindMatch = item.status === "ANNULE";
      else if (historyKind === "maintenance") kindMatch = item.status === "MAINTENANCE";
      return phoneMatch && estMatch && dateMatch && kindMatch;
    });
  }, [history, historyPhoneSearch, historyEstablishmentFilter, historyDateFilter, historyKind]);

  const historyKindCounts = useMemo(() => {
    const base = history.filter((item) => {
      if (!isAuditable(item)) return false;
      const phoneMatch = !historyPhoneSearch.trim() || (item.client?.phone ?? "").includes(historyPhoneSearch.trim());
      const estMatch = historyEstablishmentFilter === "all" || String(item.establishment_id) === historyEstablishmentFilter;
      const dateMatch = !historyDateFilter || item.booking_date === historyDateFilter;
      return phoneMatch && estMatch && dateMatch;
    });
    return {
      all: base.length,
      cash: base.filter((i) => i.status === "PAYE" && i.payment_method === "CASH").length,
      baridimob: base.filter((i) => i.status === "PAYE" && i.payment_method === "BARIDIMOB").length,
      reservation: 0,
      cancellation: base.filter((i) => i.status === "ANNULE").length,
      maintenance: base.filter((i) => i.status === "MAINTENANCE").length,
    } as Record<HistoryKind, number>;
  }, [history, historyPhoneSearch, historyEstablishmentFilter, historyDateFilter]);


  // Filtered financials for the selected establishment
  const filteredFinancials = useMemo(() => {
    if (overviewEstFilter === null) return financials;
    const est = financials?.by_establishment?.find((e) => e.id === overviewEstFilter);
    if (!est) return null;
    return {
      today:      { revenue: est.revenue_today,  bookings_count: est.bookings_today, pending_count: (est as any).pending_today ?? 0 },
      this_week:  { revenue: est.revenue_week,   bookings_count: 0 },
      this_month: { revenue: est.revenue_month,  bookings_count: 0 },
      by_establishment: financials?.by_establishment ?? [],
      hourly_frequency: financials?.hourly_frequency ?? [],
      daily_frequency:  financials?.daily_frequency  ?? [],
    } as FinancialSummary;
  }, [financials, overviewEstFilter]);

  const filteredSaturation = useMemo(() => {
    if (overviewEstFilter === null) return stats;
    return stats.filter((s) => s.establishment_id === overviewEstFilter);
  }, [stats, overviewEstFilter]);

  /* ── CRUD Handlers ── */
  const openCreateEstablishment = () => { setModeAssignSearch(""); setAssistantAssignSearch(""); setModeDropdownOpen(false); setAssistantDropdownOpen(false); setEstablishmentForm({ name: "", address: "", city: "", machine_count: 0, opening_time: "08:00", closing_time: "22:00", modeAssignments: {}, assistantIds: [], withAssistant: false, assistantFirstName: "", assistantLastName: "", assistantPhone: "", assistantSecretCode: "" }); setEstablishmentModalMode("create"); };
  const openEditEstablishment = (est: Establishment) => {
    const modeAssignments: Record<number, ModeAssignment> = {};
    (est.assigned_modes ?? []).forEach((am) => {
      modeAssignments[am.mode] = {
        checked: true,
        price: String(am.prix_specifique ?? am.prix_effectif ?? am.prix_base ?? ""),
        recommande: Boolean(am.recommande),
      };
    });
    const assistantIds = assistants.filter((a) => a.establishment === est.id).map((a) => a.id);
    setModeAssignSearch(""); setAssistantAssignSearch(""); setModeDropdownOpen(false); setAssistantDropdownOpen(false);
    setEstablishmentForm({
      id: est.id, name: est.name, address: est.address, city: est.city,
      machine_count: est.machine_count ?? 0,
      opening_time: (est.opening_time ?? "08:00").slice(0, 5),
      closing_time: (est.closing_time ?? "22:00").slice(0, 5),
      modeAssignments,
      assistantIds,
      withAssistant: false, assistantFirstName: "", assistantLastName: "", assistantPhone: "", assistantSecretCode: "",
    });
    setEstablishmentModalMode("edit");
  };

  /* ── Mode handlers ── */
  const openCreateMode = () => {
    setModeForm({ nom: "", nom_ar: "", duree: "", prix_base: "", capacite_max: "", types_vetements: "", types_vetements_ar: "", message_guide: "", message_guide_ar: "", textiles_interdits: "", textiles_interdits_ar: "", consigne_securite: "", consigne_securite_ar: "" });
    setModeModalMode("create");
  };

  const openEditMode = (mode: Mode) => {
    setModeForm({
      id: mode.id,
      nom: mode.nom,
      nom_ar: mode.nom_ar ?? "",
      duree: String(mode.duree ?? ""),
      prix_base: String(mode.prix_base ?? ""),
      capacite_max: String(mode.capacite_max ?? ""),
      types_vetements: Array.isArray(mode.types_vetements) ? mode.types_vetements.join(", ") : "",
      types_vetements_ar: Array.isArray(mode.types_vetements_ar) ? mode.types_vetements_ar.join("، ") : "",
      message_guide: mode.message_guide ?? "",
      message_guide_ar: mode.message_guide_ar ?? "",
      textiles_interdits: Array.isArray(mode.textiles_interdits) ? mode.textiles_interdits.join(", ") : "",
      textiles_interdits_ar: Array.isArray(mode.textiles_interdits_ar) ? mode.textiles_interdits_ar.join("، ") : "",
      consigne_securite: mode.consigne_securite ?? "",
      consigne_securite_ar: mode.consigne_securite_ar ?? "",
    });
    setModeModalMode("edit");
  };

  const saveMode = async () => {
    const nom = modeForm.nom.trim();
    const duree = parseInt(modeForm.duree, 10);
    if (!nom) { showError(t("modeNameRequired")); return; }
    if (!duree || duree <= 0) { showError(t("modeDurationRequired")); return; }

    const splitList = (raw: string) =>
      raw.split(/[,،]/).map((v) => v.trim()).filter(Boolean);

    const payload = {
      nom,
      nom_ar: modeForm.nom_ar.trim(),
      duree,
      prix_base: Number(modeForm.prix_base || 0),
      capacite_max: Number(modeForm.capacite_max || 0),
      types_vetements: splitList(modeForm.types_vetements),
      types_vetements_ar: splitList(modeForm.types_vetements_ar),
      message_guide: modeForm.message_guide.trim(),
      message_guide_ar: modeForm.message_guide_ar.trim(),
      textiles_interdits: splitList(modeForm.textiles_interdits),
      textiles_interdits_ar: splitList(modeForm.textiles_interdits_ar),
      consigne_securite: modeForm.consigne_securite.trim(),
      consigne_securite_ar: modeForm.consigne_securite_ar.trim(),
    };
    const endpoint = modeModalMode === "edit" && modeForm.id
      ? `/api/superadmin/modes/${modeForm.id}/`
      : "/api/superadmin/modes/";
    setSavingMode(true);
    try {
      await superAdminFetch(endpoint, { method: modeModalMode === "edit" ? "PUT" : "POST", body: JSON.stringify(payload) });
      setModeModalMode(null);
      showSuccess(modeModalMode === "edit" ? t("modeUpdated") : t("modeCreated"));
      refresh();
    } catch (e) { showError(e instanceof Error ? e.message : "Erreur"); }
    finally { setSavingMode(false); }
  };

  const deleteMode = async (mode: Mode) => {
    if (!window.confirm(t("confirmDeleteMode", { name: mode.nom }))) return;
    try {
      await superAdminFetch(`/api/superadmin/modes/${mode.id}/`, { method: "DELETE" });
      setModes((prev) => prev.filter((m) => m.id !== mode.id));
      showSuccess(t("modeDeleted"));
    } catch (e) { showError(e instanceof Error ? e.message : "Erreur"); }
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
    const modesPayload = Object.entries(establishmentForm.modeAssignments)
      .filter(([, v]) => v.checked)
      .map(([id, v]) => ({
        mode: Number(id),
        prix_specifique: v.price.trim() === "" ? null : Number(v.price),
        recommande: Boolean(v.recommande),
      }));
    const payload = {
      name: establishmentForm.name.trim(),
      address: establishmentForm.address.trim(),
      city: establishmentForm.city.trim(),
      machine_count: Number(establishmentForm.machine_count || 0),
      opening_time: establishmentForm.opening_time,
      closing_time: establishmentForm.closing_time,
      modes: modesPayload,
      assistant_ids: establishmentForm.assistantIds,
    };
    if (!payload.name || !payload.address || !payload.city) return;
    // 00:00 = minuit (fin de journée) est accepté
    if (payload.closing_time !== "00:00" && payload.opening_time >= payload.closing_time) { showError("L'heure de fermeture doit être après l'heure d'ouverture."); return; }
    const endpoint = establishmentModalMode === "edit" && establishmentForm.id
      ? `/api/superadmin/establishments/${establishmentForm.id}/`
      : "/api/superadmin/establishments/";
    try {
      const res = await superAdminFetch(endpoint, { method: establishmentModalMode === "edit" ? "PUT" : "POST", body: JSON.stringify(payload) });
      const created = await safeJson<Establishment>(res);

      // Optionally create an assistant linked to the new establishment
      if (establishmentModalMode === "create" && establishmentForm.withAssistant && establishmentForm.assistantPhone.trim() && establishmentForm.assistantSecretCode.trim() && created?.id) {
        const assistantPayload = {
          first_name: establishmentForm.assistantFirstName.trim(),
          last_name: establishmentForm.assistantLastName.trim(),
          phone: establishmentForm.assistantPhone.trim(),
          secret_code: establishmentForm.assistantSecretCode.trim(),
          establishment: created.id,
          role: "ADMIN",
        };
        await superAdminFetch("/api/superadmin/assistants/", { method: "POST", body: JSON.stringify(assistantPayload) });
      }

      setEstablishmentModalMode(null);
      showSuccess(establishmentModalMode === "edit" ? "Établissement mis à jour." : "Établissement créé avec succès !");
      refresh();
    } catch (e) { showError(e instanceof Error ? e.message : "Erreur"); }
  };

  const saveAssistant = async () => {
    const secretCode = assistantForm.secret_code.trim();
    if (assistantModalMode === "create" && !secretCode) {
      showError(t("secretCodeRequired"));
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
    } catch (e) { showError(e instanceof Error ? e.message : "Erreur"); }
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
    setSavingConfig(true);
    try {
      await superAdminFetch("/api/superadmin/config/", { method: "PUT", body: JSON.stringify(systemConfig) });
      showSuccess("Configuration enregistrée.");
    } catch (e) { showError(e instanceof Error ? e.message : "Erreur"); }
    finally { setSavingConfig(false); }
  };

  const createSuperAdmin = async () => {
    if (!saForm.phone.trim() || !saForm.secret_code.trim()) return;
    setSavingSa(true);
    try {
      await superAdminFetch("/api/superadmin/super-admins/", {
        method: "POST",
        body: JSON.stringify({ ...saForm, role: "SUPER_ADMIN" }),
      });
      setSaForm({ first_name: "", last_name: "", phone: "", secret_code: "" });
      showSuccess("Super admin créé avec succès.");
      const res = await superAdminFetch("/api/superadmin/super-admins/");
      const data = await safeJson<Assistant[]>(res);
      if (data) setSuperAdmins(data);
    } catch (e) { showError(e instanceof Error ? e.message : "Erreur"); }
    finally { setSavingSa(false); }
  };

  const deleteSuperAdmin = async (id: number) => {
    if (!window.confirm("Supprimer ce super admin ?")) return;
    try {
      await superAdminFetch(`/api/superadmin/super-admins/${id}/`, { method: "DELETE" });
      setSuperAdmins((prev) => prev.filter((sa) => sa.id !== id));
      showSuccess("Super admin supprimé.");
    } catch (e) { showError(e instanceof Error ? e.message : "Erreur"); }
  };

  const handleLogout = () => { clearAuthSession(); navigate("/staff/login", { replace: true }); };

  const showSuccess = (msg: string) => { setSuccessMessage(msg); setTimeout(() => setSuccessMessage(null), 3000); };
  const showError = (msg: string) => { setErrorMessage(msg); setTimeout(() => setErrorMessage(null), 4000); };

  /* ── Sidebar Tabs Config ── */
  const tabs: Array<{ key: ActiveTab; label: string; icon: React.ReactNode }> = [
    { key: "overview", label: t("overview"), icon: Icons.home },
    { key: "modes", label: t("modes"), icon: Icons.washingMachine },
    { key: "establishments", label: t("establishments"), icon: Icons.building },
    { key: "assistants", label: t("assistants"), icon: Icons.users },
    { key: "history", label: t("auditTrail"), icon: Icons.history },
    { key: "settings", label: t("settingsTitle"), icon: Icons.settings },
  ];

  /* ──────────────────────── RENDER ──────────────────────── */
  return (
    <div dir={isArabic ? "rtl" : "ltr"} className="flex h-screen w-screen overflow-hidden bg-gradient-to-br from-slate-50 via-sky-50/30 to-white">
      {/* ── Sidebar ── */}
      <aside className={`
        fixed inset-y-0 z-40 flex w-72 flex-col bg-white/80 backdrop-blur-xl border-r border-sky-100/40
        shadow-[4px_0_40px_rgba(14,165,233,0.06)] transition-all duration-300 transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0
        ${isArabic ? "right-0 border-l border-r-0" : "left-0"}
        ${sidebarOpen ? "translate-x-0" : (isArabic ? "translate-x-full lg:translate-x-0" : "-translate-x-full lg:translate-x-0")}
      `}>
        {/* Top accent line */}
        <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-sky-400 via-indigo-500 to-cyan-500" />

        {/* Logo / Brand */}
        <div className="flex items-center gap-3 px-6 py-6 border-b border-sky-100/40 relative">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-sky-50 flex items-center justify-center border border-sky-100/50 shadow-inner">
            <img src={logoImg} alt="Logo" className="h-7 w-auto" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black tracking-tight text-slate-900 leading-tight truncate">Laverie de la résidence</h1>
            <p className="text-[9px] font-black text-sky-600 uppercase tracking-[0.18em] mt-0.5">Super Administrateur</p>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1.5">
          {tabs.map((tab, idx) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => goToTab(tab.key)}
                style={{ animationDelay: `${(idx + 1) * 55}ms` }}
                className={`
                  group w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-xs font-black tracking-wide
                  transition-all duration-300 transform will-change-transform cursor-pointer animate-fade-in-up
                  ${isActive
                    ? "bg-gradient-to-r from-sky-500 via-indigo-500 to-cyan-500 text-white shadow-[0_12px_25px_rgba(14,165,233,0.22)] scale-[1.02]"
                    : "text-slate-500 hover:bg-sky-50/70 hover:text-slate-900 hover:translate-x-1"
                  }
                `}
              >
                <span className={`
                  flex items-center justify-center shrink-0 w-8 h-8 rounded-xl transition-all duration-300
                  ${isActive
                    ? "bg-white/20 text-white"
                    : "bg-slate-50 text-slate-400 group-hover:bg-sky-100/50 group-hover:text-sky-500"
                  }
                `}>
                  <span className="transition-transform duration-300 group-hover:scale-110">
                    {tab.icon}
                  </span>
                </span>
                <span className="truncate">{tab.label}</span>
                {isActive && (
                  <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom User + Logout */}
        <div className="border-t border-sky-100/40 p-4 space-y-3 bg-slate-50/40">
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 via-sky-500 to-indigo-500 flex items-center justify-center text-white text-sm font-black shadow-md shadow-sky-500/20">
                {session?.firstName?.[0] || session?.lastName?.[0]
                  ? `${(session.firstName?.[0] ?? "").toUpperCase()}${(session.lastName?.[0] ?? "").toUpperCase()}`
                  : "SA"}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.6)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-slate-800 truncate leading-tight">
                {[session?.firstName, session?.lastName].filter(Boolean).join(" ") || "Super Admin"}
              </p>
              <p className="text-[10px] text-slate-400 font-semibold truncate mt-0.5" dir="ltr">{session?.phone || ""}</p>
              <p className="text-[9px] font-bold text-sky-500 uppercase tracking-[0.15em] mt-0.5">Super Administrateur</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-rose-100 bg-rose-50/50 text-rose-600 text-xs font-bold hover:bg-rose-100/80 hover:border-rose-200 transition-all duration-200 cursor-pointer shadow-sm"
          >
            {Icons.logout}
            <span>{t("logout")}</span>
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-y-auto">
        {/* Top Bar */}
        <header className="flex items-center gap-4 px-6 pt-7 pb-2">
          <button type="button" onClick={() => setSidebarOpen(true)} className="lg:hidden rounded-xl p-2 bg-sky-50 text-sky-700 hover:bg-sky-100 transition cursor-pointer shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 animate-fade-in">
            {tabs.find((tab) => tab.key === activeTab)?.label}
          </h2>
        </header>

        {/* Content Area */}
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in">
          {/* Success toast */}
          {successMessage && (
            <div className="fixed top-20 right-6 z-[60] rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700 shadow-lg animate-scale-in">
              ✅ {successMessage}
            </div>
          )}

          {/* Error toast (notification — reste au-dessus des modals) */}
          {errorMessage && (
            <div className="fixed top-20 right-6 z-[60] flex max-w-sm items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 shadow-lg animate-scale-in">
              <span className="mt-0.5 shrink-0">⚠️</span>
              <span>{errorMessage}</span>
              <button type="button" onClick={() => setErrorMessage(null)} className="ml-1 shrink-0 text-rose-400 transition hover:text-rose-600">✕</button>
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

                  {/* ── Establishment filter ── */}
                  <div className="relative z-[60]">
                    {/* Pill row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Tous button */}
                      <button
                        type="button"
                        onClick={() => { setOverviewEstFilter(null); setEstPickerOpen(false); setEstPickerSearch(""); }}
                        className={`group relative inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all duration-200 ${
                          overviewEstFilter === null
                            ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-[0_4px_16px_rgba(99,102,241,0.35)] scale-[1.02]"
                            : "bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 hover:shadow-[0_4px_12px_rgba(99,102,241,0.12)]"
                        }`}
                      >
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h18" /></svg>
                        Tous
                        <span className={`rounded-full px-1.5 py-0 text-[10px] font-black ${overviewEstFilter === null ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"}`}>
                          {establishments.length}
                        </span>
                      </button>

                      {/* Selected establishment active chip */}
                      {overviewEstFilter !== null && (() => {
                        const est = establishments.find((e) => e.id === overviewEstFilter);
                        const satStat = stats.find((s) => s.establishment_id === overviewEstFilter);
                        const satPct = satStat ? Number(satStat.saturation_percentage) : 0;
                        const dotColor = satPct > 80 ? "bg-rose-400" : satPct >= 35 ? "bg-sky-400" : "bg-emerald-400";
                        return (
                          <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2 text-sm font-bold text-white shadow-[0_4px_16px_rgba(99,102,241,0.35)]">
                            <span className={`h-2 w-2 rounded-full ${dotColor} ring-2 ring-white/40`} />
                            <span className="truncate max-w-[180px]">{est?.name ?? "—"}</span>
                            <button
                              type="button"
                              onClick={() => { setOverviewEstFilter(null); setEstPickerSearch(""); }}
                              className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/20 hover:bg-white/35 transition"
                            >
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        );
                      })()}

                      {/* Dropdown trigger */}
                      <button
                        type="button"
                        onClick={() => { setEstPickerOpen((v) => !v); setEstPickerSearch(""); }}
                        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                          estPickerOpen
                            ? "border-indigo-300 bg-indigo-50 text-indigo-700 shadow-[0_4px_12px_rgba(99,102,241,0.15)]"
                            : "border-slate-200 bg-white text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:shadow-[0_4px_12px_rgba(99,102,241,0.12)]"
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <span>{overviewEstFilter !== null ? "Changer" : "Choisir un établissement"}</span>
                        <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${estPickerOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    </div>

                    {/* Dropdown panel */}
                    {estPickerOpen && (
                      <>
                        <div className="fixed inset-0 z-[70]" onClick={() => setEstPickerOpen(false)} />
                        <div className="absolute left-0 top-full z-[80] mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-100 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.12),0_4px_16px_rgba(99,102,241,0.08)] animate-scale-in origin-top-left overflow-hidden">
                          {/* Header */}
                          <div className="bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-3">
                            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/70">Filtrer par établissement</p>
                            <p className="text-xs text-white/80 mt-0.5">{establishments.length} établissements disponibles</p>
                          </div>
                          {/* Search */}
                          <div className="p-3 border-b border-slate-100 bg-slate-50/60">
                            <div className="relative">
                              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                              <input
                                autoFocus
                                type="text"
                                value={estPickerSearch}
                                onChange={(e) => setEstPickerSearch(e.target.value)}
                                placeholder="Rechercher un établissement..."
                                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
                              />
                            </div>
                          </div>
                          {/* List */}
                          <div className="max-h-60 overflow-y-auto">
                            {establishments
                              .filter((e) => e.name.toLowerCase().includes(estPickerSearch.toLowerCase()))
                              .map((est, idx) => {
                                const satStat = stats.find((s) => s.establishment_id === est.id);
                                const satPct = satStat ? Number(satStat.saturation_percentage) : 0;
                                const estFin = financials?.by_establishment?.find((b) => b.id === est.id);
                                const isSelected = overviewEstFilter === est.id;
                                const dotColor = satPct > 80 ? "bg-rose-500" : satPct >= 35 ? "bg-sky-500" : "bg-emerald-500";
                                const dotShadow = satPct > 80 ? "shadow-[0_0_6px_rgba(244,63,94,0.6)]" : satPct >= 35 ? "shadow-[0_0_6px_rgba(14,165,233,0.6)]" : "shadow-[0_0_6px_rgba(16,185,129,0.6)]";
                                return (
                                  <button
                                    key={est.id}
                                    type="button"
                                    onClick={() => { setOverviewEstFilter(est.id); setEstPickerOpen(false); setEstPickerSearch(""); }}
                                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-all duration-150 ${
                                      isSelected
                                        ? "bg-indigo-50 border-l-2 border-indigo-500"
                                        : "hover:bg-slate-50 border-l-2 border-transparent"
                                    } ${idx !== 0 ? "border-t border-slate-50" : ""}`}
                                  >
                                    <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotColor} ${dotShadow}`} />
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-sm font-bold truncate ${isSelected ? "text-indigo-700" : "text-slate-800"}`}>{est.name}</p>
                                      <p className="text-[11px] text-slate-400 mt-0.5">{satPct.toFixed(1)}% saturation · {estFin?.bookings_today ?? 0} résa aujourd'hui</p>
                                    </div>
                                    {isSelected && (
                                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            {establishments.filter((e) => e.name.toLowerCase().includes(estPickerSearch.toLowerCase())).length === 0 && (
                              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                                <svg className="w-8 h-8 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                <p className="text-xs font-semibold">Aucun établissement trouvé</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* ── Revenue KPI cards ── */}
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {/* CA Aujourd'hui */}
                    <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-5 text-white shadow-[0_8px_30px_rgba(16,185,129,0.3)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(16,185,129,0.4)] animate-fade-in-up" style={{ animationDelay: "0ms" }}>
                      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
                      <div className="absolute -bottom-6 -left-2 h-20 w-20 rounded-full bg-white/5" />
                      <div className="relative">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/70">{t("revenueToday")}</p>
                        <p className="mt-2 text-2xl font-black tracking-tight">
                          {Number(filteredFinancials?.today?.revenue ?? 0).toLocaleString("fr-FR")} <span className="text-lg font-semibold">DA</span>
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">
                            {filteredFinancials?.today?.bookings_count ?? 0} réservations
                          </span>
                          {((filteredFinancials?.today as any)?.pending_count ?? 0) > 0 && (
                            <span className="rounded-full bg-amber-400/30 px-2 py-0.5 text-[10px] font-bold text-amber-100">
                              {(filteredFinancials?.today as any).pending_count} en attente
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* CA Semaine */}
                    <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 p-5 text-white shadow-[0_8px_30px_rgba(14,165,233,0.3)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(14,165,233,0.4)] animate-fade-in-up" style={{ animationDelay: "80ms" }}>
                      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
                      <div className="absolute -bottom-6 -left-2 h-20 w-20 rounded-full bg-white/5" />
                      <div className="relative">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/70">{t("revenueWeek")}</p>
                        <p className="mt-2 text-2xl font-black tracking-tight">
                          {Number(filteredFinancials?.this_week?.revenue ?? 0).toLocaleString("fr-FR")} <span className="text-lg font-semibold">DA</span>
                        </p>
                        <p className="mt-3 text-[11px] font-semibold text-white/60">Revenus encaissés cette semaine</p>
                      </div>
                    </div>

                    {/* CA Mois */}
                    <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 p-5 text-white shadow-[0_8px_30px_rgba(99,102,241,0.3)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(99,102,241,0.4)] animate-fade-in-up" style={{ animationDelay: "160ms" }}>
                      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
                      <div className="absolute -bottom-6 -left-2 h-20 w-20 rounded-full bg-white/5" />
                      <div className="relative">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/70">{t("revenueMonth")}</p>
                        <p className="mt-2 text-2xl font-black tracking-tight">
                          {Number(filteredFinancials?.this_month?.revenue ?? 0).toLocaleString("fr-FR")} <span className="text-lg font-semibold">DA</span>
                        </p>
                        <p className="mt-3 text-[11px] font-semibold text-white/60">Revenus encaissés ce mois</p>
                      </div>
                    </div>

                    {/* Réservations mois */}
                    <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 p-5 text-white shadow-[0_8px_30px_rgba(244,63,94,0.25)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(244,63,94,0.4)] animate-fade-in-up" style={{ animationDelay: "240ms" }}>
                      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
                      <div className="absolute -bottom-6 -left-2 h-20 w-20 rounded-full bg-white/5" />
                      <div className="relative">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/70">{t("bookingsMonth")}</p>
                        <p className="mt-2 text-2xl font-black tracking-tight">
                          {filteredFinancials?.this_month?.bookings_count ?? history.filter(h => h.status !== "ANNULE" && h.status !== "MAINTENANCE").length}
                        </p>
                        <p className="mt-3 text-[11px] font-semibold text-white/60">Réservations actives ce mois</p>
                      </div>
                    </div>
                  </div>

                  {/* ── Per-establishment revenue breakdown (when "All" is selected) ── */}
                  {overviewEstFilter === null && (financials?.by_establishment?.length ?? 0) > 0 && (
                    <div className="rounded-2xl border border-slate-100 bg-white/90 backdrop-blur p-5 shadow-sm">
                      <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-500 mb-4">Revenus par établissement — aujourd'hui</p>
                      <div className="space-y-3">
                        {financials!.by_establishment.map((est) => {
                          const satStat = stats.find((s) => s.establishment_id === est.id);
                          const satPct = satStat ? Number(satStat.saturation_percentage) : 0;
                          return (
                            <div key={est.id}
                              className="flex items-center gap-4 cursor-pointer rounded-xl px-3 py-2.5 transition hover:bg-slate-50"
                              onClick={() => setOverviewEstFilter(est.id)}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <span className="text-sm font-bold text-slate-800 truncate">{est.name}</span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-xs font-semibold text-slate-500">{est.bookings_today} résa</span>
                                    {(est as any).pending_today > 0 && (
                                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{(est as any).pending_today} att.</span>
                                    )}
                                    <span className="text-sm font-black text-emerald-700">{Number(est.revenue_today).toLocaleString("fr-FR")} DA</span>
                                  </div>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${satPct > 80 ? "bg-rose-500" : satPct >= 35 ? "bg-sky-500" : "bg-emerald-500"}`}
                                    style={{ width: `${Math.min(satPct, 100)}%` }}
                                  />
                                </div>
                                <p className="mt-0.5 text-[10px] text-slate-400 font-semibold">Saturation semaine : {satPct.toFixed(1)}%</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Saturation alerts ── */}
                  {filteredSaturation.filter((s) => s.needs_more_resources).map((s) => (
                    <div key={s.establishment_id} className="flex items-center gap-4 rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50 to-pink-50 p-4 shadow-sm">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white shadow-[0_4px_12px_rgba(244,63,94,0.3)]">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-black text-rose-800">{t("criticalSaturation")} — {s.establishment_name}</p>
                        <p className="text-xs text-rose-600 mt-0.5">{t("addMachinesHint")} ({Number(s.saturation_percentage).toFixed(1)}%)</p>
                      </div>
                    </div>
                  ))}

                  {/* ── Charts Row ── */}
                  <div className="grid gap-6 xl:grid-cols-2">
                    {/* Hourly frequency */}
                    <div className="rounded-2xl border border-slate-100 bg-white/90 backdrop-blur p-5 shadow-sm">
                      <div className="mb-4">
                        <h3 className="text-sm font-black text-slate-800">{t("hourlyFrequency")}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Réservations actives par heure — semaine en cours</p>
                      </div>
                      <div className="h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={financials?.hourly_frequency ?? []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="gradHourly" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis dataKey="hour" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip
                              contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 12 }}
                              formatter={(v: number) => [v, "Réservations"]}
                            />
                            <Area type="monotone" dataKey="count" stroke="#6366f1" fill="url(#gradHourly)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: "#6366f1" }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Daily frequency */}
                    <div className="rounded-2xl border border-slate-100 bg-white/90 backdrop-blur p-5 shadow-sm">
                      <div className="mb-4">
                        <h3 className="text-sm font-black text-slate-800">{t("dailyFrequency")}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Réservations actives par jour — mois en cours</p>
                      </div>
                      <div className="h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={financials?.daily_frequency ?? []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis dataKey="day" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip
                              contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 12 }}
                              formatter={(v: number) => [v, "Réservations"]}
                            />
                            <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#0ea5e9">
                              {(financials?.daily_frequency ?? []).map((_entry, idx) => (
                                <Cell key={idx} fill={idx === new Date().getDay() - 1 ? "#6366f1" : "#0ea5e9"} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* ── Weekly saturation chart ── */}
                  <div className="rounded-2xl border border-slate-100 bg-white/90 backdrop-blur p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                      <div>
                        <h3 className="text-sm font-black text-slate-800">{t("weeklySaturation")}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Taux d'occupation par établissement cette semaine</p>
                      </div>
                      <div className="flex gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-[11px] font-bold text-emerald-700">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />{t("stableBadge")} &lt;35%
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 border border-sky-200 px-3 py-1 text-[11px] font-bold text-sky-700">
                          <span className="h-2 w-2 rounded-full bg-sky-500" />Normal 35–80%
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-3 py-1 text-[11px] font-bold text-rose-700">
                          <span className="h-2 w-2 rounded-full bg-rose-500" />{t("saturatedBadge")} &gt;80%
                        </span>
                      </div>
                    </div>

                    {/* Recharts saturation graph */}
                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={filteredSaturation.map((s) => ({ name: s.establishment_name, saturation: Number(s.saturation_percentage), postes: s.active_resources }))}
                          margin={{ top: 10, right: 8, left: -18, bottom: 4 }}
                        >
                          <defs>
                            <linearGradient id="gradSatLow" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#34d399" /><stop offset="100%" stopColor="#10b981" />
                            </linearGradient>
                            <linearGradient id="gradSatMid" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#38bdf8" /><stop offset="100%" stopColor="#0ea5e9" />
                            </linearGradient>
                            <linearGradient id="gradSatHigh" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#fb7185" /><stop offset="100%" stopColor="#f43f5e" />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={filteredSaturation.length > 4 ? -12 : 0} textAnchor={filteredSaturation.length > 4 ? "end" : "middle"} height={filteredSaturation.length > 4 ? 50 : 24} />
                          <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                          <Tooltip
                            cursor={{ fill: "rgba(99,102,241,0.06)" }}
                            contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 12 }}
                            formatter={(v: number) => [`${v.toFixed(1)}%`, t("occupancyRate")]}
                          />
                          <Bar dataKey="saturation" radius={[8, 8, 0, 0]} maxBarSize={64} animationDuration={900}>
                            {filteredSaturation.map((s, idx) => {
                              const pct = Number(s.saturation_percentage);
                              const fill = pct > 80 ? "url(#gradSatHigh)" : pct >= 35 ? "url(#gradSatMid)" : "url(#gradSatLow)";
                              return <Cell key={idx} fill={fill} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
                      {filteredSaturation.map((s) => {
                        const pct = Number(s.saturation_percentage);
                        const color = pct > 80 ? "bg-rose-500" : pct >= 35 ? "bg-sky-500" : "bg-emerald-500";
                        const textColor = pct > 80 ? "text-rose-700" : pct >= 35 ? "text-sky-700" : "text-emerald-700";
                        return (
                          <div key={s.establishment_id} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-bold text-slate-700 truncate">{s.establishment_name}</span>
                              <div className="flex items-center gap-3 shrink-0 text-xs font-semibold text-slate-500">
                                <span>{s.active_resources} postes</span>
                                <span className={`font-black ${textColor}`}>{pct.toFixed(1)}%</span>
                              </div>
                            </div>
                            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${color}`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}

              {/* ──── ESTABLISHMENTS TAB ──── */}
              {/* ──── MODES TAB ──── */}
              {activeTab === "modes" && (() => {
                const filteredModes = modes.filter((m) =>
                  !modeSearch.trim() ||
                  m.nom.toLowerCase().includes(modeSearch.toLowerCase()) ||
                  (Array.isArray(m.types_vetements) && m.types_vetements.join(" ").toLowerCase().includes(modeSearch.toLowerCase()))
                );
                return (
                <div className="space-y-4">
                  {/* Toolbar */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[220px]">
                      <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      <input
                        type="text"
                        value={modeSearch}
                        onChange={(e) => setModeSearch(e.target.value)}
                        placeholder={t("searchModePlaceholder")}
                        className="w-full rounded-2xl border border-sky-100 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 placeholder:text-slate-300 shadow-sm"
                      />
                      {modeSearch && (
                        <button type="button" onClick={() => setModeSearch("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                    <p className="shrink-0 text-sm text-slate-400 font-semibold">
                      {modeSearch ? `${filteredModes.length} / ${modes.length}` : `${modes.length} ${modes.length !== 1 ? t("modes").toLowerCase() : t("mode").toLowerCase()}`}
                    </p>
                    <button type="button" onClick={openCreateMode} className="shrink-0 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-200/50 hover:shadow-xl transition cursor-pointer">
                      {Icons.plus} {t("addMode")}
                    </button>
                  </div>

                  {modes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-sky-200 bg-sky-50/40 p-16 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-500 mb-4">{Icons.washingMachine}</div>
                      <p className="text-sm font-bold text-slate-600">{t("noModes")}</p>
                      <p className="text-xs text-slate-400 mt-1">{t("noModesHint")}</p>
                    </div>
                  ) : filteredModes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-sky-200 bg-sky-50/40 py-16 text-center">
                      <svg className="w-10 h-10 text-sky-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      <p className="text-sm font-bold text-slate-500">{t("noModesFound")}</p>
                      <p className="text-xs text-slate-400 mt-1">"<span className="font-semibold">{modeSearch}</span>"</p>
                    </div>
                  ) : (
                    /* DataTable */
                    <div className="overflow-hidden rounded-3xl border border-sky-100/80 bg-white shadow-[0_4px_20px_rgba(14,165,233,0.06)]">
                      <div className="h-[3px] w-full bg-gradient-to-r from-sky-400 via-indigo-500 to-cyan-400" />
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                              <th className="px-5 py-3.5">{t("modeName")}</th>
                              <th className="px-5 py-3.5 text-center">{t("modeDuration")}</th>
                              <th className="px-5 py-3.5 text-center">{t("modePrice")}</th>
                              <th className="px-5 py-3.5 text-center">{t("modeCapacity")}</th>
                              <th className="px-5 py-3.5">{t("modeClothTypes")}</th>
                              <th className="px-5 py-3.5 text-right">{t("actions")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {filteredModes.map((mode, idx) => (
                              <tr key={mode.id} className="group transition hover:bg-sky-50/40 animate-fade-in-up" style={{ animationDelay: `${idx * 40}ms` }}>
                                <td className="px-5 py-4">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-50 to-cyan-50 border border-sky-100 text-sky-600 shadow-sm">
                                      {Icons.washingMachine}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-black text-slate-900 truncate leading-tight">{mode.nom}</p>
                                      {mode.message_guide && <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[220px]">{mode.message_guide}</p>}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-5 py-4 text-center">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-1 text-[11px] font-bold text-indigo-600">
                                    {mode.duree} min
                                  </span>
                                </td>
                                <td className="px-5 py-4 text-center">
                                  <span className="text-sm font-black text-slate-900">{Number(mode.prix_base).toLocaleString("fr-FR")}</span>
                                  <span className="text-[10px] font-bold text-slate-400 ml-1">DA</span>
                                </td>
                                <td className="px-5 py-4 text-center text-sm font-semibold text-slate-600">
                                  {Number(mode.capacite_max)} kg
                                </td>
                                <td className="px-5 py-4">
                                  <div className="flex flex-wrap gap-1 max-w-[260px]">
                                    {(mode.types_vetements ?? []).slice(0, 4).map((type) => (
                                      <span key={type} className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{type}</span>
                                    ))}
                                    {(mode.types_vetements?.length ?? 0) > 4 && (
                                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400">+{(mode.types_vetements!.length - 4)}</span>
                                    )}
                                    {(mode.types_vetements?.length ?? 0) === 0 && <span className="text-[11px] text-slate-300">—</span>}
                                  </div>
                                </td>
                                <td className="px-5 py-4">
                                  <div className="flex items-center justify-end gap-2">
                                    <button type="button" onClick={() => openEditMode(mode)}
                                      className="rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-1.5 text-[11px] font-bold text-sky-700 hover:bg-sky-100 transition cursor-pointer">
                                      {t("edit")}
                                    </button>
                                    <button type="button" onClick={() => deleteMode(mode)}
                                      className="rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-100 transition cursor-pointer">
                                      {t("delete")}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
                );
              })()}

              {activeTab === "establishments" && (() => {
                const filtered = establishments.filter((e) =>
                  !estSearchQuery.trim() ||
                  e.name.toLowerCase().includes(estSearchQuery.toLowerCase()) ||
                  e.city.toLowerCase().includes(estSearchQuery.toLowerCase()) ||
                  e.address.toLowerCase().includes(estSearchQuery.toLowerCase())
                );
                return (
                <div className="space-y-4">
                  {/* Toolbar */}
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[220px]">
                      <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      <input
                        type="text"
                        value={estSearchQuery}
                        onChange={(e) => setEstSearchQuery(e.target.value)}
                        placeholder="Rechercher par nom, ville, adresse..."
                        className="w-full rounded-2xl border border-sky-100 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 placeholder:text-slate-300 shadow-sm"
                      />
                      {estSearchQuery && (
                        <button type="button" onClick={() => setEstSearchQuery("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                    {/* Count + Add */}
                    <p className="shrink-0 text-sm text-slate-400 font-semibold">
                      {estSearchQuery ? `${filtered.length} / ${establishments.length}` : `${establishments.length} établissement${establishments.length !== 1 ? "s" : ""}`}
                    </p>
                    <button type="button" onClick={openCreateEstablishment} className="shrink-0 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-200/50 hover:shadow-xl transition cursor-pointer">
                      {Icons.plus} {t("addEstablishment")}
                    </button>
                  </div>

                  {establishments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-sky-200 bg-sky-50/40 p-16 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-500 mb-4">{Icons.building}</div>
                      <p className="text-sm font-bold text-slate-600">{t("noEstablishments")}</p>
                      <p className="text-xs text-slate-400 mt-1">Ajoutez votre premier établissement pour commencer.</p>
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-sky-200 bg-sky-50/40 py-16 text-center">
                      <svg className="w-10 h-10 text-sky-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      <p className="text-sm font-bold text-slate-500">Aucun établissement trouvé</p>
                      <p className="text-xs text-slate-400 mt-1">pour "<span className="font-semibold">{estSearchQuery}</span>"</p>
                    </div>
                  ) : (
                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                      {filtered.map((est, idx) => {
                        const stat = stats.find((s) => s.establishment_id === est.id);
                        const saturation = Number(stat?.saturation_percentage ?? 0);
                        const estFin = financials?.by_establishment?.find((b) => b.id === est.id);
                        const satColor = saturation > 80 ? "bg-rose-500" : saturation >= 35 ? "bg-sky-500" : "bg-emerald-500";
                        const satTextColor = saturation > 80 ? "text-rose-600" : saturation >= 35 ? "text-sky-600" : "text-emerald-600";
                        const satBg = saturation > 80 ? "bg-rose-50 border-rose-100" : saturation >= 35 ? "bg-sky-50 border-sky-100" : "bg-emerald-50 border-emerald-100";
                        const estAssistants = assistants.filter((a) => a.establishment === est.id);
                        return (
                          <div
                            key={est.id}
                            onClick={() => { setManagedEstablishment({ id: est.id, name: est.name }); navigate("/admin/dashboard/creation"); }}
                            className="group relative flex flex-col overflow-hidden rounded-3xl border border-sky-100/80 bg-white shadow-[0_4px_20px_rgba(14,165,233,0.06)] hover:shadow-[0_12px_36px_rgba(14,165,233,0.14)] transition-all duration-300 hover:-translate-y-1 animate-fade-in-up cursor-pointer"
                            style={{ animationDelay: `${idx * 60}ms` }}
                          >
                            {/* Top gradient accent */}
                            <div className="h-[3px] w-full bg-gradient-to-r from-sky-400 via-indigo-500 to-cyan-400" />

                            <div className="flex-1 p-5">
                              {/* Header row */}
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-50 to-cyan-50 border border-sky-100 text-sky-600 shadow-sm">
                                    {Icons.building}
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="text-sm font-black text-slate-900 truncate leading-tight">{est.name}</h4>
                                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{est.address}, {est.city}</p>
                                  </div>
                                </div>
                                <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black ${satBg} ${satTextColor}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${satColor}`} />
                                  {saturation.toFixed(0)}%
                                </span>
                              </div>

                              {/* Saturation progress */}
                              <div className="mt-4">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Saturation semaine</span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                  <div className={`h-full rounded-full transition-all duration-700 ${satColor}`} style={{ width: `${Math.min(saturation, 100)}%` }} />
                                </div>
                              </div>

                              {/* Stats grid */}
                              <div className="mt-4 grid grid-cols-3 gap-2">
                                <div className="rounded-xl bg-sky-50/60 border border-sky-100/60 p-2.5 text-center">
                                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-sky-500">Postes</p>
                                  <p className="text-lg font-black text-slate-900 mt-0.5">{stat?.active_resources ?? 0}</p>
                                </div>
                                <div className="rounded-xl bg-indigo-50/60 border border-indigo-100/60 p-2.5 text-center">
                                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-indigo-500">Résa</p>
                                  <p className="text-lg font-black text-slate-900 mt-0.5">{estFin?.bookings_today ?? 0}</p>
                                </div>
                                <div className="rounded-xl bg-emerald-50/60 border border-emerald-100/60 p-2.5 text-center">
                                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-500">CA</p>
                                  <p className="text-sm font-black text-slate-900 mt-0.5 truncate">{Number(estFin?.revenue_today ?? 0).toLocaleString("fr-FR")}</p>
                                </div>
                              </div>

                              {/* Assistants row */}
                              <div className="mt-4 flex items-center gap-2">
                                <div className="flex -space-x-2">
                                  {estAssistants.slice(0, 3).map((a) => (
                                    <div key={a.id} className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-[10px] font-black text-white ring-2 ring-white shadow-sm">
                                      {(a.first_name?.[0] ?? "A").toUpperCase()}
                                    </div>
                                  ))}
                                  {estAssistants.length === 0 && (
                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 ring-2 ring-white">
                                      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                    </div>
                                  )}
                                </div>
                                <span className="text-xs text-slate-400 font-medium">
                                  {estAssistants.length === 0 ? "Aucun assistant" : `${estAssistants.length} assistant${estAssistants.length > 1 ? "s" : ""}`}
                                </span>
                                <span className="ml-auto text-[10px] text-slate-300">{formatDate(est.created_at, i18n.language)}</span>
                              </div>
                            </div>

                            {/* Action buttons */}
                            <div className="border-t border-sky-50 bg-sky-50/30 p-3 space-y-2">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setManagedEstablishment({ id: est.id, name: est.name }); navigate("/admin/dashboard/creation"); }}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-cyan-500 px-4 py-2.5 text-sm font-bold text-white shadow-[0_6px_20px_rgba(14,165,233,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(14,165,233,0.35)] cursor-pointer"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                Gérer cet établissement
                              </button>
                              <div className="flex gap-2">
                                <button type="button" onClick={(e) => { e.stopPropagation(); openEditEstablishment(est); }}
                                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-white py-2 text-xs font-bold text-sky-700 hover:bg-sky-50 transition cursor-pointer">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                  Modifier
                                </button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); deleteEstablishment(est.id); }}
                                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-rose-100 bg-white py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 transition cursor-pointer">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  Supprimer
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                );
              })()}

              {/* ──── ASSISTANTS TAB ──── */}
              {activeTab === "assistants" && !assistantDetailId && (() => {
                const filtered = assistants.filter((a) => {
                  const q = assistantSearch.toLowerCase().trim();
                  const matchQ = !q || a.first_name.toLowerCase().includes(q) || a.last_name.toLowerCase().includes(q) || a.phone.includes(q) || (a.establishment_name ?? "").toLowerCase().includes(q);
                  const matchEst = assistantEstFilter === "all" || String(a.establishment) === assistantEstFilter;
                  return matchQ && matchEst;
                });
                return (
                <div className="space-y-5">
                  {/* Toolbar */}
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px]">
                      <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      <input type="text" value={assistantSearch} onChange={(e) => setAssistantSearch(e.target.value)}
                        placeholder="Nom, téléphone, établissement..."
                        className="w-full rounded-2xl border border-sky-100 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 placeholder:text-slate-300 shadow-sm" />
                      {assistantSearch && (
                        <button type="button" onClick={() => setAssistantSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                    {/* Establishment filter */}
                    <div className="relative">
                      <select value={assistantEstFilter} onChange={(e) => setAssistantEstFilter(e.target.value)}
                        className="appearance-none rounded-2xl border border-sky-100 bg-white py-2.5 pl-4 pr-9 text-sm font-semibold text-slate-600 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 shadow-sm cursor-pointer">
                        <option value="all">Tous les établissements</option>
                        {establishments.map((e) => <option key={e.id} value={String(e.id)}>{e.name}</option>)}
                      </select>
                      <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                    <p className="shrink-0 text-sm text-slate-400 font-semibold">
                      {(assistantSearch || assistantEstFilter !== "all") ? `${filtered.length} / ${assistants.length}` : `${assistants.length} assistant${assistants.length !== 1 ? "s" : ""}`}
                    </p>
                    <button type="button" onClick={openCreateAssistant}
                      className="shrink-0 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-200/50 hover:shadow-xl transition cursor-pointer">
                      {Icons.plus} {t("addAssistant")}
                    </button>
                  </div>

                  {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-sky-200 bg-sky-50/40 py-16 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-500 mb-4">{Icons.users}</div>
                      <p className="text-sm font-bold text-slate-600">{assistants.length === 0 ? t("noAssistants") : "Aucun assistant trouvé"}</p>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {filtered.map((assistant, idx) => {
                        const initials = `${(assistant.first_name?.[0] ?? "").toUpperCase()}${(assistant.last_name?.[0] ?? "").toUpperCase()}` || "AS";
                        const totalValidated = history.filter((h) => h.validated_by?.id === assistant.id && h.status === "PAYE").length;
                        return (
                          <div key={assistant.id}
                            onClick={() => navigate(`/superadmin/assistants/${assistant.id}`)}
                            className="group relative flex flex-col overflow-hidden rounded-3xl border border-sky-100/80 bg-white shadow-[0_4px_20px_rgba(14,165,233,0.06)] hover:shadow-[0_12px_36px_rgba(14,165,233,0.14)] transition-all duration-300 hover:-translate-y-1 cursor-pointer animate-fade-in-up"
                            style={{ animationDelay: `${idx * 50}ms` }}
                          >
                            {/* Top accent */}
                            <div className="h-[3px] w-full bg-gradient-to-r from-sky-400 via-indigo-500 to-cyan-400" />

                            <div className="flex-1 p-5">
                              <div className="flex items-start gap-4">
                                {/* Avatar */}
                                <div className="relative shrink-0">
                                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 via-sky-500 to-indigo-500 text-lg font-black text-white shadow-[0_6px_16px_rgba(14,165,233,0.3)]">
                                    {initials}
                                  </div>
                                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.5)]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-base font-black text-slate-900 truncate leading-tight">
                                    {assistant.first_name} {assistant.last_name}
                                  </h4>
                                  <p className="text-xs text-slate-400 font-medium mt-0.5" dir="ltr">{assistant.phone}</p>
                                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-100 px-2.5 py-0.5 text-[10px] font-bold text-sky-700">
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" /></svg>
                                    {assistant.establishment_name || "—"}
                                  </span>
                                </div>
                              </div>

                              {/* Stats */}
                              <div className="mt-4 grid grid-cols-2 gap-2">
                                <div className="rounded-xl bg-emerald-50/60 border border-emerald-100/60 p-2.5 text-center">
                                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-500">Validations</p>
                                  <p className="text-xl font-black text-slate-900 mt-0.5">{totalValidated}</p>
                                </div>
                                <div className="rounded-xl bg-sky-50/60 border border-sky-100/60 p-2.5 text-center">
                                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-sky-500">Membres depuis</p>
                                  <p className="text-xs font-bold text-slate-700 mt-1">{formatDate(assistant.date_joined, i18n.language)}</p>
                                </div>
                              </div>
                            </div>

                            {/* Actions footer */}
                            <div className="border-t border-sky-50 bg-sky-50/30 px-4 py-3 flex items-center gap-2">
                              <button type="button"
                                onClick={(e) => { e.stopPropagation(); openEditAssistant(assistant); }}
                                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-white py-2 text-xs font-bold text-sky-700 hover:bg-sky-50 transition">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                Modifier
                              </button>
                              <button type="button"
                                onClick={(e) => { e.stopPropagation(); deleteAssistant(assistant.id); }}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-100 bg-white text-rose-500 hover:bg-rose-50 transition">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                );
              })()}

              {/* ──── ASSISTANT DETAIL VIEW ──── */}
              {activeTab === "assistants" && assistantDetailId && (() => {
                const assistant = assistants.find((a) => a.id === assistantDetailId);
                if (!assistant) return (
                  <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                    <p className="text-sm font-semibold">Assistant introuvable.</p>
                    <button type="button" onClick={() => navigate("/superadmin/assistants")} className="mt-4 rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white">← Retour</button>
                  </div>
                );
                const assistantHistory = history.filter((h) => h.validated_by?.id === assistant.id);
                const initials = `${(assistant.first_name?.[0] ?? "").toUpperCase()}${(assistant.last_name?.[0] ?? "").toUpperCase()}` || "AS";
                const paidCount = assistantHistory.filter((h) => h.status === "PAYE").length;
                const cancelCount = assistantHistory.filter((h) => h.status === "ANNULE").length;
                const maintCount = assistantHistory.filter((h) => h.status === "MAINTENANCE").length;
                const totalRevenue = assistantHistory.filter((h) => h.status === "PAYE").reduce((s, h) => s + Number(h.total_price || 0), 0);
                return (
                <div className="space-y-6 animate-fade-in-up">
                  {/* Back */}
                  <button type="button" onClick={() => navigate("/superadmin/assistants")}
                    className="flex items-center gap-2 text-sm font-bold text-sky-600 hover:text-sky-800 transition">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    Retour aux assistants
                  </button>

                  {/* Profile header */}
                  <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-sky-500 via-indigo-500 to-cyan-500 p-6 text-white shadow-[0_8px_32px_rgba(14,165,233,0.3)]">
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
                    <div className="relative flex flex-wrap items-center gap-5">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-white/20 text-3xl font-black shadow-[0_4px_16px_rgba(0,0,0,0.15)]">{initials}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/60">Assistant</p>
                        <h2 className="text-2xl font-black text-white mt-0.5">{assistant.first_name} {assistant.last_name}</h2>
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-white/80">
                          <span dir="ltr">{assistant.phone}</span>
                          <span className="opacity-40">·</span>
                          <span>{assistant.establishment_name || "—"}</span>
                          <span className="opacity-40">·</span>
                          <span>Depuis {formatDate(assistant.date_joined, i18n.language)}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button type="button" onClick={() => openEditAssistant(assistant)}
                          className="rounded-xl bg-white/20 px-4 py-2 text-xs font-bold text-white hover:bg-white/30 transition">Modifier</button>
                        <button type="button" onClick={() => resetAssistantPassword(assistant)}
                          className="rounded-xl bg-white/20 px-4 py-2 text-xs font-bold text-white hover:bg-white/30 transition">Reset code</button>
                      </div>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: "Paiements validés", value: paidCount, color: "from-emerald-500 to-teal-600", shadow: "shadow-emerald-200/60" },
                      { label: "Revenu total encaissé", value: `${totalRevenue.toLocaleString("fr-FR")} DA`, color: "from-sky-500 to-blue-600", shadow: "shadow-sky-200/60" },
                      { label: "Annulations", value: cancelCount, color: "from-rose-500 to-pink-600", shadow: "shadow-rose-200/60" },
                      { label: "Maintenances", value: maintCount, color: "from-violet-500 to-purple-600", shadow: "shadow-violet-200/60" },
                    ].map((stat, i) => (
                      <div key={i} className={`rounded-2xl bg-gradient-to-br ${stat.color} p-4 text-white shadow-lg ${stat.shadow}`}>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">{stat.label}</p>
                        <p className="mt-2 text-2xl font-black">{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* History */}
                  {(() => {
                    const HIST_FILTERS: { key: typeof assistantHistoryFilter; label: string; color: string; activeColor: string }[] = [
                      { key: "all",          label: "Tout",          color: "border-slate-200 bg-white text-slate-500 hover:border-sky-200 hover:text-sky-600",       activeColor: "bg-gradient-to-r from-sky-500 to-indigo-500 text-white border-transparent shadow-[0_4px_12px_rgba(14,165,233,0.3)]" },
                      { key: "cash",         label: "Payés",         color: "border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:text-emerald-600", activeColor: "bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-transparent shadow-[0_4px_12px_rgba(16,185,129,0.3)]" },
                      { key: "reservation",  label: "Réservations",  color: "border-slate-200 bg-white text-slate-500 hover:border-amber-200 hover:text-amber-600",    activeColor: "bg-gradient-to-r from-amber-500 to-orange-500 text-white border-transparent shadow-[0_4px_12px_rgba(245,158,11,0.3)]" },
                      { key: "maintenance",  label: "Maintenances",  color: "border-slate-200 bg-white text-slate-500 hover:border-violet-200 hover:text-violet-600",  activeColor: "bg-gradient-to-r from-violet-500 to-purple-600 text-white border-transparent shadow-[0_4px_12px_rgba(139,92,246,0.3)]" },
                    ];

                    const visibleHistory = assistantHistory.filter((item) => {
                      const q = assistantHistorySearch.toLowerCase().trim();
                      const matchQ = !q
                        || (item.client?.first_name ?? "").toLowerCase().includes(q)
                        || (item.client?.last_name ?? "").toLowerCase().includes(q)
                        || (item.client?.phone ?? "").includes(q)
                        || item.booking_reference?.toLowerCase().includes(q)
                        || item.establishment_name.toLowerCase().includes(q);
                      let matchKind = true;
                      if (assistantHistoryFilter === "cash")           matchKind = item.status === "PAYE";
                      else if (assistantHistoryFilter === "reservation") matchKind = item.status === "EN_ATTENTE";
                      else if (assistantHistoryFilter === "maintenance") matchKind = item.status === "MAINTENANCE";
                      return matchQ && matchKind;
                    });

                    const counts: Record<typeof assistantHistoryFilter, number> = {
                      all:          assistantHistory.length,
                      cash:         assistantHistory.filter((h) => h.status === "PAYE").length,
                      baridimob:    0,
                      reservation:  assistantHistory.filter((h) => h.status === "EN_ATTENTE").length,
                      cancellation: 0,
                      maintenance:  assistantHistory.filter((h) => h.status === "MAINTENANCE").length,
                    };

                    return (
                    <div className="rounded-2xl border border-slate-100 bg-white/90 shadow-sm overflow-hidden">
                      {/* Header */}
                      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4 border-b border-slate-100">
                        <h3 className="text-sm font-black text-slate-800">Historique des actions</h3>
                        {/* Search */}
                        <div className="relative min-w-[220px] flex-1 max-w-xs">
                          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                          <input type="text" value={assistantHistorySearch} onChange={(e) => setAssistantHistorySearch(e.target.value)}
                            placeholder="Client, référence, établissement..."
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs outline-none focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100 transition placeholder:text-slate-300" />
                          {assistantHistorySearch && (
                            <button type="button" onClick={() => setAssistantHistorySearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Filter pills */}
                      <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50/40">
                        {HIST_FILTERS.map((f) => (
                          <button key={f.key} type="button"
                            onClick={() => setAssistantHistoryFilter(f.key)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all duration-200 ${assistantHistoryFilter === f.key ? f.activeColor : f.color}`}
                          >
                            {f.label}
                            <span className={`rounded-full px-1.5 py-0 text-[10px] font-black ${assistantHistoryFilter === f.key ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"}`}>
                              {counts[f.key]}
                            </span>
                          </button>
                        ))}
                      </div>

                      {/* List */}
                      <div className="p-4">
                        {visibleHistory.length === 0 ? (
                          <div className="flex flex-col items-center py-12 text-slate-400">
                            <svg className="w-10 h-10 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                            <p className="text-xs font-semibold">{assistantHistory.length === 0 ? "Aucune activité enregistrée" : "Aucun résultat pour ce filtre"}</p>
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                            {visibleHistory.map((item) => (
                              <div key={item.id} className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/40 px-4 py-3 hover:bg-sky-50/40 hover:border-sky-100 transition">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-slate-800 truncate">
                                    {item.status === "MAINTENANCE" ? "Maintenance" : `${item.client?.first_name ?? ""} ${item.client?.last_name ?? ""}`}
                                    {item.status !== "MAINTENANCE" && item.client?.phone && (
                                      <span className="ml-1.5 font-normal text-slate-400">({item.client.phone})</span>
                                    )}
                                  </p>
                                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                                    {item.establishment_name} · {item.booking_date} · {item.start_time.slice(0,5)} – {item.end_time.slice(0,5)}
                                  </p>
                                </div>
                                <div className="shrink-0 flex items-center gap-3">
                                  <StatusBadge status={item.status} />
                                  <div className="text-right min-w-[90px]">
                                    {item.status === "PAYE" && <p className="text-xs font-black text-emerald-600">{item.total_price} DA</p>}
                                    <p className="text-[10px] text-slate-400 mt-0.5">{formatDateTime(item.validated_at || item.created_at, i18n.language)}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })()}
                </div>
                );
              })()}

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

                  {/* Kind tabs — separate history types */}
                  <div className="flex flex-wrap gap-2">
                    {([
                      { key: "all", label: "Tout", color: "from-slate-600 to-slate-700" },
                      { key: "cash", label: "Paiements espèces", color: "from-emerald-500 to-teal-600" },
                      { key: "baridimob", label: "Paiements BaridiMob", color: "from-sky-500 to-blue-600" },
                      { key: "maintenance", label: "Maintenances", color: "from-violet-500 to-purple-600" },
                    ] as { key: HistoryKind; label: string; color: string }[]).map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setHistoryKind(tab.key)}
                        className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                          historyKind === tab.key
                            ? `bg-gradient-to-r ${tab.color} text-white shadow-md`
                            : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        {tab.label}
                        <span className={`rounded-full px-1.5 py-0 text-[10px] font-black ${historyKind === tab.key ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"}`}>
                          {historyKindCounts[tab.key]}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* History List */}
                  <div className="space-y-3">
                    {filteredHistory.length === 0 ? (
                      <div className="rounded-3xl border border-sky-100 bg-sky-50/50 p-12 text-center text-slate-500">{t("noData")}</div>
                    ) : (
                      filteredHistory.map((item) => {
                        const isMaint = item.status === "MAINTENANCE";
                        return (
                        <div key={item.id} className="rounded-2xl border border-sky-100 bg-white/90 backdrop-blur p-5 shadow-sm hover:shadow-md transition-all animate-fade-in">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <p className="text-sm font-bold text-slate-900">
                                {isMaint ? "Maintenance" : `${item.client?.first_name ?? ""} ${item.client?.last_name ?? ""}`}{" "}
                                {!isMaint && item.client?.phone && <span className="text-slate-400 font-medium">({item.client.phone})</span>}
                              </p>
                              <p className="text-sm text-slate-600 mt-1">
                                {isMaint ? (
                                  <span>Poste bloqué — {item.establishment_name}</span>
                                ) : (
                                  <>
                                    {item.status === "ANNULE" ? "Annulé après paiement de " : t("transactionLine") + " "}
                                    <span className={`font-bold ${item.status === "ANNULE" ? "text-rose-600 line-through" : "text-emerald-700"}`}>{item.total_price} DA</span> — {item.establishment_name}
                                    {item.status === "PAYE" && item.payment_method && (
                                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                        {item.payment_method === "BARIDIMOB" ? "BaridiMob" : "Espèces"}
                                      </span>
                                    )}
                                  </>
                                )}
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
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* ──── SETTINGS TAB ──── */}
              {activeTab === "settings" && (
                <div className="animate-fade-in-up space-y-6">
                  {/* Top row: reservations + super admins side by side on wide screens */}
                  <div className="grid gap-6 xl:grid-cols-2">

                  {/* ── Section 1: Contrôle des réservations ── */}
                  <div className="overflow-hidden rounded-3xl border border-sky-100/80 bg-white shadow-[0_4px_20px_rgba(14,165,233,0.06)]">
                    <div className="h-[3px] bg-gradient-to-r from-sky-400 via-indigo-500 to-cyan-400" />
                    <div className="p-6">
                      <div className="flex items-center gap-3 mb-5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-50 to-cyan-50 border border-sky-100 text-sky-600">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-slate-900">Contrôle des réservations</h3>
                          <p className="text-xs text-slate-400 mt-0.5">Activez ou suspendez les réservations en ligne pour tous les établissements.</p>
                        </div>
                      </div>

                      {/* Toggle */}
                      <div className={`flex items-center justify-between gap-4 rounded-2xl border p-4 transition-all ${systemConfig.bookings_paused ? "border-rose-200 bg-rose-50/40" : "border-emerald-200 bg-emerald-50/40"}`}>
                        <div className="flex items-center gap-3">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${systemConfig.bookings_paused ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"}`}>
                            {systemConfig.bookings_paused
                              ? <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                              : <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            }
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-800">{systemConfig.bookings_paused ? "Réservations suspendues" : "Réservations actives"}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{systemConfig.bookings_paused ? "Les clients ne peuvent plus prendre de rendez-vous." : "Les clients peuvent réserver normalement."}</p>
                          </div>
                        </div>
                        <button type="button"
                          onClick={() => setSystemConfig((s) => ({ ...s, bookings_paused: !s.bookings_paused }))}
                          className={`relative inline-flex h-7 w-13 shrink-0 items-center rounded-full transition-colors duration-300 cursor-pointer ${systemConfig.bookings_paused ? "bg-rose-500" : "bg-emerald-500"}`}
                          style={{ width: 52 }}
                        >
                          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${systemConfig.bookings_paused ? "translate-x-1" : "translate-x-7"}`} />
                        </button>
                      </div>

                      {/* Pause reason */}
                      {systemConfig.bookings_paused && (
                        <div className="mt-3 animate-fade-in">
                          <label className="block text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1.5">Motif de suspension (affiché aux clients)</label>
                          <input value={systemConfig.pause_reason}
                            onChange={(e) => setSystemConfig((s) => ({ ...s, pause_reason: e.target.value }))}
                            placeholder="ex. Maintenance en cours, réouverture prévue demain..."
                            className="w-full rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition" />
                        </div>
                      )}

                      <button type="button" onClick={saveSystemConfig} disabled={savingConfig}
                        className="mt-4 flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-5 py-2.5 text-sm font-bold text-white shadow-[0_4px_16px_rgba(14,165,233,0.3)] hover:shadow-[0_6px_20px_rgba(14,165,233,0.4)] hover:-translate-y-0.5 transition disabled:opacity-60 cursor-pointer">
                        {savingConfig ? <><span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />Enregistrement...</> : "Enregistrer"}
                      </button>
                    </div>
                  </div>

                  {/* ── Section 2: Super Administrateurs ── */}
                  <div className="overflow-hidden rounded-3xl border border-sky-100/80 bg-white shadow-[0_4px_20px_rgba(14,165,233,0.06)]">
                    <div className="h-[3px] bg-gradient-to-r from-indigo-400 via-violet-500 to-purple-400" />
                    <div className="p-6">
                      <div className="flex items-center gap-3 mb-5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 text-indigo-600">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-slate-900">Super Administrateurs</h3>
                          <p className="text-xs text-slate-400 mt-0.5">Gérez les comptes avec accès complet à la plateforme.</p>
                        </div>
                        <span className="ml-auto rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-1 text-[11px] font-black text-indigo-600">{superAdmins.length}</span>
                      </div>

                      {/* Existing super admins */}
                      <div className="space-y-2 mb-5">
                        {superAdmins.length === 0 && (
                          <p className="text-xs text-slate-400 text-center py-4">Aucun super admin trouvé.</p>
                        )}
                        {superAdmins.map((sa) => {
                          const initials = `${(sa.first_name?.[0] ?? "S").toUpperCase()}${(sa.last_name?.[0] ?? "A").toUpperCase()}`;
                          const isSelf = Number(sa.id) === Number(session?.userId);
                          return (
                            <div key={sa.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${isSelf ? "border-indigo-200 bg-indigo-50/50" : "border-slate-100 bg-slate-50/40"}`}>
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-black text-white shadow-sm">{initials}</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800 truncate">{sa.first_name} {sa.last_name} {isSelf && <span className="ml-1 text-[10px] font-black text-indigo-500 bg-indigo-100 px-1.5 py-0.5 rounded-full">Vous</span>}</p>
                                <p className="text-[11px] text-slate-400" dir="ltr">{sa.phone}</p>
                              </div>
                              <p className="text-[10px] text-slate-400 shrink-0">{formatDate(sa.date_joined, i18n.language)}</p>
                              {!isSelf && (
                                <button type="button" onClick={() => deleteSuperAdmin(sa.id)}
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-rose-100 bg-white text-rose-400 hover:bg-rose-50 transition">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Create form */}
                      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4 space-y-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-500 mb-1">Ajouter un super admin</p>
                        <div className="grid grid-cols-2 gap-3">
                          <TextInput label="Nom" value={saForm.last_name} onChange={(v) => setSaForm((s) => ({ ...s, last_name: v }))} placeholder="Bensalem" />
                          <TextInput label="Prénom" value={saForm.first_name} onChange={(v) => setSaForm((s) => ({ ...s, first_name: v }))} placeholder="Karim" />
                        </div>
                        <TextInput label="Téléphone" value={saForm.phone} onChange={(v) => setSaForm((s) => ({ ...s, phone: v }))} placeholder="0773 000 000" />
                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1.5">Code secret (6 chiffres)</label>
                          <div className="flex gap-2">
                            <input value={saForm.secret_code} onChange={(e) => setSaForm((s) => ({ ...s, secret_code: e.target.value }))}
                              placeholder="123456" maxLength={6}
                              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-mono outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition" />
                            <button type="button" onClick={() => setSaForm((s) => ({ ...s, secret_code: String(Math.floor(100000 + Math.random() * 900000)) }))}
                              className="rounded-xl bg-indigo-500 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-600 transition">Générer</button>
                          </div>
                        </div>
                        <button type="button" onClick={createSuperAdmin} disabled={savingSa || !saForm.phone.trim() || !saForm.secret_code.trim()}
                          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 py-2.5 text-sm font-bold text-white shadow-[0_4px_16px_rgba(99,102,241,0.3)] hover:shadow-[0_6px_20px_rgba(99,102,241,0.4)] hover:-translate-y-0.5 transition disabled:opacity-60 cursor-pointer">
                          {savingSa ? <><span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />Création...</> : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>Créer le super admin</>}
                        </button>
                      </div>
                    </div>
                  </div>

                  </div>{/* end xl:grid-cols-2 */}

                  {/* ── Section 3: Informations système ── */}
                  <div className="overflow-hidden rounded-3xl border border-sky-100/80 bg-white shadow-[0_4px_20px_rgba(14,165,233,0.06)]">
                    <div className="h-[3px] bg-gradient-to-r from-slate-300 via-slate-400 to-slate-300" />
                    <div className="p-6">
                      <div className="flex items-center gap-3 mb-5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 border border-slate-100 text-slate-500">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-slate-900">Informations système</h3>
                          <p className="text-xs text-slate-400 mt-0.5">Constantes de la plateforme (lecture seule).</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {[
                          { label: "Établissements", value: String(establishments.length) },
                          { label: "Assistants actifs", value: String(assistants.length) },
                        ].map((info) => (
                          <div key={info.label} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 text-center">
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{info.label}</p>
                            <p className="text-lg font-black text-slate-800 mt-1">{info.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* ── Modals ── */}
      {modeModalMode && (
        <ModalShell
          title={modeModalMode === "create" ? t("addMode") : t("editMode")}
          subtitle={modeModalMode === "create" ? t("modeModalCreateSubtitle") : t("modeModalEditSubtitle")}
          icon={Icons.washingMachine}
          onClose={() => setModeModalMode(null)}
        >
          <div className="grid gap-5">
            {/* Section 1 — Fiche technique */}
            <div className="grid gap-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-600">{t("modeSection1")}</p>
              <TextInput label={t("modeName")} value={modeForm.nom} onChange={(v) => setModeForm((s) => ({ ...s, nom: v }))} placeholder="ex. Lavage Délicat" />
              <TextInput label={`${t("modeName")} (AR)`} value={modeForm.nom_ar} onChange={(v) => setModeForm((s) => ({ ...s, nom_ar: v }))} placeholder="مثال: غسيل سريع" dir="rtl" />
              <div className="grid grid-cols-3 gap-3">
                <TextInput label={t("modeDurationField")} value={modeForm.duree} onChange={(v) => setModeForm((s) => ({ ...s, duree: v.replace(/[^0-9]/g, "") }))} placeholder="30" />
                <TextInput label={t("modePriceField")} value={modeForm.prix_base} onChange={(v) => setModeForm((s) => ({ ...s, prix_base: v.replace(/[^0-9.]/g, "") }))} placeholder="200" />
                <TextInput label={t("modeCapacityField")} value={modeForm.capacite_max} onChange={(v) => setModeForm((s) => ({ ...s, capacite_max: v.replace(/[^0-9.]/g, "") }))} placeholder="7" />
              </div>
            </div>

            {/* Section 2 — Pourquoi choisir ce mode */}
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">{t("modeSection2")}</p>
              <textarea
                value={modeForm.message_guide}
                onChange={(e) => setModeForm((s) => ({ ...s, message_guide: e.target.value }))}
                placeholder={t("modeWhyPlaceholder")}
                rows={2}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 hover:border-sky-200 resize-none"
              />
              <textarea
                value={modeForm.message_guide_ar}
                dir="rtl"
                onChange={(e) => setModeForm((s) => ({ ...s, message_guide_ar: e.target.value }))}
                placeholder="لماذا تختار هذا الوضع؟"
                rows={2}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 hover:border-sky-200 resize-none"
              />
            </div>

            {/* Section 3 — Textiles autorisés */}
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">{t("modeSection3")}</p>
              <TextInput label={t("modeAllowedField")} value={modeForm.types_vetements} onChange={(v) => setModeForm((s) => ({ ...s, types_vetements: v }))} placeholder="ex. Coton, T-shirts, Sous-vêtements" />
              <TextInput label={`${t("modeAllowedField")} (AR)`} value={modeForm.types_vetements_ar} onChange={(v) => setModeForm((s) => ({ ...s, types_vetements_ar: v }))} placeholder="مثال: قطن، قمصان، ملابس داخلية" dir="rtl" />
            </div>

            {/* Section 4 — À éviter + consigne */}
            <div className="rounded-2xl border border-rose-100 bg-rose-50/40 p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-600">{t("modeSection4")}</p>
              <TextInput label={t("modeForbiddenField")} value={modeForm.textiles_interdits} onChange={(v) => setModeForm((s) => ({ ...s, textiles_interdits: v }))} placeholder="ex. Laine, Soie, Cuir" />
              <TextInput label={`${t("modeForbiddenField")} (AR)`} value={modeForm.textiles_interdits_ar} onChange={(v) => setModeForm((s) => ({ ...s, textiles_interdits_ar: v }))} placeholder="مثال: صوف، حرير، جلد" dir="rtl" />
              <label className="block">
                <span className="block text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1.5">{t("modeSafetyField")}</span>
                <textarea
                  value={modeForm.consigne_securite}
                  onChange={(e) => setModeForm((s) => ({ ...s, consigne_securite: e.target.value }))}
                  placeholder={t("modeSafetyPlaceholder")}
                  rows={2}
                  className="w-full rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 resize-none"
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1.5">{t("modeSafetyField")} (AR)</span>
                <textarea
                  value={modeForm.consigne_securite_ar}
                  dir="rtl"
                  onChange={(e) => setModeForm((s) => ({ ...s, consigne_securite_ar: e.target.value }))}
                  placeholder="مثال: أفرغ الجيوب وأزل الرمل قبل الغسل."
                  rows={2}
                  className="w-full rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 resize-none"
                />
              </label>
            </div>

            <div className="mt-2 flex justify-end gap-3 border-t border-slate-100 pt-5">
              <button type="button" onClick={() => setModeModalMode(null)}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer">
                {t("cancel")}
              </button>
              <button type="button" onClick={saveMode} disabled={savingMode}
                className="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-6 py-2.5 text-sm font-bold text-white shadow-[0_4px_16px_rgba(14,165,233,0.3)] hover:shadow-[0_6px_20px_rgba(14,165,233,0.4)] hover:-translate-y-0.5 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                {modeModalMode === "create" ? t("createMode") : t("save")}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {establishmentModalMode && (
        <ModalShell
          title={establishmentModalMode === "create" ? "Nouvel établissement" : "Modifier l'établissement"}
          subtitle={establishmentModalMode === "create" ? "Configurez les informations de base et créez optionnellement un assistant." : "Mettez à jour les informations de l'établissement."}
          icon={Icons.building}
          onClose={() => setEstablishmentModalMode(null)}
        >
          {/* Section: Infos établissement */}
          <div className="mb-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-500 mb-3">Informations générales</p>
            <div className="grid gap-4">
              <TextInput label="Nom de l'établissement" value={establishmentForm.name} onChange={(v) => setEstablishmentForm((s) => ({ ...s, name: v }))} placeholder="ex. Laverie Centre-Ville" />
              <div className="grid grid-cols-2 gap-3">
                <TextInput label="Adresse" value={establishmentForm.address} onChange={(v) => setEstablishmentForm((s) => ({ ...s, address: v }))} placeholder="Rue, quartier..." />
                <TextInput label="Ville" value={establishmentForm.city} onChange={(v) => setEstablishmentForm((s) => ({ ...s, city: v }))} placeholder="Alger, Oran..." />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <TextInput label="Nombre de postes (machines)" value={String(establishmentForm.machine_count)} onChange={(v) => setEstablishmentForm((s) => ({ ...s, machine_count: parseInt(v) || 0 }))} placeholder="0" />
                </div>
                <div className="mt-6 flex gap-1">
                  {[1,2,3,4,5,6,8,10].map((n) => (
                    <button key={n} type="button" onClick={() => setEstablishmentForm((s) => ({ ...s, machine_count: n }))}
                      className={`h-7 w-7 rounded-lg text-xs font-bold transition ${establishmentForm.machine_count === n ? "bg-sky-500 text-white shadow-sm" : "bg-sky-50 text-sky-600 hover:bg-sky-100"}`}>{n}</button>
                  ))}
                </div>
              </div>

              {/* Heures de travail */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1.5">Heure d'ouverture</span>
                  <input
                    type="time"
                    value={establishmentForm.opening_time}
                    onChange={(e) => setEstablishmentForm((s) => ({ ...s, opening_time: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 hover:border-sky-200"
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1.5">Heure de fermeture</span>
                  <input
                    type="time"
                    value={establishmentForm.closing_time}
                    onChange={(e) => setEstablishmentForm((s) => ({ ...s, closing_time: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 hover:border-sky-200"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Section: Modes de lavage attribués */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-600">Modes de lavage attribués</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Recherchez et ajoutez des modes, définissez un prix et un mode recommandé</p>
              </div>
              <span className="shrink-0 rounded-full bg-cyan-50 border border-cyan-100 px-2.5 py-1 text-[10px] font-black text-cyan-600">
                {Object.values(establishmentForm.modeAssignments).filter((a) => a.checked).length} sélectionné(s)
              </span>
            </div>

            {modes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center text-xs text-slate-400">
                Aucun mode global n'existe encore. Créez des modes dans l'onglet « Modes ».
              </div>
            ) : (
              <>
                {/* Barre de recherche + dropdown */}
                <div className="relative">
                  <div className="relative">
                    <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input
                      type="text"
                      value={modeAssignSearch}
                      onChange={(e) => { setModeAssignSearch(e.target.value); setModeDropdownOpen(true); }}
                      onFocus={() => setModeDropdownOpen(true)}
                      placeholder="Rechercher un mode à ajouter..."
                      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 placeholder:text-slate-300"
                    />
                  </div>
                  {modeDropdownOpen && (() => {
                    const available = modes.filter((m) =>
                      !establishmentForm.modeAssignments[m.id]?.checked &&
                      m.nom.toLowerCase().includes(modeAssignSearch.toLowerCase())
                    );
                    return (
                      <>
                        <div className="fixed inset-0 z-[70]" onClick={() => setModeDropdownOpen(false)} />
                        <div className="absolute left-0 right-0 top-full z-[80] mt-2 max-h-56 overflow-y-auto rounded-2xl border border-slate-100 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.12)] animate-scale-in origin-top">
                          {available.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-slate-400">Aucun mode disponible</div>
                          ) : available.map((mode) => (
                            <button
                              key={mode.id}
                              type="button"
                              onClick={() => {
                                setEstablishmentForm((s) => ({
                                  ...s,
                                  modeAssignments: { ...s.modeAssignments, [mode.id]: { checked: true, price: String(mode.prix_base ?? ""), recommande: false } },
                                }));
                                setModeAssignSearch("");
                                setModeDropdownOpen(false);
                              }}
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-cyan-50/60"
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-50 to-cyan-50 border border-sky-100 text-sky-600">{Icons.washingMachine}</div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-black text-slate-800 truncate">{mode.nom}</p>
                                <p className="text-[10px] text-slate-400">{mode.duree} min · base {Number(mode.prix_base).toLocaleString("fr-FR")} DA</p>
                              </div>
                              <span className="shrink-0 text-cyan-500">{Icons.plus}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Liste des modes sélectionnés */}
                <div className="mt-3 space-y-2">
                  {modes.filter((m) => establishmentForm.modeAssignments[m.id]?.checked).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-4 text-center text-[11px] text-slate-400">
                      Aucun mode sélectionné. Utilisez la recherche ci-dessus.
                    </div>
                  ) : modes.filter((m) => establishmentForm.modeAssignments[m.id]?.checked).map((mode) => {
                    const assignment = establishmentForm.modeAssignments[mode.id];
                    const isRec = assignment?.recommande ?? false;
                    return (
                      <div key={mode.id} className={`rounded-2xl border p-3 transition ${isRec ? "border-amber-300 bg-amber-50/50" : "border-cyan-200 bg-cyan-50/40"}`}>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-50 to-cyan-50 border border-sky-100 text-sky-600">
                            {Icons.washingMachine}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black text-slate-800 truncate">{mode.nom} {isRec && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-600">Recommandé</span>}</p>
                            <p className="text-[10px] text-slate-400">{mode.duree} min · base {Number(mode.prix_base).toLocaleString("fr-FR")} DA</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={assignment?.price ?? ""}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9.]/g, "");
                                setEstablishmentForm((s) => ({
                                  ...s,
                                  modeAssignments: { ...s.modeAssignments, [mode.id]: { ...s.modeAssignments[mode.id], checked: true, price: val } },
                                }));
                              }}
                              placeholder={String(mode.prix_base ?? "")}
                              className="w-20 rounded-xl border border-cyan-200 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-900 text-right outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 transition"
                            />
                            <span className="text-[10px] font-bold text-slate-400">DA</span>
                            {/* Toggle recommandé (étoile) */}
                            <button
                              type="button"
                              title="Marquer comme recommandé"
                              onClick={() => setEstablishmentForm((s) => {
                                const next: Record<number, ModeAssignment> = {};
                                Object.entries(s.modeAssignments).forEach(([k, v]) => { next[Number(k)] = { ...v, recommande: false }; });
                                next[mode.id] = { ...s.modeAssignments[mode.id], recommande: !isRec };
                                return { ...s, modeAssignments: next };
                              })}
                              className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${isRec ? "border-amber-300 bg-amber-100 text-amber-500" : "border-slate-200 bg-white text-slate-300 hover:text-amber-400 hover:border-amber-200"}`}
                            >
                              <svg className="h-4 w-4" fill={isRec ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5l2.2 4.46 4.92.72-3.56 3.47.84 4.9-4.4-2.31-4.4 2.31.84-4.9L4.36 8.68l4.92-.72 2.2-4.46z" /></svg>
                            </button>
                            {/* Retirer */}
                            <button
                              type="button"
                              title="Retirer"
                              onClick={() => setEstablishmentForm((s) => {
                                const next = { ...s.modeAssignments };
                                delete next[mode.id];
                                return { ...s, modeAssignments: next };
                              })}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Section: Assistant optionnel (create only) */}
          {establishmentModalMode === "create" && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Assistant</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Créez un assistant pour cet établissement maintenant</p>
                </div>
                <button type="button" onClick={() => setEstablishmentForm((s) => ({ ...s, withAssistant: !s.withAssistant }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${establishmentForm.withAssistant ? "bg-indigo-500" : "bg-slate-200"}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${establishmentForm.withAssistant ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              {establishmentForm.withAssistant && (
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3 animate-fade-in">
                  <div className="grid grid-cols-2 gap-3">
                    <TextInput label="Nom" value={establishmentForm.assistantLastName} onChange={(v) => setEstablishmentForm((s) => ({ ...s, assistantLastName: v }))} placeholder="Bensalem" />
                    <TextInput label="Prénom" value={establishmentForm.assistantFirstName} onChange={(v) => setEstablishmentForm((s) => ({ ...s, assistantFirstName: v }))} placeholder="Karim" />
                  </div>
                  <TextInput label="Téléphone" value={establishmentForm.assistantPhone} onChange={(v) => setEstablishmentForm((s) => ({ ...s, assistantPhone: v }))} placeholder="0555 123 456" />
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Code secret (6 chiffres)</label>
                    <div className="flex gap-2">
                      <input value={establishmentForm.assistantSecretCode} onChange={(e) => setEstablishmentForm((s) => ({ ...s, assistantSecretCode: e.target.value }))}
                        placeholder="123456" maxLength={6}
                        className="flex-1 rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-sm font-mono outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition" />
                      <button type="button" onClick={() => setEstablishmentForm((s) => ({ ...s, assistantSecretCode: String(Math.floor(100000 + Math.random() * 900000)) }))}
                        className="rounded-xl bg-indigo-500 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-600 transition">
                        Générer
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section: Assistants affectés (recherche multi-sélection) */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Assistants affectés</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Recherchez et rattachez un ou plusieurs assistants existants</p>
              </div>
              <span className="shrink-0 rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-1 text-[10px] font-black text-indigo-600">
                {establishmentForm.assistantIds.length} affecté(s)
              </span>
            </div>

            {/* Barre de recherche + dropdown */}
            <div className="relative">
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                  type="text"
                  value={assistantAssignSearch}
                  onChange={(e) => { setAssistantAssignSearch(e.target.value); setAssistantDropdownOpen(true); }}
                  onFocus={() => setAssistantDropdownOpen(true)}
                  placeholder="Rechercher un assistant (nom, téléphone)..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder:text-slate-300"
                />
              </div>
              {assistantDropdownOpen && (() => {
                const q = assistantAssignSearch.toLowerCase();
                const available = assistants.filter((a) =>
                  !establishmentForm.assistantIds.includes(a.id) &&
                  // Seuls les assistants NON affectés (ou déjà rattachés à cet établissement)
                  // peuvent être proposés : un assistant appartient à un seul établissement.
                  (!a.establishment || a.establishment === establishmentForm.id) &&
                  (`${a.first_name} ${a.last_name}`.toLowerCase().includes(q) || (a.phone ?? "").includes(assistantAssignSearch))
                );
                return (
                  <>
                    <div className="fixed inset-0 z-[70]" onClick={() => setAssistantDropdownOpen(false)} />
                    <div className="absolute left-0 right-0 top-full z-[80] mt-2 max-h-56 overflow-y-auto rounded-2xl border border-slate-100 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.12)] animate-scale-in origin-top">
                      {available.length === 0 ? (
                        <div className="px-4 py-6 text-center text-xs text-slate-400">Aucun assistant disponible</div>
                      ) : available.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            setEstablishmentForm((s) => ({ ...s, assistantIds: [...s.assistantIds, a.id] }));
                            setAssistantAssignSearch("");
                            setAssistantDropdownOpen(false);
                          }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-indigo-50/60"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 text-[11px] font-black text-white shadow-sm">
                            {(a.first_name?.[0] ?? "A").toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black text-slate-800 truncate">{a.first_name} {a.last_name}</p>
                            <p className="text-[10px] text-slate-400">{a.phone}{a.establishment && a.establishment !== establishmentForm.id ? ` · actuellement: ${a.establishment_name ?? "autre"}` : ""}</p>
                          </div>
                          <span className="shrink-0 text-indigo-500">{Icons.plus}</span>
                        </button>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Liste des assistants sélectionnés */}
            <div className="mt-3 space-y-2">
              {establishmentForm.assistantIds.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-4 text-center text-[11px] text-slate-400">
                  Aucun assistant affecté. Utilisez la recherche ci-dessus.
                </div>
              ) : establishmentForm.assistantIds.map((id) => {
                const a = assistants.find((x) => x.id === id);
                if (!a) return null;
                return (
                  <div key={id} className="flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 px-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 text-xs font-black text-white shadow-sm">
                      {(a.first_name?.[0] ?? "A").toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate">{a.first_name} {a.last_name}</p>
                      <p className="text-[10px] text-slate-400">{a.phone}</p>
                    </div>
                    <button
                      type="button"
                      title="Retirer"
                      onClick={() => setEstablishmentForm((s) => ({ ...s, assistantIds: s.assistantIds.filter((x) => x !== id) }))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-5">
            <button type="button" onClick={() => setEstablishmentModalMode(null)}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer">
              Annuler
            </button>
            <button type="button" onClick={saveEstablishment}
              className="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-6 py-2.5 text-sm font-bold text-white shadow-[0_4px_16px_rgba(14,165,233,0.3)] hover:shadow-[0_6px_20px_rgba(14,165,233,0.4)] hover:-translate-y-0.5 transition cursor-pointer">
              {establishmentModalMode === "create" ? "Créer l'établissement" : "Enregistrer les modifications"}
            </button>
          </div>
        </ModalShell>
      )}

      {assistantModalMode && (
        <ModalShell
          title={assistantModalMode === "create" ? "Nouvel assistant" : "Modifier l'assistant"}
          subtitle={assistantModalMode === "create" ? "Créez un compte assistant et affectez-le à un établissement." : "Modifiez les informations de l'assistant."}
          icon={Icons.users}
          onClose={() => setAssistantModalMode(null)}
        >
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
            <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-5">
              <button type="button" onClick={() => setAssistantModalMode(null)}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer">Annuler</button>
              <button type="button" onClick={saveAssistant}
                className="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-6 py-2.5 text-sm font-bold text-white shadow-[0_4px_16px_rgba(14,165,233,0.3)] hover:shadow-[0_6px_20px_rgba(14,165,233,0.4)] hover:-translate-y-0.5 transition cursor-pointer">
                {assistantModalMode === "create" ? "Créer l'assistant" : "Enregistrer"}
              </button>
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
    MAINTENANCE: "bg-violet-100 text-violet-700 border-violet-200",
  };
  const labelMap: Record<string, string> = { PAYE: "Payé", EN_ATTENTE: "En attente", ANNULE: "Annulé", MAINTENANCE: "Maintenance" };
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

function ModalShell({ title, subtitle, icon, children, onClose }: { title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 px-0 sm:px-4 py-0 sm:py-6 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl sm:rounded-3xl rounded-t-3xl border border-sky-100/60 bg-white shadow-[0_32px_80px_rgba(14,165,233,0.18)] animate-scale-in max-h-[92dvh] overflow-hidden flex flex-col">
        {/* Premium header */}
        <div className="relative overflow-hidden bg-gradient-to-r from-sky-500 via-indigo-500 to-cyan-500 px-6 py-5 shrink-0">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "18px 18px" }} />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {icon && (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white">
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                <h3 className="text-lg font-black text-white leading-tight truncate">{title}</h3>
                {subtitle && <p className="text-xs text-white/70 mt-0.5">{subtitle}</p>}
              </div>
            </div>
            <button type="button" onClick={onClose}
              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition cursor-pointer">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 p-6">{children}</div>
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder, dir }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; dir?: "ltr" | "rtl" }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1.5">{label}</span>
      <input
        value={value}
        dir={dir}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-300
          focus:border-sky-400 focus:ring-2 focus:ring-sky-100 hover:border-sky-200"
      />
    </label>
  );
}

function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ label: string; value: string }> }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1.5">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition
          focus:border-sky-400 focus:ring-2 focus:ring-sky-100 hover:border-sky-200 cursor-pointer"
      >
        <option value="">— Sélectionner —</option>
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </label>
  );
}