import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { authHeader, clearAuthSession, getAuthSession } from "../auth/session";
// Local DetailCard (inlined) to avoid cross-file resolution issues in TS server
function DetailCard({
  label,
  value,
  accent = "sky",
  className,
}: {
  label: string;
  value: any;
  accent?: "sky" | "emerald" | "rose" | "amber";
  className?: string;
}) {
  const accentClasses = {
    sky: "border-sky-100 bg-sky-50/70 text-sky-700",
    emerald: "border-emerald-100 bg-emerald-50/70 text-emerald-700",
    rose: "border-rose-100 bg-rose-50/70 text-rose-700",
    amber: "border-amber-100 bg-amber-50/70 text-amber-800",
  } as const;

  return (
    <div className={`rounded-[1.5rem] border p-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)] ${accentClasses[accent]} ${className ?? ""}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.3em] opacity-80">{label}</p>
      <p className="mt-2 text-lg font-black leading-snug text-slate-900">{value}</p>
    </div>
  );
}
import { LANGUAGE_STORAGE_KEY, type AppLanguage } from "../i18n";
import logoImg from "../assets/logo.png";

import {
  AdminValidationPanel,
  isBookingReferenceQuery,
} from "../components/admin/AdminValidationPanel";
import {
  ParsedWhatsAppQr,
  WhatsAppQrScanner,
} from "../components/WhatsAppQrScanner";
import { TicketPrinter, TicketReceipt } from "../components/TicketPrinter";
import {
  readApiErrorPayload,
  resolveApiErrorMessage,
  validateAdminCustomerForm,
} from "../utils/apiErrors";
import { normalizeClientSearchQuery, parseUserListPayload } from "../utils/usersApi";
import { normalizePhoneInput } from "../utils/validation";

const CREATION_TICKET_STORAGE_KEY = "chrono-dz:last-created-ticket";

/* ──────────────────────── SVG Icons ──────────────────────── */
const Icons = {
  home: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v1m-14 0v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" /></svg>,
  building: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
  users: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" /></svg>,
  history: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>,
  chart: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  settings: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  logout: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
  refresh: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
  menu: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
};

type AdminAssistantPageProps = {
  establishmentName: string;
  establishmentId?: number | null;
};

type Tab = "creation" | "clients" | "calendar" | "validation" | "machines";

type Customer = {
  id: number;
  phone: string;
  first_name: string;
  last_name: string;
  role: string;
  date_joined: string;
  secret_code_preview?: string;
  secret_code_plain?: string;
};

type Resource = {
  id: number;
  label: string;
  status: "ACTIF" | "EN_PANNE";
  establishment_name: string;
};

type Booking = {
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
  status: "EN_ATTENTE" | "PAYE" | "ANNULE" | "MAINTENANCE";
  total_price: string;
  validated_by_phone?: string;
  validated_at?: string;
};

const CALENDAR_START_MINUTES = 8 * 60;
const CALENDAR_END_MINUTES = 22 * 60;
const CALENDAR_STEP_MINUTES = 15;

function formatMinutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function toMinutes(timeValue: string) {
  const [hours, minutes] = timeValue.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function overlapsSlot(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB;
}

function getBookingClientName(booking: Booking) {
  const nameParts = [booking.user_first_name, booking.user_last_name].filter(Boolean);
  if (nameParts.length > 0) {
    return nameParts.join(" ");
  }

  return booking.user_phone;
}

const ADMIN_TAB_PATHS: Record<Tab, string> = {
  creation: "/admin/dashboard/creation",
  clients: "/admin/dashboard/creation",
  calendar: "/admin/dashboard/calendar",
  validation: "/admin/dashboard/validation",
  machines: "/admin/dashboard/machines",
};

function getTabFromPath(pathname: string): Tab {
  if (pathname.includes("/validation")) {
    return "validation";
  }

  if (pathname.includes("/calendar")) {
    return "calendar";
  }

  if (pathname.includes("/machines")) {
    return "machines";
  }

  return "creation";
}

export function AdminAssistantPage({
  establishmentName,
  establishmentId,
}: AdminAssistantPageProps) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const isArabic = i18n.language === "ar";
  const isTicketRoute = location.pathname.includes("/ticket");
  const ticketCustomerId = useMemo(() => {
    const match = location.pathname.match(/\/admin\/dashboard\/customers\/(\d+)\/ticket$/);
    return match ? Number(match[1]) : null;
  }, [location.pathname]);
  const estId = establishmentId || 1;

  // Sidebar collapsed on mobile
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Navigation (left sidebar menu)
  const [activeTab, setActiveTab] = useState<Tab>(() => getTabFromPath(location.pathname));

  // expose a ref to control ticket preview printing
  const ticketPreviewRef = useRef<HTMLDivElement | null>(null);

  // Notifications
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setErrorMsg(null);
    window.setTimeout(() => setSuccessMsg(null), 4000);
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setSuccessMsg(null);
    window.setTimeout(() => setErrorMsg(null), 4000);
  };

  // Shared state triggers
  const [refreshCounter, setRefreshCounter] = useState(0);
  const triggerRefresh = () => setRefreshCounter((v) => v + 1);

  // Tab 1: Clients State (creation)
  const [searchClientQuery, setSearchClientQuery] = useState("");
  const [clients, setClients] = useState<Customer[]>([]);
  const [clientSearchError, setClientSearchError] = useState<string | null>(null);
  const [loadingClients, setLoadingClients] = useState(false);
  const [creationStep, setCreationStep] = useState<"form" | "ticket">("form");
  const [ticketPreview, setTicketPreview] = useState<TicketReceipt | null>(null);
  const [createLastName, setCreateLastName] = useState("");
  const [createFirstName, setCreateFirstName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createSecretCode, setCreateSecretCode] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [clientQrScannerOpen, setClientQrScannerOpen] = useState(false);
  const [resolvingClientQr, setResolvingClientQr] = useState(false);
  const clientQrScanHandledRef = useRef(false);
  const validationQrHandledRef = useRef(false);

  // Tab 3: Calendar State
  const calendarScrollRef = useRef<HTMLDivElement | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    // Format YYYY-MM-DD in local timezone
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });
  const [resources, setResources] = useState<Resource[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  // Manual booking creation
  // Mobile calendar: which resource column is shown on small screens
  const [mobileSelectedResourceId, setMobileSelectedResourceId] = useState<number | null>(null);
  const [isSmallScreen, setIsSmallScreen] = useState(() => window.innerWidth < 1024);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const handler = (e: MediaQueryListEvent) => setIsSmallScreen(e.matches);
    mq.addEventListener("change", handler);
    setIsSmallScreen(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const [selectedSlotForBooking, setSelectedSlotForBooking] = useState<{
    resource: Resource;
    time: string;
  } | null>(null);
  const [bookingType, setBookingType] = useState<"appointment" | "maintenance" | null>(null);
  const [selectedClientForBooking, setSelectedClientForBooking] = useState<Customer | null>(null);
  const [bookingDuration, setBookingDuration] = useState<15 | 30 | 60>(30);
  const [selectedWashMode, setSelectedWashMode] = useState<"rapid" | "express" | "premium" | "vip">("express");
  const [maintenanceDuration, setMaintenanceDuration] = useState<number>(15);
  const [paymentStatus, setPaymentStatus] = useState<"EN_ATTENTE" | "PAYE">("EN_ATTENTE");
  const [searchClientForBooking, setSearchClientForBooking] = useState("");
  const [clientsForBookingResults, setClientsForBookingResults] = useState<Customer[]>([]);
  const [submittingBooking, setSubmittingBooking] = useState(false);

  // Quick Client Creation inside Modal
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickLastName, setQuickLastName] = useState("");
  const [quickFirstName, setQuickFirstName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickSecretCode, setQuickSecretCode] = useState("");
  const [quickSubmitting, setQuickSubmitting] = useState(false);

  // Tab 2: Validation & Scan State
  const [scanStatus, setScanStatus] = useState("idle");
  const [searchBookingQuery, setSearchBookingQuery] = useState("");
  const [foundBookings, setFoundBookings] = useState<Booking[]>([]);
  const [foundValidationClients, setFoundValidationClients] = useState<Customer[]>([]);
  const [loadingValidationSearch, setLoadingValidationSearch] = useState(false);
  const [selectedBookingDetails, setSelectedBookingDetails] = useState<Booking | null>(null);
  const [validationState, setValidationState] = useState<"idle" | "submitting">("idle");

  // Receipt Preview and Printing
  const [receiptData, setReceiptData] = useState<TicketReceipt | null>(null);
  const [printingBookingId, setPrintingBookingId] = useState<number | null>(null);
  const navigationState = location.state as { receipt?: TicketReceipt } | null;
  const storedTicketReceipt = useMemo<TicketReceipt | null>(() => {
    try {
      const raw = sessionStorage.getItem(CREATION_TICKET_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as TicketReceipt;
      return parsed;
    } catch {
      return null;
    }
  }, []);
  // Only use the stored/navigation receipt if we DON'T have a customerId in the URL,
  // or if the receipt was explicitly passed via navigation state (i.e. right after creation).
  // When navigating from customer detail page, ticketCustomerId is set and no receipt is passed,
  // so we must always fetch from the API to get the real customer data.
  const initialTicketReceipt = useMemo<TicketReceipt | null>(() => {
    // If receipt was explicitly passed via navigation state, use it (happens after client creation)
    if (navigationState?.receipt) {
      return navigationState.receipt;
    }
    // If there's a customerId in the URL, don't use sessionStorage receipt 
    // as it may belong to a different customer - force an API fetch instead
    if (ticketCustomerId) {
      return null;
    }
    // Fallback to sessionStorage receipt (no customerId in URL)
    return storedTicketReceipt;
  }, [navigationState?.receipt, ticketCustomerId, storedTicketReceipt]);
  const [ticketCustomer, setTicketCustomer] = useState<Customer | null>(null);
  const [ticketLoading, setTicketLoading] = useState(Boolean(isTicketRoute && !navigationState?.receipt));
  const [ticketError, setTicketError] = useState<string | null>(null);

  // Tab 4: Machines State
  const [loadingMachines, setLoadingMachines] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [assistantDisplayName, setAssistantDisplayName] = useState("Assistant");
  const [resourcePendingDelete, setResourcePendingDelete] = useState<Resource | null>(null);
  const [renamingResourceId, setRenamingResourceId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const session = getAuthSession();
  const userPhone = session?.phone || "0000000000";
  const isSuperAdmin = session?.role === "SUPER_ADMIN";

  const handleLogout = () => {
    clearAuthSession();
    navigate("/staff/login", { replace: true });
  };

  const handleLanguageChange = (nextLanguage: AppLanguage) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    setLanguageMenuOpen(false);
    void i18n.changeLanguage(nextLanguage);
  };

  useEffect(() => {
    const nextTab = getTabFromPath(location.pathname);
    setActiveTab((currentTab) => (currentTab === nextTab ? currentTab : nextTab));
  }, [location.pathname]);

  // Helper date lists for direct selector (next 7 days)
  const quickDates = useMemo(() => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const value = `${year}-${month}-${day}`;

      let weekday = d.toLocaleDateString(i18n.language === "ar" ? "ar-DZ" : "fr-FR", {
        weekday: "short",
      });
      let label = d.toLocaleDateString(i18n.language === "ar" ? "ar-DZ" : "fr-FR", {
        day: "numeric",
        month: "short",
      });

      dates.push({ value, label, weekday });
    }
    return dates;
  }, [i18n.language]);

  useEffect(() => {
    if (!session?.userId) {
      return;
    }

    let active = true;

    const loadAssistantProfile = async () => {
      try {
        const response = await fetch(`/api/users/${session.userId}/`, {
          headers: authHeader(),
        });

        if (!response.ok || !active) {
          return;
        }

        const payload = (await response.json()) as { first_name?: string; last_name?: string };
        const nameParts = [payload.first_name, payload.last_name].filter(Boolean);
        setAssistantDisplayName(nameParts.length > 0 ? nameParts.join(" ") : session.phone || "Assistant");
      } catch {
        if (active) {
          setAssistantDisplayName(session.phone || "Assistant");
        }
      }
    };

    void loadAssistantProfile();

    return () => {
      active = false;
    };
  }, [session?.phone, session?.userId]);

  // Load Resources & Bookings for Calendar & Machines tabs
  useEffect(() => {
    if (isTicketRoute) {
      return;
    }

    let active = true;
    async function loadData() {
      setLoadingCalendar(true);
      try {
        const headers = { ...authHeader() };
        const [resRes, bookRes] = await Promise.all([
          fetch(`/api/resources/?establishment_id=${estId}`, { headers }),
          fetch(`/api/bookings/?establishment_id=${estId}&date=${selectedDate}`, {
            headers,
          }),
        ]);

        if (resRes.ok && bookRes.ok && active) {
          const resData = await resRes.json();
          const bookData = await bookRes.json();
          setResources(resData);
          setBookings(bookData);
          // Auto-select first resource for mobile if none chosen yet
          if (resData.length > 0) {
            setMobileSelectedResourceId((prev) => prev ?? resData[0].id);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setLoadingCalendar(false);
      }
    }
    loadData();
    return () => {
      active = false;
    };
  }, [estId, selectedDate, refreshCounter]);

  // Auto-scroll calendar: today → current time, other dates → top (08:00)
  useEffect(() => {
    if (loadingCalendar || activeTab !== "calendar") return;
    const el = calendarScrollRef.current;
    if (!el) return;
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const ROW_HEIGHT = 88;
    if (selectedDate === todayKey) {
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const targetMins = Math.max(CALENDAR_START_MINUTES, Math.floor((nowMins - 15) / 15) * 15);
      const rowIndex = Math.floor((targetMins - CALENDAR_START_MINUTES) / CALENDAR_STEP_MINUTES);
      el.scrollTop = rowIndex * ROW_HEIGHT;
    } else {
      el.scrollTop = 0;
    }
  }, [loadingCalendar, activeTab, selectedDate]);

  // Clients Tab search effect
  useEffect(() => {
    if (isTicketRoute) {
      return;
    }

    let active = true;
    if (activeTab !== "clients" && activeTab !== "calendar" && activeTab !== "creation") return;

    async function fetchClients() {
      setLoadingClients(true);
      setClientSearchError(null);
      try {
        const normalizedSearch = normalizeClientSearchQuery(searchClientQuery);
        const params = new URLSearchParams({ role: "CUSTOMER" });
        params.set("establishment_id", String(estId));
        if (normalizedSearch) {
          params.set("search", normalizedSearch);
        }

        const res = await fetch(`/api/users/?${params.toString()}`, {
          headers: authHeader(),
        });

        if (!active) {
          return;
        }

        if (!res.ok) {
          const payload = await readApiErrorPayload(res);
          setClients([]);
          setClientSearchError(
            resolveApiErrorMessage(payload, "adminGeneral", t, {
              status: res.status,
            })
          );
          return;
        }

        const data = await res.json();
        setClients(parseUserListPayload(data));
      } catch (err) {
        console.error(err);
        if (active) {
          setClients([]);
          setClientSearchError(t("errors.networkError"));
        }
      } finally {
        if (active) setLoadingClients(false);
      }
    }

    const timer = setTimeout(fetchClients, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchClientQuery, activeTab, refreshCounter, isTicketRoute, estId, t]);

  // Manual Booking client search effect
  useEffect(() => {
    if (isTicketRoute) {
      return;
    }

    let active = true;
    if (!selectedSlotForBooking) return;

    async function fetchClientsForBooking() {
      try {
        const normalizedSearch = normalizeClientSearchQuery(searchClientForBooking);
        const params = new URLSearchParams({ role: "CUSTOMER" });
        params.set("establishment_id", String(estId));
        if (normalizedSearch) {
          params.set("search", normalizedSearch);
        }

        const res = await fetch(`/api/users/?${params.toString()}`, {
          headers: authHeader(),
        });
        if (res.ok && active) {
          const data = await res.json();
          setClientsForBookingResults(parseUserListPayload(data));
        }
      } catch (err) {
        console.error(err);
      }
    }

    const timer = setTimeout(fetchClientsForBooking, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchClientForBooking, selectedSlotForBooking, estId]);

  // Validation search: CRN-* → bookings only; else → clients (name / phone)
  useEffect(() => {
    if (isTicketRoute) {
      return;
    }

    let active = true;
    if (activeTab !== "validation") return;

    const raw = searchBookingQuery.trim();
    if (!raw) {
      setFoundBookings([]);
      setFoundValidationClients([]);
      return;
    }

    const bookingRefMode = isBookingReferenceQuery(raw);

    async function runValidationSearch() {
      setLoadingValidationSearch(true);
      try {
        if (bookingRefMode) {
          setFoundValidationClients([]);
          const res = await fetch(`/api/bookings/?search=${encodeURIComponent(raw)}`, {
            headers: authHeader(),
          });
          if (res.ok && active) {
            const data = await res.json();
            const list = Array.isArray(data) ? data : data.results ?? [];
            setFoundBookings(list);
          }
        } else if (raw.length < 2) {
          setFoundBookings([]);
          setFoundValidationClients([]);
        } else {
          setFoundBookings([]);
          const normalized = normalizeClientSearchQuery(raw);
          const res = await fetch(
            `/api/users/?search=${encodeURIComponent(normalized)}&role=CUSTOMER&establishment_id=${estId}`,
            { headers: authHeader() }
          );
          if (res.ok && active) {
            setFoundValidationClients(parseUserListPayload(await res.json()) as Customer[]);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setLoadingValidationSearch(false);
      }
    }

    const timer = setTimeout(runValidationSearch, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchBookingQuery, activeTab, isTicketRoute, estId]);

  useEffect(() => {
    if (activeTab !== "validation") return;
    if (!isBookingReferenceQuery(searchBookingQuery)) return;
    if (foundBookings.length === 1) {
      setSelectedBookingDetails(foundBookings[0]);
    }
  }, [foundBookings, searchBookingQuery, activeTab]);

  useEffect(() => {
    // Always fetch real customer data from API when we have a customerId in the URL
    // and no explicit receipt was passed via navigation state
    if (!isTicketRoute || !ticketCustomerId || navigationState?.receipt) {
      return;
    }

    let active = true;
    setTicketLoading(true);
    setTicketError(null);

    const loadTicketCustomer = async () => {
      try {
        const response = await fetch(`/api/users/${ticketCustomerId}/`, {
          headers: authHeader(),
        });

        if (!response.ok) {
          throw new Error("Client introuvable.");
        }

        const payload = (await response.json()) as Customer;
        if (active) {
          setTicketCustomer(payload);
        }
      } catch (errorValue) {
        if (active) {
          setTicketError(errorValue instanceof Error ? errorValue.message : "Erreur de chargement.");
        }
      } finally {
        if (active) {
          setTicketLoading(false);
        }
      }
    };

    void loadTicketCustomer();

    return () => {
      active = false;
    };
  }, [isTicketRoute, ticketCustomerId, navigationState?.receipt]);

  const handleValidationScan = useCallback(
    async (payload: ParsedWhatsAppQr) => {
      if (payload.kind === "booking-validation") {
        validationQrHandledRef.current = false;
        setSearchBookingQuery(payload.bookingId);
        navigate(ADMIN_TAB_PATHS.validation, { replace: true });
        showSuccess(t("scanDetected"));
        return;
      }

      if (payload.kind !== "login") {
        showError(t("unknownQrFormat"));
        return;
      }

      if (validationQrHandledRef.current) {
        return;
      }

      validationQrHandledRef.current = true;
      setResolvingClientQr(true);
      try {
        const response = await fetch("/api/users/resolve-login-qr/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeader(),
          },
          body: JSON.stringify({
            qr_text: payload.rawText,
            phone: payload.phone,
            secret_code: payload.secretCode,
          }),
        });

        if (!response.ok) {
          const err = await readApiErrorPayload(response);
          throw new Error(
            resolveApiErrorMessage(err, "adminGeneral", t, {
              status: response.status,
            })
          );
        }

        const data = (await response.json()) as {
          id: number;
          detail_url?: string;
        };
        navigate(data.detail_url || `/admin/dashboard/customers/${data.id}`);
        showSuccess("Client identifié — ouverture de la fiche.");
      } catch (errorValue) {
        validationQrHandledRef.current = false;
        showError(
          errorValue instanceof Error ? errorValue.message : t("errors.generic")
        );
      } finally {
        setResolvingClientQr(false);
      }
    },
    [navigate, t]
  );

  const handleClientLoginQrScan = useCallback(
    async (payload: ParsedWhatsAppQr) => {
      if (clientQrScanHandledRef.current) {
        return;
      }

      if (payload.kind === "booking-validation") {
        showError("Ce QR correspond à un rendez-vous. Utilisez l'onglet Rendez-vous.");
        return;
      }

      if (payload.kind !== "login") {
        showError(t("unknownQrFormat"));
        return;
      }

      clientQrScanHandledRef.current = true;
      setResolvingClientQr(true);
      try {
        const response = await fetch("/api/users/resolve-login-qr/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeader(),
          },
          body: JSON.stringify({
            qr_text: payload.rawText,
            phone: payload.phone,
            secret_code: payload.secretCode,
          }),
        });

        if (!response.ok) {
          const err = await readApiErrorPayload(response);
          throw new Error(
            resolveApiErrorMessage(err, "adminGeneral", t, {
              status: response.status,
            })
          );
        }

        const data = (await response.json()) as {
          id: number;
          detail_url?: string;
        };
        setClientQrScannerOpen(false);
        navigate(data.detail_url || `/admin/dashboard/customers/${data.id}`);
        showSuccess("Client identifié — ouverture de la fiche.");
      } catch (errorValue) {
        clientQrScanHandledRef.current = false;
        showError(
          errorValue instanceof Error
            ? errorValue.message
            : t("errors.generic")
        );
      } finally {
        setResolvingClientQr(false);
      }
    },
    [navigate, t]
  );

  const openClientQrScanner = () => {
    clientQrScanHandledRef.current = false;
    setClientQrScannerOpen(true);
  };

  const closeClientQrScanner = () => {
    clientQrScanHandledRef.current = false;
    setClientQrScannerOpen(false);
  };

  // Generate 15-minute slots from 08:00 to 22:00
  const slots = useMemo(() => {
    const list = [];
    for (let m = CALENDAR_START_MINUTES; m < CALENDAR_END_MINUTES; m += CALENDAR_STEP_MINUTES) {
      list.push(formatMinutesToTime(m));
    }
    return list;
  }, []);

  const activeResourcesCount = useMemo(
    () => resources.filter((resource) => resource.status === "ACTIF").length,
    [resources]
  );

  const activeBookings = useMemo(
    () => bookings.filter((booking) => booking.status !== "ANNULE"),
    [bookings]
  );

  // Add minutes helper
  const addMinutesToTime = (timeStr: string, mins: number): string => {
    const [h, m] = timeStr.split(":").map(Number);
    const total = h * 60 + m + mins;
    const newH = Math.floor(total / 60) % 24;
    const newM = total % 60;
    return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
  };

  // Save Manual Reservation
  const handleSaveManualBooking = async () => {
    if (!selectedSlotForBooking || !selectedClientForBooking) {
      showError(t("formRequired"));
      return;
    }

    setSubmittingBooking(true);
    try {
      // Calculate duration based on wash mode
      const modeDuration =
        selectedWashMode === "rapid" ? 15 :
        selectedWashMode === "express" ? 30 :
        selectedWashMode === "premium" ? 45 :
        selectedWashMode === "vip" ? 60 : 30;

      const totalPrice = modeDuration * 15;

      const startTime = selectedSlotForBooking.time;
      const endTime = addMinutesToTime(startTime, modeDuration);

      const payload = {
        resource: selectedSlotForBooking.resource.id,
        user: selectedClientForBooking.id,
        booking_date: selectedDate,
        start_time: startTime,
        end_time: endTime,
        status: paymentStatus,
        total_price: String(totalPrice),
        payment_method: "CASH",
      };

      const res = await fetch("/api/bookings/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader(),
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const createdBooking = await res.json();
        showSuccess(t("bookingSuccess"));
        setSelectedSlotForBooking(null);
        setBookingType(null);
        setSelectedClientForBooking(null);
        setSearchClientForBooking("");
        setSelectedWashMode("express");
        setPaymentStatus("EN_ATTENTE");
        triggerRefresh();

      } else {
        const errData = await res.json();
        showError(errData.detail || errData.resource?.[0] || t("bookingError"));
      }
    } catch (err) {
      showError(t("bookingError"));
    } finally {
      setSubmittingBooking(false);
    }
  };

  // Save Maintenance Booking
  const handleSaveMaintenanceBooking = async () => {
    if (!selectedSlotForBooking) {
      showError("Aucun créneau sélectionné");
      return;
    }

    setSubmittingBooking(true);
    try {
      const startTime = selectedSlotForBooking.time;
      const endTime = addMinutesToTime(startTime, maintenanceDuration);

      // For maintenance, we need to create a "system" user or use a specific maintenance status
      // Since the API expects a user, we'll use status "MAINTENANCE" or create with a special note
      const payload = {
        resource: selectedSlotForBooking.resource.id,
        user: null, // Maintenance doesn't need a user
        booking_date: selectedDate,
        start_time: startTime,
        end_time: endTime,
        status: "MAINTENANCE", // Special status for maintenance
        total_price: "0",
        payment_method: "CASH",
        notes: `Maintenance - Durée: ${maintenanceDuration} minutes`,
      };

      const res = await fetch("/api/bookings/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader(),
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showSuccess("Maintenance créée avec succès");
        setSelectedSlotForBooking(null);
        setBookingType(null);
        setMaintenanceDuration(15);
        triggerRefresh();
      } else {
        const errData = await res.json();
        showError(errData.detail || errData.resource?.[0] || "Erreur lors de la création de la maintenance");
      }
    } catch (err) {
      showError("Erreur lors de la création de la maintenance");
    } finally {
      setSubmittingBooking(false);
    }
  };

  // Register client inside booking modal
  const handleQuickCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const secret = quickSecretCode || String(Math.floor(100000 + Math.random() * 900000));
    const validationError = validateAdminCustomerForm(
      {
        firstName: quickFirstName,
        lastName: quickLastName,
        phone: quickPhone,
        secretCode: secret,
      },
      t
    );
    if (validationError) {
      showError(validationError);
      return;
    }

    setQuickSubmitting(true);
    try {
      const res = await fetch("/api/users/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader(),
        },
        body: JSON.stringify({
          phone: normalizePhoneInput(quickPhone),
          first_name: quickFirstName.trim(),
          last_name: quickLastName.trim(),
          secret_code: secret,
          role: "CUSTOMER",
          establishment: estId,
          created_in_person: true,
        }),
      });

      if (res.ok) {
        const newCust = await res.json();
        showSuccess(t("newClient") + " créé !");
        setSelectedClientForBooking(newCust);
        setQuickCreateOpen(false);
        setQuickFirstName("");
        setQuickLastName("");
        setQuickPhone("");
        triggerRefresh();
      } else {
        const errData = await readApiErrorPayload(res);
        showError(
          resolveApiErrorMessage(errData, "adminCreateCustomer", t, {
            status: res.status,
          })
        );
      }
    } catch {
      showError(t("errors.networkError"));
    } finally {
      setQuickSubmitting(false);
    }
  };

  // New: creation form submit handler for full page creation flow
  const handleCreateClientFromForm = async (payload: {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    secretCode: string;
  }) => {
    const validationError = validateAdminCustomerForm(
      {
        firstName: payload.firstName,
        lastName: payload.lastName,
        phone: payload.phoneNumber,
        secretCode: payload.secretCode,
      },
      t
    );
    if (validationError) {
      showError(validationError);
      throw new Error(validationError);
    }

    try {
      const res = await fetch("/api/users/", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          first_name: payload.firstName.trim(),
          last_name: payload.lastName.trim(),
          phone: normalizePhoneInput(payload.phoneNumber),
          secret_code: payload.secretCode.trim(),
          role: "CUSTOMER",
          establishment: estId,
          created_in_person: true,
        }),
      });

      if (!res.ok) {
        const err = await readApiErrorPayload(res);
        const errMsg = resolveApiErrorMessage(err, "adminCreateCustomer", t, {
          status: res.status,
        });
        showError(errMsg);
        throw new Error(errMsg);
      }

      const created = await res.json();

      if (!created || typeof created.id === "undefined") {
        showError(t("errors.serverError"));
        throw new Error(t("errors.serverError"));
      }

      const ticketUrlFromApi = (created && created.ticket_url) || `/admin/dashboard/customers/${created.id}/ticket`;

      const receipt: TicketReceipt = {
        bookingReference: created.phone,
        establishmentName: establishmentName,
        establishmentAddress: "",
        bookingDate: new Date().toISOString().slice(0, 10),
        startTime: new Date().toISOString().slice(11, 16),
        endTime: new Date().toISOString().slice(11, 16),
        clientFirstName: created.first_name,
        clientLastName: created.last_name,
        clientPhone: created.phone,
        secretCode: payload.secretCode,
        totalPrice: "0",
        paymentStatus: "NOT_APPLICABLE",
        paymentStatusLabel: "",
        qrText: `LOGIN:${created.phone}:${payload.secretCode}`,
        createdAt: new Date().toISOString(),
      };

      try {
        sessionStorage.setItem(CREATION_TICKET_STORAGE_KEY, JSON.stringify(receipt));
      } catch (storageErr) {
        console.warn("Failed to persist creation ticket in sessionStorage:", storageErr);
      }

      showSuccess("Client créé. Redirection vers le ticket...");
      navigate(ticketUrlFromApi, { state: { receipt } });
    } catch (err) {
      if (err instanceof Error && err.message) {
        throw err;
      }
      showError(t("errors.generic"));
      throw err;
    }
  };

  const regenerateSecretCode = () => {
    setCreateSecretCode(String(Math.floor(100000 + Math.random() * 900000)));
  };

  const handleCreateClientSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const validationError = validateAdminCustomerForm(
      {
        firstName: createFirstName,
        lastName: createLastName,
        phone: createPhone,
        secretCode: createSecretCode,
      },
      t
    );
    if (validationError) {
      showError(validationError);
      return;
    }

    setCreatingAccount(true);
    try {
      await handleCreateClientFromForm({
        firstName: createFirstName.trim(),
        lastName: createLastName.trim(),
        phoneNumber: createPhone.trim(),
        secretCode: createSecretCode.trim(),
      });

      setCreateLastName("");
      setCreateFirstName("");
      setCreatePhone("");
      setCreateSecretCode("");
    } catch (err) {
      console.warn("Client creation failed, keeping form values:", err);
    } finally {
      setCreatingAccount(false);
    }
  };

  const resetCreationWorkflow = () => {
    setCreationStep("form");
    setTicketPreview(null);
  };

  // Toggle machine status (ACTIF / EN_PANNE)
  const handleToggleMachine = async (machine: Resource) => {
    const nextStatus = machine.status === "ACTIF" ? "EN_PANNE" : "ACTIF";
    setLoadingMachines(true);
    try {
      const res = await fetch(`/api/resources/${machine.id}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeader(),
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (res.ok) {
        showSuccess(t("machineStatusUpdated"));
        triggerRefresh();
      } else {
        showError("Erreur de mise à jour.");
      }
    } catch (err) {
      showError("Erreur de réseau.");
    } finally {
      setLoadingMachines(false);
    }
  };

  // ── Super-admin only: posts (resources) CRUD ──
  const handleAddResource = async () => {
    setLoadingMachines(true);
    try {
      const nextIndex = resources.length + 1;
      const res = await fetch(`/api/resources/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ establishment: estId, label: `Poste ${nextIndex}`, status: "ACTIF" }),
      });
      if (res.ok) {
        showSuccess("Poste ajouté.");
        triggerRefresh();
      } else {
        const body = await res.json().catch(() => ({}));
        showError(body.detail || "Impossible d'ajouter le poste.");
      }
    } catch {
      showError("Erreur de réseau.");
    } finally {
      setLoadingMachines(false);
    }
  };

  const handleRenameResource = async (machine: Resource, label: string) => {
    const trimmed = label.trim();
    if (!trimmed || trimmed === machine.label) return;
    setLoadingMachines(true);
    try {
      const res = await fetch(`/api/resources/${machine.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ label: trimmed }),
      });
      if (res.ok) {
        showSuccess("Poste renommé.");
        triggerRefresh();
      } else {
        showError("Impossible de renommer le poste.");
      }
    } catch {
      showError("Erreur de réseau.");
    } finally {
      setLoadingMachines(false);
    }
  };

  const handleDeleteResource = async (machine: Resource) => {
    setLoadingMachines(true);
    try {
      const res = await fetch(`/api/resources/${machine.id}/`, {
        method: "DELETE",
        headers: authHeader(),
      });
      if (res.ok || res.status === 204) {
        showSuccess("Poste supprimé.");
        triggerRefresh();
      } else {
        const body = await res.json().catch(() => ({}));
        showError(body.detail || "Impossible de supprimer le poste.");
      }
    } catch {
      showError("Erreur de réseau.");
    } finally {
      setLoadingMachines(false);
    }
  };

  // Validate Cash Payment
  const handleValidateCash = async (bookingId: number) => {
    setValidationState("submitting");
    try {
      const res = await fetch(`/api/bookings/${bookingId}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeader(),
        },
        body: JSON.stringify({ status: "PAYE" }),
      });

      if (res.ok) {
        showSuccess(t("validationSuccess"));
        // Update local found state
        setFoundBookings((prev) =>
          prev.map((b) => (b.id === bookingId ? { ...b, status: "PAYE" } : b))
        );
        if (selectedBookingDetails && selectedBookingDetails.id === bookingId) {
          setSelectedBookingDetails((prev) => (prev ? { ...prev, status: "PAYE" } : null));
        }
        triggerRefresh();
      } else {
        showError("Impossible de valider.");
      }
    } catch (err) {
      showError("Erreur.");
    } finally {
      setValidationState("idle");
    }
  };

  // Cancel Booking
  const handleCancelBooking = async (bookingId: number) => {
    if (!window.confirm("Voulez-vous annuler cette réservation ?")) return;
    setValidationState("submitting");
    try {
      const res = await fetch(`/api/bookings/${bookingId}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeader(),
        },
        body: JSON.stringify({ status: "ANNULE" }),
      });

      if (res.ok) {
        showSuccess(t("cancellationSuccess"));
        setFoundBookings((prev) =>
          prev.map((b) => (b.id === bookingId ? { ...b, status: "ANNULE" } : b))
        );
        if (selectedBookingDetails && selectedBookingDetails.id === bookingId) {
          setSelectedBookingDetails((prev) => (prev ? { ...prev, status: "ANNULE" } : null));
        }
        triggerRefresh();
      } else {
        showError("Erreur d'annulation.");
      }
    } catch (err) {
      showError("Erreur.");
    } finally {
      setValidationState("submitting");
    }
  };

  // Fetch Receipt information and print
  const handlePrintReceipt = async (bookingId: number) => {
    setPrintingBookingId(bookingId);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/receipt/`, {
        headers: authHeader(),
      });
      if (res.ok) {
        const data = await res.json();
        setReceiptData({
          bookingReference: data.booking_reference,
          establishmentName: data.establishment_name,
          establishmentAddress: data.establishment_address,
          bookingDate: data.booking_date,
          startTime: data.start_time.slice(0, 5),
          endTime: data.end_time.slice(0, 5),
          clientFirstName: data.client_first_name,
          clientLastName: data.client_last_name,
          clientPhone: data.client_phone,
          secretCode: data.secret_code,
          totalPrice: data.total_price,
          paymentStatus: data.payment_status,
          paymentStatusLabel: data.payment_status_label,
          qrText: data.qr_text,
          createdAt: data.created_at,
        });

        // Small delay to let the print markup render
        window.setTimeout(() => {
          window.print();
        }, 150);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPrintingBookingId(null);
    }
  };

  /* ── Sidebar Tabs Config ── */
  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
    { key: "creation", label: "Clients", icon: Icons.users },
    { key: "validation", label: "Rendez-vous", icon: Icons.history },
    { key: "calendar", label: "Calendrier", icon: Icons.chart },
    { key: "machines", label: "Machines", icon: Icons.settings },
  ];

  const ticketReceipt = useMemo<TicketReceipt | null>(() => {
    if (initialTicketReceipt) {
      return initialTicketReceipt;
    }

    if (!ticketCustomer) {
      return null;
    }

    return {
      bookingReference: "-",
      establishmentName,
      establishmentAddress: "",
      bookingDate: new Date().toISOString().slice(0, 10),
      startTime: new Date().toISOString().slice(11, 16),
      endTime: new Date().toISOString().slice(11, 16),
      clientFirstName: ticketCustomer.first_name,
      clientLastName: ticketCustomer.last_name,
      clientPhone: ticketCustomer.phone,
      secretCode: ticketCustomer.secret_code_plain || ticketCustomer.secret_code_preview || null,
      totalPrice: "0",
      paymentStatus: "NOT_APPLICABLE",
      paymentStatusLabel: "Compte créé",
      qrText: `LOGIN:${ticketCustomer.phone}:${ticketCustomer.secret_code_plain || ticketCustomer.secret_code_preview || ""}`,
      createdAt: new Date().toISOString(),
    };
  }, [establishmentName, initialTicketReceipt, ticketCustomer]);

  if (isTicketRoute) {
    const languageForTicket = (i18n.language === "ar" ? "ar" : "fr") as AppLanguage;

    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/30 to-white text-slate-900">
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <div className="flex flex-col gap-4 rounded-[2rem] border border-sky-100 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.35em] text-sky-500">Ticket de création</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                Ticket client prêt à imprimer
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Le ticket est affiché dans la même page admin pour éviter les problèmes de navigation SPA.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate("/admin/dashboard/creation", { replace: true })}
                className="rounded-2xl border border-sky-100 bg-sky-50 px-5 py-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
              >
                Retour à la création
              </button>
              {ticketCustomerId ? (
                <button
                  type="button"
                  onClick={() => navigate(`/admin/dashboard/customers/${ticketCustomerId}`, { replace: true })}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Voir la fiche client
                </button>
              ) : null}
            </div>
          </div>

          {ticketLoading ? (
            <div className="rounded-[2rem] border border-sky-100 bg-white p-10 text-center text-slate-500 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
              Chargement...
            </div>
          ) : ticketError ? (
            <div className="rounded-[2rem] border border-rose-200 bg-rose-50 p-6 text-rose-800 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
              {ticketError}
            </div>
          ) : ticketReceipt ? (
            <div className="rounded-[2rem] border border-sky-100 bg-white/90 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-6">
              <TicketPrinter receipt={ticketReceipt} language={languageForTicket} showPrintButton title="Ticket de création de compte" />
            </div>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <div dir={isArabic ? "rtl" : "ltr"} className="flex h-screen w-screen overflow-hidden bg-gradient-to-br from-slate-50 via-sky-50/30 to-white animate-fade-in-up">
      {/* ── Sidebar ── */}
      <aside className={`
        fixed inset-y-0 z-40 flex w-72 flex-col bg-white/80 backdrop-blur-xl border-r border-sky-100/40
        shadow-[4px_0_40px_rgba(14,165,233,0.06)] transition-all duration-300 transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0
        ${isArabic ? "right-0 border-l border-r-0" : "left-0"}
        ${sidebarOpen ? "translate-x-0" : (isArabic ? "translate-x-full lg:translate-x-0" : "-translate-x-full lg:translate-x-0")}
      `}>
        {/* Decorative Top Accent Glow */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-sky-400 via-indigo-500 to-cyan-500 opacity-80" />

        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-6 border-b border-sky-100/40 relative">
          <div className="h-10 w-10 rounded-xl bg-sky-50 flex items-center justify-center border border-sky-100/50 shadow-inner group">
            <img src={logoImg} alt="Logo" className="h-7 w-auto transition-transform duration-300 group-hover:scale-110" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight text-slate-900 leading-none">Laverie de la résidence</h1>
            <p className="text-[9px] font-bold text-sky-600 uppercase tracking-[0.15em] mt-1">{t("assistantSpace")}</p>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-2">
          {tabs.map((tab, idx) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setSidebarOpen(false);
                  navigate(ADMIN_TAB_PATHS[tab.key], { replace: false });
                }}
                style={{ animationDelay: `${(idx + 1) * 60}ms` }}
                className={`
                  w-full flex items-center gap-3.5 px-4.5 py-3.5 rounded-2xl text-xs font-black tracking-wide transition-all duration-300 transform will-change-transform cursor-pointer animate-slide-in-left group
                  ${isActive
                    ? "bg-gradient-to-r from-sky-500 via-indigo-500 to-cyan-500 text-white shadow-[0_12px_25px_rgba(14,165,233,0.22)] scale-[1.02]"
                    : "text-slate-500 hover:bg-sky-50/70 hover:text-slate-900 hover:translate-x-1"
                  }
                `}
              >
                {/* Animated Icon Container */}
                <span className={`
                  flex items-center justify-center shrink-0 w-8 h-8 rounded-xl transition-all duration-300
                  ${isActive
                    ? "bg-white/20 text-white"
                    : "bg-slate-50 text-slate-400 group-hover:bg-sky-100/50 group-hover:text-sky-500"
                  }
                `}>
                  <span className={`
                    transition-transform duration-300 group-hover:scale-110
                    ${isActive ? "scale-105" : ""}
                    ${tab.key === "machines" && !isActive ? "group-hover:rotate-45" : ""}
                    ${tab.key === "validation" && !isActive ? "group-hover:animate-pulse" : ""}
                  `}>
                    {tab.icon}
                  </span>
                </span>
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom User + Logout */}
        <div className="border-t border-sky-100/40 p-4 space-y-3 bg-slate-50/40">
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 via-sky-500 to-indigo-500 flex items-center justify-center text-white text-sm font-black shadow-md shadow-sky-500/10">
              {session?.phone?.slice(-2) || "A"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate">{assistantDisplayName}</p>
              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{userPhone}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-rose-100 bg-rose-50/50 text-rose-600 text-xs font-bold hover:bg-rose-100/80 hover:border-rose-200 transition-all duration-200 cursor-pointer shadow-sm"
          >
            <span className="transition-transform duration-200 hover:-translate-x-0.5">
              {Icons.logout}
            </span>
            <span>{t("logout")}</span>
          </button>
        </div>
      </aside>

      {/* ── Overlay for mobile sidebar ── */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/20 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* ── Main Content Area ── */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="fixed left-4 top-4 z-20 inline-flex lg:hidden rounded-xl p-2 bg-white/80 text-sky-700 shadow-sm backdrop-blur transition hover:bg-white"
          aria-label={t("openMenu")}
          title={t("openMenu")}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>

        {/* Notification Banners - always visible with fixed positioning */}
        {(successMsg || errorMsg) && (
          <div className="fixed top-4 right-4 z-50 max-w-sm animate-fade-in-up">
            {successMsg && (
              <div className="rounded-2xl bg-emerald-500 px-5 py-3 text-white text-sm font-bold shadow-[0_12px_40px_rgba(16,185,129,0.3)] flex items-center gap-2 backdrop-blur-xl">
                <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                {successMsg}
              </div>
            )}
            {errorMsg && (
              <div className="rounded-2xl bg-rose-500 px-5 py-3 text-white text-sm font-bold shadow-[0_12px_40px_rgba(225,29,72,0.3)] flex items-center gap-2 backdrop-blur-xl">
                <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" /></svg>
                {errorMsg}
              </div>
            )}
          </div>
        )}

        {/* Content Area - creation tab is full-bleed, other tabs keep padding */}
        {activeTab === "creation" ? (
          <div className="h-full min-h-screen p-4 sm:p-6 lg:p-8 animate-fade-in-up">
            {/* 1. Page Header with Integrated Search Bar */}
            <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between rounded-[2rem] border border-sky-100/60 bg-white/85 p-6 lg:p-8 shadow-[0_18px_50px_rgba(15,23,42,0.04)] backdrop-blur-xl relative overflow-hidden">
              {/* Decorative background blobs */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -left-10 -top-10 h-32 w-32 rounded-full bg-sky-100/30 blur-2xl animate-float-soft" />
                <div className="absolute right-0 bottom-0 h-24 w-24 rounded-full bg-cyan-100/20 blur-2xl animate-float-soft delay-200" />
              </div>

              {/* Title & Info */}
              <div className="relative z-10 flex-1 min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-600 mb-3 border border-sky-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping" />
                  Espace Assistant
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                  Gestion des Clients
                </h1>
                <p className="mt-1 text-sm text-slate-500 leading-relaxed max-w-xl">
                  Recherchez et gérez les comptes clients existants ou créez-en de nouveaux instantanément.
                </p>
              </div>

              {/* Large Premium Search Input */}
              <div className="relative z-10 w-full lg:w-[480px] shrink-0">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-slate-400 group-focus-within:text-sky-500 transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </div>
                  <input
                    type="text"
                    value={searchClientQuery}
                    onChange={(e) => setSearchClientQuery(e.target.value)}
                    placeholder="Chercher par nom, prénom ou téléphone..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-4 pl-12 pr-16 text-sm font-medium text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:shadow-[0_0_0_4px_rgba(14,165,233,0.08)]"
                  />
                  
                  {/* Integrated QR Scanner Button */}
                  <button
                    type="button"
                    onClick={openClientQrScanner}
                    aria-label="Scanner QR"
                    title="Scanner le code QR du client"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-md transition-all duration-200 hover:scale-105 hover:bg-slate-800 active:scale-95 cursor-pointer"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6m6 0v-6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Grid Dashboard: Creation Form & Clients List */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Left Column: Form Card (7 cols) */}
              <div className="lg:col-span-7 rounded-[2rem] border border-sky-100/40 bg-white/70 backdrop-blur-xl p-6 sm:p-8 shadow-[0_20px_50px_rgba(15,23,42,0.03)] relative overflow-hidden flex flex-col justify-between">
                {/* Decorative background blobs */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                  <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-sky-100/10 blur-3xl" />
                  <div className="absolute left-10 bottom-0 h-48 w-48 rounded-full bg-cyan-100/15 blur-3xl" />
                </div>

                <form onSubmit={handleCreateClientSubmit} className="relative z-10 w-full space-y-6">
                  {/* Section Title */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-500">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-slate-900">Nouveau Client</h2>
                      <p className="text-xs text-slate-400 mt-0.5">Enregistrez un nouveau compte client en direct.</p>
                    </div>
                  </div>

                  {/* Name fields */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 ml-1">Nom de famille</label>
                      <input
                        type="text"
                        value={createLastName}
                        onChange={(e) => setCreateLastName(e.target.value)}
                        placeholder="Nom"
                        className="w-full rounded-xl border border-slate-200 bg-white/80 px-4 py-3.5 text-sm font-medium text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-sky-400 focus:shadow-[0_0_0_4px_rgba(14,165,233,0.06)]"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 ml-1">Prénom</label>
                      <input
                        type="text"
                        value={createFirstName}
                        onChange={(e) => setCreateFirstName(e.target.value)}
                        placeholder="Prénom du client"
                        className="w-full rounded-xl border border-slate-200 bg-white/80 px-4 py-3.5 text-sm font-medium text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-sky-400 focus:shadow-[0_0_0_4px_rgba(14,165,233,0.06)]"
                        required
                      />
                    </div>
                  </div>

                  {/* Phone */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 ml-1">Numéro de téléphone</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-slate-400">
                        <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                      </div>
                      <input
                        type="text"
                        value={createPhone}
                        onChange={(e) => setCreatePhone(e.target.value)}
                        placeholder="05XX XXX XXX"
                        dir="ltr"
                        className="w-full rounded-xl border border-slate-200 bg-white/80 py-3.5 pl-11 pr-4 text-sm font-medium text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-400 focus:border-sky-400 focus:shadow-[0_0_0_4px_rgba(14,165,233,0.06)]"
                        required
                      />
                    </div>
                  </div>

                  {/* Secret Code */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 ml-1">Code secret</label>
                    <div className="flex gap-3">
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-slate-400">
                          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        </div>
                        <input
                          type="text"
                          value={createSecretCode}
                          onChange={(e) => setCreateSecretCode(e.target.value)}
                          placeholder="6 chiffres"
                          className="w-full rounded-xl border border-slate-200 bg-white/80 py-3.5 pl-11 pr-4 tracking-[0.3em] text-sm font-bold text-slate-900 outline-none transition-all duration-300 placeholder:text-slate-400 placeholder:tracking-normal focus:border-sky-400 focus:shadow-[0_0_0_4px_rgba(14,165,233,0.06)]"
                          maxLength={6}
                          required
                        />
                      </div>
                      <button
                        type="button"
                        onClick={regenerateSecretCode}
                        className="shrink-0 rounded-xl bg-slate-950 px-5 py-3.5 text-xs font-bold text-white shadow-lg transition-all duration-200 hover:bg-slate-800 hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                      >
                        Générer
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={creatingAccount}
                    className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-sky-600 via-sky-500 to-cyan-500 px-6 py-4 text-sm font-bold text-white shadow-[0_14px_40px_rgba(14,165,233,0.25)] transition-all duration-300 hover:shadow-[0_20px_50px_rgba(14,165,233,0.35)] hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer animate-pulse-soft"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {creatingAccount ? (
                        <>
                          <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          Création en cours...
                        </>
                      ) : (
                        <>
                          <svg className="w-4.5 h-4.5 transition-transform duration-300 group-hover:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                          Créer le compte client
                        </>
                      )}
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-sky-500 to-cyan-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  </button>
                </form>
              </div>

              {/* Right Column: Base Clients (5 cols) */}
              <div className="lg:col-span-5 rounded-[2rem] border border-sky-100/40 bg-white/70 backdrop-blur-xl p-6 shadow-[0_20px_50px_rgba(15,23,42,0.03)] relative overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center text-cyan-500">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-slate-900">
                        {searchClientQuery.trim() ? "Résultats de recherche" : "Derniers clients"}
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {searchClientQuery.trim() ? "Comptes correspondants." : "Derniers comptes enregistrés."}
                      </p>
                    </div>
                  </div>
                  {searchClientQuery.trim() && (
                    <button
                      type="button"
                      onClick={() => setSearchClientQuery("")}
                      className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition cursor-pointer"
                    >
                      Effacer
                    </button>
                  )}
                </div>

                {/* Clients list container */}
                <div className="flex-1 overflow-y-auto max-h-[380px] pr-1 scrollbar-thin">
                  {loadingClients ? (
                    <div className="flex flex-col items-center justify-center py-16">
                      <div className="h-8 w-8 rounded-full border-[3px] border-slate-200 border-t-sky-500 animate-spin" />
                      <p className="mt-3 text-xs font-medium text-slate-400">Chargement des clients...</p>
                    </div>
                  ) : clientSearchError ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-fade-in-up">
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-800">
                        {clientSearchError}
                      </div>
                      <p className="mt-3 text-xs text-slate-400">
                        {window.location.protocol === "http:"
                          ? "Ouvrez le site en https://127.0.0.1:5173 (requis pour l’API)."
                          : "Vérifiez que le serveur Django tourne sur le port 8000."}
                      </p>
                    </div>
                  ) : clients.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in-up">
                      <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                        <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" /></svg>
                      </div>
                      <p className="text-sm font-semibold text-slate-500">{t("noClientsFound")}</p>
                      <p className="mt-1 text-xs text-slate-400 max-w-[200px] mx-auto">Créez un nouveau compte à l'aide du formulaire à gauche.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 animate-fade-in-up">
                      {clients.map((client, idx) => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() => navigate(`/admin/dashboard/customers/${client.id}`)}
                          style={{ animationDelay: `${idx * 50}ms` }}
                          className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100/60 bg-white/80 px-4 py-3 text-left transition-all duration-200 hover:border-sky-200 hover:bg-white hover:shadow-[0_8px_30px_rgba(14,165,233,0.06)] hover:-translate-y-px active:scale-[0.99] cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Initials Avatar with custom gradient */}
                            <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-sky-400 via-sky-500 to-indigo-500 flex items-center justify-center text-white text-sm font-black shadow-md shadow-sky-500/10">
                              {(client.first_name?.[0] || "").toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-900 group-hover:text-sky-600 transition-colors">
                                {client.first_name} {client.last_name}
                              </p>
                              <p className="mt-0.5 text-xs font-semibold text-slate-400">{client.phone}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">Fiche</span>
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
        ) : activeTab === "validation" ? (
          <AdminValidationPanel
            searchQuery={searchBookingQuery}
            onSearchChange={setSearchBookingQuery}
            isBookingReferenceMode={isBookingReferenceQuery(searchBookingQuery)}
            foundBookings={foundBookings}
            foundClients={foundValidationClients}
            loading={loadingValidationSearch}
            resolvingQr={resolvingClientQr}
            selectedBooking={selectedBookingDetails}
            onSelectBooking={setSelectedBookingDetails}
            onSelectClient={(client) =>
              navigate(`/admin/dashboard/customers/${client.id}`)
            }
            onScan={handleValidationScan}
            onScanStatusChange={setScanStatus}
            validationState={validationState}
            onValidateCash={handleValidateCash}
            onCancelBooking={handleCancelBooking}
            onPrintReceipt={handlePrintReceipt}
            printingBookingId={printingBookingId}
            getBookingClientName={getBookingClientName}
          />
        ) : (
          <div className="space-y-6 p-3 sm:p-4 lg:p-6">
            <div className="glass-card p-6 sm:p-8 animate-fade-in-up">
        {/* 1. CALENDAR TAB */}
        {activeTab === "calendar" && (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.35em] text-sky-500">{t("calendarTab")}</p>
                <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                  Visualisez les réservations en temps réel
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Chaque cellule représente 15 minutes et ouvre les détails complets au clic.
                </p>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-2 xl:pb-0">
                {quickDates.map((qd) => (
                  <button
                    key={qd.value}
                    type="button"
                    onClick={() => setSelectedDate(qd.value)}
                    className={`min-w-20 rounded-[1rem] px-3 py-2.5 text-center text-xs font-semibold transition-all ${
                      selectedDate === qd.value
                        ? "bg-sky-600 text-white shadow-[0_14px_30px_rgba(14,165,233,0.20)]"
                        : "bg-sky-50 text-slate-600 hover:bg-sky-100"
                    }`}
                  >
                    <div className="uppercase opacity-75">{qd.weekday}</div>
                    <div className="mt-0.5 text-sm font-black">{qd.label}</div>
                  </button>
                ))}
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="rounded-[1rem] border border-sky-100 bg-sky-50 px-3 py-3 text-xs font-semibold text-slate-700 outline-none"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.5rem] border border-sky-100 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <p className="text-[11px] font-black uppercase tracking-[0.32em] text-sky-500">Machines actives</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{activeResourcesCount}</p>
              </div>
              <div className="rounded-[1.5rem] border border-sky-100 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <p className="text-[11px] font-black uppercase tracking-[0.32em] text-sky-500">Réservations du jour</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{activeBookings.length}</p>
              </div>
              <div className="rounded-[1.5rem] border border-sky-100 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <p className="text-[11px] font-black uppercase tracking-[0.32em] text-sky-500">Tranche horaire</p>
                <p className="mt-2 text-2xl font-black text-slate-900">15 min</p>
              </div>
            </div>

            {loadingCalendar ? (
              <div className="rounded-[2rem] border border-sky-100 bg-white/80 py-20 text-center text-slate-500 font-semibold shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
                {t("loading")}
              </div>
            ) : resources.length === 0 ? (
              <div className="rounded-[2rem] border border-sky-100 bg-sky-50/50 p-12 text-center text-slate-500">
                Aucun poste configuré pour cet établissement.
              </div>
            ) : (
              <div className="overflow-hidden rounded-[2rem] border border-sky-100 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]">

                {/* ── Mobile resource tab bar (hidden on lg+) ── */}
                <div className="flex gap-2 overflow-x-auto border-b border-sky-100 bg-sky-50/60 px-3 py-2 lg:hidden">
                  {resources.map((res) => (
                    <button
                      key={res.id}
                      type="button"
                      onClick={() => setMobileSelectedResourceId(res.id)}
                      className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition whitespace-nowrap ${
                        mobileSelectedResourceId === res.id
                          ? "bg-sky-600 text-white shadow"
                          : "bg-white text-slate-600 border border-sky-100 hover:bg-sky-50"
                      }`}
                    >
                      {res.label}
                      {res.status === "EN_PANNE" && <span className="ml-1 text-[10px] text-rose-400">⚠</span>}
                    </button>
                  ))}
                </div>

                <div ref={calendarScrollRef} className="max-h-[calc(100vh-280px)] overflow-auto">
                  <table className="w-full border-separate border-spacing-0 text-left text-sm lg:min-w-[980px]">
                    <thead className="sticky top-0 z-20 bg-white/95 backdrop-blur">
                      <tr className="border-b border-sky-100 bg-sky-50/70">
                        <th className="sticky left-0 z-30 w-16 sm:w-24 border-b border-sky-100 bg-sky-50/95 p-2 sm:p-4 font-black text-slate-700 shadow-[8px_0_20px_rgba(15,23,42,0.04)]">
                          Heure
                        </th>
                        {resources
                          .filter((res) => !isSmallScreen || mobileSelectedResourceId === null || res.id === mobileSelectedResourceId)
                          .map((res) => (
                          <th key={res.id} className="min-w-[160px] sm:min-w-[200px] lg:min-w-[220px] border-b border-sky-100 p-2 sm:p-4 text-center font-black text-slate-800">
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-xs sm:text-sm">{res.label}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.18em] ${
                                res.status === "ACTIF" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                              }`}>
                                {res.status === "ACTIF" ? "Actif" : "En panne"}
                              </span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {slots.map((time) => {
                        const slotMins = toMinutes(time);
                        const visibleResources = resources.filter(
                          (res) => !isSmallScreen || mobileSelectedResourceId === null || res.id === mobileSelectedResourceId
                        );
                        return (
                          <tr key={time} className="group border-b border-sky-50/80 hover:bg-slate-50/30">
                            <td className="sticky left-0 z-10 border-b border-sky-50 bg-white p-2 sm:p-4 font-black text-slate-600 shadow-[8px_0_20px_rgba(15,23,42,0.04)]">
                              <div className="flex flex-col">
                                <span className="text-xs sm:text-sm">{time}</span>
                                <span className="text-[9px] sm:text-[10px] font-semibold text-slate-400 hidden sm:block">15 min</span>
                              </div>
                            </td>
                            {visibleResources.map((res) => {
                              if (res.status === "EN_PANNE") {
                                return (
                                  <td key={res.id} className="border-b border-sky-50 bg-rose-50/20 p-1.5 sm:p-2">
                                    <div className="flex h-full min-h-[56px] items-center justify-center rounded-xl sm:rounded-[1.25rem] border border-rose-100 bg-rose-50/50 px-2 text-[11px] font-bold text-rose-700">
                                      Hors service
                                    </div>
                                  </td>
                                );
                              }

                              const activeBooking = bookings.find((booking) => {
                                if (booking.status === "ANNULE") return false;
                                if (booking.resource !== res.id) return false;
                                const bookingStart = toMinutes(booking.start_time);
                                const bookingEnd = toMinutes(booking.end_time);
                                return overlapsSlot(bookingStart, bookingEnd, slotMins, slotMins + CALENDAR_STEP_MINUTES);
                              });

                              if (activeBooking) {
                                const bookingStart = toMinutes(activeBooking.start_time);
                                if (bookingStart < slotMins) return null;

                                const bookingEnd = toMinutes(activeBooking.end_time);
                                const durationSlots = Math.max(1, Math.round((bookingEnd - bookingStart) / CALENDAR_STEP_MINUTES));
                                const isMaintenance = activeBooking.status === "MAINTENANCE";
                                const isPaid = activeBooking.status === "PAYE";
                                const isCurrent = selectedBookingDetails?.id === activeBooking.id;
                                const durationMin = bookingEnd - bookingStart;

                                return (
                                  <td
                                    key={res.id}
                                    rowSpan={durationSlots}
                                    className="border-b border-sky-50 p-1.5 sm:p-2 align-top"
                                    style={{ height: "1px" }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigate(`/admin/dashboard/bookings/${activeBooking.id}`, {
                                          state: { booking: activeBooking, returnTo: location.pathname },
                                        });
                                      }}
                                      className={`group/slot relative flex w-full cursor-pointer flex-col overflow-hidden rounded-xl sm:rounded-2xl border text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(15,23,42,0.12)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white ${
                                        isMaintenance
                                          ? "border-rose-300/70 bg-gradient-to-br from-rose-50 to-orange-50/60 text-rose-900 shadow-[0_4px_16px_rgba(239,68,68,0.12)] focus:ring-rose-400"
                                          : isPaid
                                            ? "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-teal-50/60 text-emerald-900 shadow-[0_4px_16px_rgba(16,185,129,0.10)] focus:ring-sky-400"
                                            : "border-amber-200/70 bg-gradient-to-br from-amber-50 to-orange-50/60 text-amber-900 shadow-[0_4px_16px_rgba(245,158,11,0.10)] focus:ring-sky-400"
                                      } ${isCurrent ? "ring-2 ring-sky-400 ring-offset-2" : ""}`}
                                      style={{ height: "100%", minHeight: `${durationSlots * 56}px` }}
                                    >
                                      {/* Left accent bar */}
                                      <div className={`absolute left-0 top-0 h-full w-1 rounded-l-xl sm:rounded-l-2xl ${
                                        isMaintenance ? "bg-rose-500" : isPaid ? "bg-emerald-500" : "bg-amber-400"
                                      }`} />

                                      <div className="flex h-full flex-col justify-between p-2 sm:p-3 pl-3 sm:pl-4">
                                        <div>
                                          <div className="flex items-start justify-between gap-1.5">
                                            {isMaintenance ? (
                                              <div className="flex items-center gap-1.5 min-w-0">
                                                <svg className="w-3 h-3 shrink-0 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                                <p className="truncate text-xs sm:text-sm font-black leading-tight text-rose-800">Maintenance</p>
                                              </div>
                                            ) : (
                                              <p className="truncate text-xs sm:text-sm font-black leading-tight">{getBookingClientName(activeBooking)}</p>
                                            )}
                                            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.15em] ${
                                              isMaintenance ? "bg-rose-100 text-rose-700"
                                              : isPaid ? "bg-emerald-100 text-emerald-700"
                                              : "bg-amber-100 text-amber-700"
                                            }`}>
                                              {isMaintenance ? "Maint." : isPaid ? "Payé" : "Attente"}
                                            </span>
                                          </div>
                                          {durationSlots >= 2 && !isMaintenance && (
                                            <p className="mt-0.5 truncate text-[10px] sm:text-[11px] font-semibold opacity-70">
                                              {activeBooking.user_phone}
                                            </p>
                                          )}
                                          {durationSlots >= 3 && (
                                            <p className="mt-0.5 truncate font-mono text-[9px] sm:text-[10px] opacity-60">
                                              {activeBooking.booking_reference}
                                            </p>
                                          )}
                                        </div>
                                        <div className={`flex items-center justify-between gap-1 text-[9px] sm:text-[10px] font-semibold opacity-75 ${durationSlots >= 2 ? "mt-2" : "mt-1"}`}>
                                          <span className="flex items-center gap-0.5 sm:gap-1">
                                            <span>{activeBooking.start_time.slice(0, 5)}</span>
                                            <span className="opacity-50">→</span>
                                            <span>{activeBooking.end_time.slice(0, 5)}</span>
                                            <span className="opacity-40 hidden sm:inline">({durationMin}m)</span>
                                          </span>
                                          {durationSlots >= 2 && !isMaintenance && (
                                            <span className="font-black">{activeBooking.total_price} DA</span>
                                          )}
                                        </div>
                                      </div>
                                    </button>
                                  </td>
                                );
                              }

                              return (
                                <td key={res.id} className="border-b border-sky-50 p-1.5 sm:p-2">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedSlotForBooking({ resource: res, time })}
                                    className="group flex h-full min-h-[56px] sm:min-h-[72px] w-full cursor-pointer items-center justify-center rounded-xl sm:rounded-[1.25rem] border border-dashed border-sky-200/60 bg-sky-50/10 px-2 text-xs sm:text-sm font-bold text-sky-400/70 transition duration-200 hover:border-emerald-300 hover:bg-emerald-50/40 hover:text-emerald-700 hover:shadow-[0_8px_24px_rgba(16,185,129,0.08)] focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-white"
                                  >
                                    <span className="transition group-hover:scale-105">+ Réserver</span>
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "clients" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-slate-900">{t("clientList")}</h3>
              <p className="text-xs text-slate-500">Recherche de compte en direct.</p>
            </div>

            <div className="relative">
              <input
                type="text"
                value={searchClientQuery}
                onChange={(e) => setSearchClientQuery(e.target.value)}
                placeholder={t("searchClients")}
                className="w-full rounded-2xl border border-sky-100 bg-sky-50/40 px-4 py-3.5 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:bg-white"
              />
            </div>

            {loadingClients ? (
              <div className="py-10 text-center text-slate-500">{t("loading")}</div>
            ) : clients.length === 0 ? (
              <div className="text-slate-400 text-center py-10 bg-sky-50/20 rounded-2xl border border-dashed border-sky-100">
                {t("noClientsFound")}
              </div>
            ) : (
              <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2">
                {clients.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-sky-50 bg-white hover:bg-sky-50/30 transition hover:shadow-sm"
                  >
                    <div>
                      <p className="font-bold text-slate-900">
                        {c.first_name} {c.last_name}
                      </p>
                      <p className="text-xs font-semibold text-slate-500 mt-0.5">{c.phone}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClientForBooking(c);
                        if (resources.length > 0) {
                          setSelectedSlotForBooking({
                            resource: resources[0],
                            time: "08:00",
                          });
                          navigate(ADMIN_TAB_PATHS.calendar, { replace: false });
                        } else {
                          showError("Aucun poste configuré pour réserver.");
                        }
                      }}
                      className="rounded-xl bg-sky-50 hover:bg-sky-100 px-4 py-2 text-xs font-bold text-sky-700 transition cursor-pointer"
                    >
                      Réserver
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. MACHINES TAB */}
        {activeTab === "machines" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-slate-900">{t("machinesTitle")}</h3>
                <p className="text-xs text-slate-500">{t("machinesSubtitle")}</p>
              </div>
              {isSuperAdmin && (
                <button
                  type="button"
                  disabled={loadingMachines}
                  onClick={handleAddResource}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(99,102,241,0.25)] transition hover:-translate-y-0.5 disabled:opacity-60"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  Ajouter un poste
                </button>
              )}
            </div>

            {loadingCalendar ? (
              <div className="py-10 text-center text-slate-500">{t("loading")}</div>
            ) : resources.length === 0 ? (
              <div className="text-slate-400 text-center py-10 bg-sky-50/20 rounded-2xl">
                Aucune machine enregistrée.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {resources.map((res) => {
                  const isActive = res.status === "ACTIF";
                  const isRenaming = renamingResourceId === res.id;
                  return (
                    <div
                      key={res.id}
                      className={`rounded-3xl border p-5 flex flex-col justify-between gap-4 transition hover:shadow-md ${
                        isActive ? "border-sky-100 bg-white" : "border-rose-100 bg-rose-50/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {isRenaming ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") { handleRenameResource(res, renameValue); setRenamingResourceId(null); }
                                  if (e.key === "Escape") setRenamingResourceId(null);
                                }}
                                className="w-full rounded-lg border border-indigo-200 bg-white px-2 py-1 text-sm font-bold text-slate-900 outline-none focus:border-indigo-400"
                              />
                              <button type="button" onClick={() => { handleRenameResource(res, renameValue); setRenamingResourceId(null); }}
                                className="shrink-0 rounded-lg bg-indigo-500 p-1.5 text-white hover:bg-indigo-600">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-slate-900 text-base truncate">{res.label}</p>
                              {isSuperAdmin && (
                                <button type="button" onClick={() => { setRenamingResourceId(res.id); setRenameValue(res.label); }}
                                  className="shrink-0 text-slate-300 hover:text-indigo-500 transition" title="Renommer">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                </button>
                              )}
                            </div>
                          )}
                          <p className="text-[10px] font-bold text-slate-400 mt-0.5">ID: {res.id}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                            isActive
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800 animate-pulse"
                          }`}
                        >
                          {isActive ? "Actif" : "En panne"}
                        </span>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={loadingMachines}
                          onClick={() => handleToggleMachine(res)}
                          className={`flex-1 rounded-2xl py-2.5 text-xs font-bold transition cursor-pointer ${
                            isActive
                              ? "bg-rose-50 hover:bg-rose-100 text-rose-700"
                              : "bg-sky-50 hover:bg-sky-100 text-sky-700"
                          }`}
                        >
                          {isActive ? t("reportBroken") : t("setMachineActive")}
                        </button>
                        {isSuperAdmin && (
                          <button
                            type="button"
                            disabled={loadingMachines}
                            onClick={() => setResourcePendingDelete(res)}
                            title="Supprimer le poste"
                            className="shrink-0 rounded-2xl border border-rose-200 bg-white px-3 text-rose-600 transition hover:bg-rose-50"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          )}
        </div>
      </div>
    )}

      {/* ── Super-admin: delete poste confirmation ── */}
      {resourcePendingDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setResourcePendingDelete(null)} />
          <div className="relative z-10 w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_20px_60px_rgba(0,0,0,0.18)] border border-slate-100 animate-scale-in">
            <div className="flex items-center gap-3 mb-3 text-rose-600">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 border border-rose-100">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Supprimer ce poste ?</h3>
                <p className="text-[11px] font-bold uppercase tracking-wide text-rose-500/80 mt-0.5">Action irréversible</p>
              </div>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed">
              Le poste <span className="font-bold text-slate-700">{resourcePendingDelete.label}</span> sera supprimé. Impossible si des réservations y sont déjà rattachées.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setResourcePendingDelete(null)} disabled={loadingMachines}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 transition">
                Annuler
              </button>
              <button type="button"
                onClick={async () => { const r = resourcePendingDelete; setResourcePendingDelete(null); if (r) await handleDeleteResource(r); }}
                disabled={loadingMachines}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white hover:bg-rose-700 transition disabled:opacity-60">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Client creation ticket QR scanner ── */}
      {clientQrScannerOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={closeClientQrScanner}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Scanner le ticket client"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-sky-100 bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.24)]"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Scanner le ticket client</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Autorisez la caméra, puis présentez le QR du ticket de création.
                </p>
              </div>
              <button
                type="button"
                onClick={closeClientQrScanner}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            {resolvingClientQr ? (
              <div className="py-10 text-center text-sm font-medium text-slate-500">
                Identification du client…
              </div>
            ) : (
              <WhatsAppQrScanner
                instruction="Présentez le QR du ticket de création devant la caméra."
                onScan={handleClientLoginQrScan}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Manual Booking Creation Modal ── */}
      {selectedSlotForBooking && (() => {
        // ── Conflict detection helpers (computed inline so they're always fresh) ──
        const slotStart = selectedSlotForBooking.time;
        const resId = selectedSlotForBooking.resource.id;

        // Duration of chosen wash mode in minutes
        const washModeDuration =
          selectedWashMode === "rapid" ? 15 :
          selectedWashMode === "express" ? 30 :
          selectedWashMode === "premium" ? 45 : 60;

        const appointmentEnd = addMinutesToTime(slotStart, washModeDuration);
        const maintenanceEnd = addMinutesToTime(slotStart, maintenanceDuration);

        const conflictsForAppointment = bookings.filter((b) => {
          if (b.status === "ANNULE") return false;
          if (b.resource !== resId) return false;
          return overlapsSlot(toMinutes(b.start_time), toMinutes(b.end_time), toMinutes(slotStart), toMinutes(appointmentEnd));
        });

        const conflictsForMaintenance = bookings.filter((b) => {
          if (b.status === "ANNULE") return false;
          if (b.resource !== resId) return false;
          return overlapsSlot(toMinutes(b.start_time), toMinutes(b.end_time), toMinutes(slotStart), toMinutes(maintenanceEnd));
        });

        const washModes = [
          { key: "rapid" as const,   label: "Rapide",   duration: 15, price: 225, accent: "from-cyan-400 to-sky-500",     ring: "ring-cyan-400",   bg: "bg-cyan-50",   border: "border-cyan-300",   text: "text-cyan-700" },
          { key: "express" as const, label: "Express",  duration: 30, price: 450, accent: "from-sky-500 to-blue-600",     ring: "ring-sky-500",    bg: "bg-sky-50",    border: "border-sky-400",    text: "text-sky-700" },
          { key: "premium" as const, label: "Premium",  duration: 45, price: 675, accent: "from-blue-500 to-indigo-600",  ring: "ring-blue-500",   bg: "bg-blue-50",   border: "border-blue-400",   text: "text-blue-700" },
          { key: "vip" as const,     label: "VIP",      duration: 60, price: 900, accent: "from-violet-500 to-purple-600",ring: "ring-violet-500", bg: "bg-violet-50", border: "border-violet-400", text: "text-violet-700" },
        ];
        const selectedMode = washModes.find((m) => m.key === selectedWashMode)!;

        const closeModal = () => {
          setSelectedSlotForBooking(null);
          setBookingType(null);
          setSelectedClientForBooking(null);
          setSearchClientForBooking("");
          setQuickCreateOpen(false);
          setQuickLastName("");
          setQuickFirstName("");
          setQuickPhone("");
          setQuickSecretCode("");
          setSelectedWashMode("express");
          setMaintenanceDuration(15);
          setPaymentStatus("EN_ATTENTE");
        };

        const dateLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

        return (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-lg sm:rounded-3xl bg-white shadow-[0_40px_120px_rgba(0,0,0,0.28)] text-slate-900 max-h-[96dvh] overflow-hidden flex flex-col rounded-t-3xl">

            {/* ── Header ── */}
            <div className={`relative overflow-hidden px-6 py-5 ${
              bookingType === "maintenance"
                ? "bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-400"
                : "bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-600"
            }`}>
              {/* subtle dot pattern */}
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
              <div className="relative flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/70 mb-1">
                    {bookingType === null ? "Nouvelle réservation" : bookingType === "appointment" ? "Rendez-vous client" : "Maintenance"}
                  </p>
                  <h4 className="text-xl font-black text-white leading-tight">
                    {bookingType === null && "Que souhaitez-vous créer ?"}
                    {bookingType === "appointment" && !quickCreateOpen && "Configurer le rendez-vous"}
                    {bookingType === "appointment" && quickCreateOpen && "Nouveau client"}
                    {bookingType === "maintenance" && "Planifier une maintenance"}
                  </h4>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/85 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                      </svg>
                      {selectedSlotForBooking.resource.label}
                    </span>
                    <span className="opacity-40">·</span>
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {slotStart}
                    </span>
                    <span className="opacity-40">·</span>
                    <span className="capitalize">{dateLabel}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* ── Scrollable body ── */}
            <div className="flex-1 overflow-y-auto">

              {/* ── STEP 0: Choose type ── */}
              {bookingType === null && (
                <div className="p-6 space-y-3">
                  <button
                    type="button"
                    onClick={() => setBookingType("appointment")}
                    className="group w-full rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-blue-50/60 p-5 text-left transition hover:border-sky-300 hover:shadow-[0_8px_30px_rgba(14,165,233,0.14)] hover:-translate-y-0.5"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-[0_4px_12px_rgba(14,165,233,0.35)]">
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-slate-900 text-base">Rendez-vous Client</p>
                        <p className="text-xs text-slate-500 mt-0.5">Créer une réservation pour un client existant ou nouveau</p>
                      </div>
                      <svg className="w-5 h-5 text-sky-400 ml-auto shrink-0 transition group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBookingType("maintenance")}
                    className="group w-full rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50/60 p-5 text-left transition hover:border-amber-300 hover:shadow-[0_8px_30px_rgba(245,158,11,0.14)] hover:-translate-y-0.5"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-[0_4px_12px_rgba(245,158,11,0.35)]">
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-slate-900 text-base">Maintenance</p>
                        <p className="text-xs text-slate-500 mt-0.5">Bloquer le poste pour maintenance ou entretien</p>
                      </div>
                      <svg className="w-5 h-5 text-amber-400 ml-auto shrink-0 transition group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                </div>
              )}

              {/* ── STEP 1b: Quick client creation ── */}
              {bookingType === "appointment" && quickCreateOpen && (
                <form onSubmit={handleQuickCreateClient} className="p-6 space-y-5">
                  <button type="button" onClick={() => setQuickCreateOpen(false)} className="flex items-center gap-1.5 text-xs font-bold text-sky-600 hover:text-sky-800 transition">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    Retour à la recherche
                  </button>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-3">
                    <p className="text-xs font-black text-slate-700 uppercase tracking-wider">Informations du client</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Nom</label>
                        <input type="text" required value={quickLastName} onChange={(e) => setQuickLastName(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition" />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Prénom</label>
                        <input type="text" required value={quickFirstName} onChange={(e) => setQuickFirstName(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Téléphone</label>
                      <input type="text" required value={quickPhone} onChange={(e) => setQuickPhone(e.target.value)} placeholder="0555 123 456"
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition" />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Code secret (6 chiffres)</label>
                      <div className="mt-1 flex gap-2">
                        <input type="text" required value={quickSecretCode} onChange={(e) => setQuickSecretCode(e.target.value)} placeholder="123456" maxLength={6} pattern="\d{6}"
                          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-mono text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition" />
                        <button type="button" onClick={() => setQuickSecretCode(String(Math.floor(100000 + Math.random() * 900000)))}
                          className="rounded-xl bg-sky-100 px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-200 transition">
                          Générer
                        </button>
                      </div>
                    </div>
                  </div>

                  <button type="submit" disabled={quickSubmitting}
                    className="w-full rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 py-3.5 text-sm font-bold text-white shadow-[0_4px_16px_rgba(14,165,233,0.35)] transition hover:shadow-[0_6px_20px_rgba(14,165,233,0.45)] hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0">
                    {quickSubmitting ? "Création en cours..." : "Créer le client et continuer →"}
                  </button>
                </form>
              )}

              {/* ── STEP 1a: Appointment form ── */}
              {bookingType === "appointment" && !quickCreateOpen && (
                <div className="p-6 space-y-5">
                  <button type="button" onClick={() => setBookingType(null)} className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    Retour
                  </button>

                  {/* Client picker */}
                  <div>
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Client</label>
                    {selectedClientForBooking ? (
                      <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-black text-white">
                            {(selectedClientForBooking.first_name?.[0] ?? "?").toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-emerald-950 text-sm truncate">{selectedClientForBooking.first_name} {selectedClientForBooking.last_name}</p>
                            <p className="text-[11px] text-emerald-700 font-semibold">{selectedClientForBooking.phone}</p>
                          </div>
                        </div>
                        <button type="button" onClick={() => { setSelectedClientForBooking(null); setSearchClientForBooking(""); }}
                          className="shrink-0 rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 transition">
                          Changer
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <div className="relative flex gap-2">
                          <div className="relative flex-1">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input type="text" value={searchClientForBooking} onChange={(e) => setSearchClientForBooking(e.target.value)}
                              placeholder="Rechercher par nom ou téléphone..." autoFocus
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100 transition" />
                          </div>
                          <button type="button" onClick={() => setQuickCreateOpen(true)}
                            className="shrink-0 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-bold text-sky-700 hover:bg-sky-100 transition whitespace-nowrap">
                            + Nouveau
                          </button>
                        </div>
                        {searchClientForBooking && (
                          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                            {clientsForBookingResults.length === 0 ? (
                              <p className="p-4 text-center text-sm text-slate-400">Aucun client trouvé</p>
                            ) : (
                              <div className="max-h-40 overflow-y-auto divide-y divide-slate-50">
                                {clientsForBookingResults.map((c) => (
                                  <button key={c.id} type="button" onClick={() => { setSelectedClientForBooking(c); setSearchClientForBooking(""); }}
                                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sky-50 transition">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[11px] font-black text-sky-700">
                                      {(c.first_name?.[0] ?? "?").toUpperCase()}
                                    </div>
                                    <span className="flex-1 text-sm font-bold text-slate-800">{c.first_name} {c.last_name}</span>
                                    <span className="text-xs text-slate-400 font-semibold">{c.phone}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Wash mode */}
                  <div>
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Mode de lavage</label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {washModes.map((mode) => {
                        const end = addMinutesToTime(slotStart, mode.duration);
                        const hasConflict = bookings.some((b) => {
                          if (b.status === "ANNULE") return false;
                          if (b.resource !== resId) return false;
                          return overlapsSlot(toMinutes(b.start_time), toMinutes(b.end_time), toMinutes(slotStart), toMinutes(end));
                        });
                        const isSelected = selectedWashMode === mode.key;
                        return (
                          <button key={mode.key} type="button" onClick={() => setSelectedWashMode(mode.key)}
                            className={`relative rounded-2xl border-2 p-3.5 text-left transition ${
                              isSelected
                                ? `border-transparent bg-gradient-to-br ${mode.accent} text-white shadow-[0_4px_16px_rgba(0,0,0,0.15)]`
                                : hasConflict
                                  ? "border-rose-200 bg-rose-50 opacity-70 cursor-pointer"
                                  : "border-slate-100 bg-white hover:border-slate-300 hover:shadow-sm"
                            }`}>
                            {hasConflict && (
                              <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white">!</span>
                            )}
                            <p className={`text-sm font-black ${isSelected ? "text-white" : hasConflict ? "text-rose-700" : "text-slate-900"}`}>{mode.label}</p>
                            <p className={`text-[11px] font-semibold mt-0.5 ${isSelected ? "text-white/80" : "text-slate-500"}`}>{mode.duration} min · {mode.price} DA</p>
                            <p className={`text-[11px] font-semibold mt-0.5 ${isSelected ? "text-white/70" : "text-slate-400"}`}>{slotStart} → {end}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Conflict warning for selected mode */}
                  {conflictsForAppointment.length > 0 && (
                    <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-rose-800">Créneau déjà occupé</p>
                        <p className="text-xs text-rose-700 mt-0.5">
                          {conflictsForAppointment.map((b) => `${getBookingClientName(b)} (${b.start_time.slice(0,5)}–${b.end_time.slice(0,5)})`).join(", ")}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Payment status */}
                  <div>
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Statut du paiement</label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setPaymentStatus("EN_ATTENTE")}
                        className={`rounded-2xl border-2 py-3 text-sm font-bold transition ${
                          paymentStatus === "EN_ATTENTE"
                            ? "border-amber-400 bg-amber-50 text-amber-900 shadow-[0_2px_8px_rgba(245,158,11,0.2)]"
                            : "border-slate-100 bg-white text-slate-500 hover:border-amber-200"
                        }`}>
                        En attente
                      </button>
                      <button type="button" onClick={() => setPaymentStatus("PAYE")}
                        className={`rounded-2xl border-2 py-3 text-sm font-bold transition ${
                          paymentStatus === "PAYE"
                            ? "border-emerald-400 bg-emerald-50 text-emerald-900 shadow-[0_2px_8px_rgba(16,185,129,0.2)]"
                            : "border-slate-100 bg-white text-slate-500 hover:border-emerald-200"
                        }`}>
                        Payé
                      </button>
                    </div>
                  </div>

                  {/* Price summary */}
                  <div className={`rounded-2xl border p-4 bg-gradient-to-br ${selectedMode.accent} text-white`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-white/70 uppercase tracking-wider">Total à régler</p>
                        <p className="text-xs text-white/60 mt-0.5">{selectedMode.duration} min · {slotStart} → {appointmentEnd}</p>
                      </div>
                      <p className="text-3xl font-black">{selectedMode.price} <span className="text-lg font-semibold">DA</span></p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP 2: Maintenance form ── */}
              {bookingType === "maintenance" && (
                <div className="p-6 space-y-5">
                  <button type="button" onClick={() => setBookingType(null)} className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    Retour
                  </button>

                  {/* Duration */}
                  <div>
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Durée de la maintenance</label>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {[15, 30, 45, 60, 75, 90, 105, 120].map((dur) => {
                        const end = addMinutesToTime(slotStart, dur);
                        const hasConflict = bookings.some((b) => {
                          if (b.status === "ANNULE") return false;
                          if (b.resource !== resId) return false;
                          return overlapsSlot(toMinutes(b.start_time), toMinutes(b.end_time), toMinutes(slotStart), toMinutes(end));
                        });
                        const isSelected = maintenanceDuration === dur;
                        return (
                          <button key={dur} type="button" onClick={() => setMaintenanceDuration(dur)}
                            className={`relative rounded-xl border-2 py-2.5 text-center text-xs font-bold transition ${
                              isSelected
                                ? "border-amber-500 bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-[0_4px_12px_rgba(245,158,11,0.3)]"
                                : hasConflict
                                  ? "border-rose-200 bg-rose-50 text-rose-600"
                                  : "border-slate-100 bg-white text-slate-600 hover:border-amber-300 hover:text-amber-700"
                            }`}>
                            {hasConflict && !isSelected && (
                              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white">!</span>
                            )}
                            {dur}m
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <input type="number" value={maintenanceDuration} min={15} step={15}
                        onChange={(e) => { const v = parseInt(e.target.value) || 15; setMaintenanceDuration(Math.max(15, Math.round(v / 15) * 15)); }}
                        className="w-24 rounded-xl border border-amber-200 bg-amber-50/40 px-3 py-2 text-center text-sm font-bold text-slate-900 outline-none focus:border-amber-400 focus:bg-white transition" />
                      <span className="text-sm text-slate-500 font-semibold">minutes</span>
                      <span className="ml-auto text-sm font-bold text-slate-600">{slotStart} <span className="text-slate-400 font-normal">→</span> {maintenanceEnd}</span>
                    </div>
                  </div>

                  {/* Conflict warning */}
                  {conflictsForMaintenance.length > 0 && (
                    <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-rose-800">Créneau déjà occupé</p>
                        <p className="text-xs text-rose-700 mt-0.5">
                          {conflictsForMaintenance.map((b) =>
                            b.user === null
                              ? `Maintenance existante (${b.start_time.slice(0,5)}–${b.end_time.slice(0,5)})`
                              : `${getBookingClientName(b)} (${b.start_time.slice(0,5)}–${b.end_time.slice(0,5)})`
                          ).join(", ")}
                        </p>
                        <p className="text-xs text-rose-600 mt-1 font-semibold">La maintenance sera tout de même bloquée côté serveur si le créneau est libre.</p>
                      </div>
                    </div>
                  )}

                  {/* Summary card */}
                  <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-[0_4px_12px_rgba(245,158,11,0.3)]">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-black text-amber-900">{selectedSlotForBooking.resource.label} — {maintenanceDuration} min</p>
                        <p className="text-xs text-amber-700 font-semibold mt-0.5 capitalize">{dateLabel} · {slotStart} → {maintenanceEnd}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Sticky footer ── */}
            {bookingType === "appointment" && !quickCreateOpen && (
              <div className="border-t border-slate-100 bg-white px-6 py-4">
                <button type="button" disabled={submittingBooking || !selectedClientForBooking || conflictsForAppointment.length > 0} onClick={handleSaveManualBooking}
                  className="w-full rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 py-3.5 text-sm font-bold text-white shadow-[0_4px_16px_rgba(14,165,233,0.3)] transition hover:shadow-[0_6px_20px_rgba(14,165,233,0.4)] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none">
                  {submittingBooking ? "Enregistrement..." : conflictsForAppointment.length > 0 ? "Créneau indisponible" : !selectedClientForBooking ? "Sélectionnez un client" : "Confirmer le rendez-vous →"}
                </button>
              </div>
            )}
            {bookingType === "maintenance" && (
              <div className="border-t border-slate-100 bg-white px-6 py-4">
                <button type="button" disabled={submittingBooking || conflictsForMaintenance.length > 0} onClick={handleSaveMaintenanceBooking}
                  className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 py-3.5 text-sm font-bold text-white shadow-[0_4px_16px_rgba(245,158,11,0.3)] transition hover:shadow-[0_6px_20px_rgba(245,158,11,0.4)] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none">
                  {submittingBooking ? "Enregistrement..." : conflictsForMaintenance.length > 0 ? "Créneau indisponible" : "Planifier la maintenance →"}
                </button>
              </div>
            )}

          </div>
        </div>
        );
      })()}
      </main>
      {/* Quick access ticket button on customer detail pages */}
      {location.pathname.includes("/admin/dashboard/customers/") && !location.pathname.includes("/ticket") && (
        <div className="fixed top-6 right-6 z-50">
          <button
            type="button"
            onClick={() => navigate(`${location.pathname}/ticket`)}
            aria-label="voir-ticket"
            className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-sky-500"
          >
            Voir le ticket
          </button>
        </div>
      )}
    </div>
  );
}

// Minimal Components
type TabButtonProps = {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
};

function TabButton({ active, onClick, label, icon }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition whitespace-nowrap cursor-pointer ${
        active
          ? "bg-sky-600 text-white shadow-md shadow-sky-100"
          : "text-slate-600 hover:bg-sky-50 hover:text-slate-900"
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}