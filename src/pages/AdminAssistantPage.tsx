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
  status: "EN_ATTENTE" | "PAYE" | "ANNULE";
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
  const [selectedSlotForBooking, setSelectedSlotForBooking] = useState<{
    resource: Resource;
    time: string;
  } | null>(null);
  const [selectedClientForBooking, setSelectedClientForBooking] = useState<Customer | null>(null);
  const [bookingDuration, setBookingDuration] = useState<15 | 30 | 60>(30);
  const [searchClientForBooking, setSearchClientForBooking] = useState("");
  const [clientsForBookingResults, setClientsForBookingResults] = useState<Customer[]>([]);
  const [submittingBooking, setSubmittingBooking] = useState(false);

  // Quick Client Creation inside Modal
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickLastName, setQuickLastName] = useState("");
  const [quickFirstName, setQuickFirstName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
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

  const session = getAuthSession();
  const userPhone = session?.phone || "0000000000";

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
  }, [searchClientQuery, activeTab, refreshCounter, isTicketRoute, t]);

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
  }, [searchClientForBooking, selectedSlotForBooking]);

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
            `/api/users/?search=${encodeURIComponent(normalized)}&role=CUSTOMER`,
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
  }, [searchBookingQuery, activeTab, isTicketRoute]);

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
      const startTime = selectedSlotForBooking.time;
      const endTime = addMinutesToTime(startTime, bookingDuration);

      const payload = {
        resource: selectedSlotForBooking.resource.id,
        user: selectedClientForBooking.id,
        booking_date: selectedDate,
        start_time: startTime,
        end_time: endTime,
        status: "PAYE", // manually validation implies payment on-site
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
        setSelectedClientForBooking(null);
        setSearchClientForBooking("");
        triggerRefresh();

        // Print receipt immediately
        handlePrintReceipt(createdBooking.id);
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

  // Register client inside booking modal
  const handleQuickCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const secret = String(Math.floor(100000 + Math.random() * 900000));
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
        // Print receipt
        handlePrintReceipt(bookingId);
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
                <div className="max-h-[calc(100vh-320px)] overflow-auto">
                  <table className="min-w-[980px] w-full border-separate border-spacing-0 text-left text-sm">
                    <thead className="sticky top-0 z-20 bg-white/95 backdrop-blur">
                      <tr className="border-b border-sky-100 bg-sky-50/70">
                        <th className="sticky left-0 z-30 w-24 border-b border-sky-100 bg-sky-50/95 p-4 font-black text-slate-700 shadow-[8px_0_20px_rgba(15,23,42,0.04)]">
                          Heure
                        </th>
                        {resources.map((res) => (
                          <th key={res.id} className="min-w-[220px] border-b border-sky-100 p-4 text-center font-black text-slate-800">
                            <div className="flex flex-col items-center gap-1">
                              <span>{res.label}</span>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] ${
                                  res.status === "ACTIF"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-rose-100 text-rose-800"
                                }`}
                              >
                                {res.status === "ACTIF" ? "Actif" : "En panne"}
                              </span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {slots.map((time, index) => {
                        const slotMins = toMinutes(time);
                        return (
                          <tr key={time} className="group border-b border-sky-50/80 hover:bg-slate-50/40">
                            <td className="sticky left-0 z-10 border-b border-sky-50 bg-white p-4 font-black text-slate-600 shadow-[8px_0_20px_rgba(15,23,42,0.04)]">
                              <div className="flex flex-col">
                                <span className="text-sm">{time}</span>
                                <span className="text-[10px] font-semibold text-slate-400">15 min</span>
                              </div>
                            </td>
                            {resources.map((res) => {
                              if (res.status === "EN_PANNE") {
                                return (
                                  <td key={res.id} className="border-b border-sky-50 bg-rose-50/20 p-2">
                                    <div className="flex h-full min-h-[64px] items-center justify-center rounded-[1.25rem] border border-rose-100 bg-rose-50/50 px-3 text-xs font-bold text-rose-700">
                                      Hors service
                                    </div>
                                  </td>
                                );
                              }

                              const activeBooking = bookings.find((booking) => {
                                if (booking.status === "ANNULE") {
                                  return false;
                                }
                                if (booking.resource !== res.id) {
                                  return false;
                                }
                                const bookingStart = toMinutes(booking.start_time);
                                const bookingEnd = toMinutes(booking.end_time);
                                return overlapsSlot(bookingStart, bookingEnd, slotMins, slotMins + CALENDAR_STEP_MINUTES);
                              });

                              if (activeBooking) {
                                const isPaid = activeBooking.status === "PAYE";
                                const isCurrent = selectedBookingDetails?.id === activeBooking.id;
                                return (
                                  <td key={res.id} className="border-b border-sky-50 p-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigate(`/admin/dashboard/bookings/${activeBooking.id}`, {
                                          state: { booking: activeBooking, returnTo: location.pathname },
                                        });
                                      }}
                                      className={`group/slot flex h-full min-h-[64px] w-full cursor-pointer flex-col justify-between rounded-[1.25rem] border p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_32px_rgba(15,23,42,0.08)] focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-white ${
                                        isPaid
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                          : "border-amber-200 bg-amber-50 text-amber-900"
                                      } ${isCurrent ? "ring-2 ring-sky-400 ring-offset-2 ring-offset-white" : ""}`}
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-black">{getBookingClientName(activeBooking)}</p>
                                          <p className="mt-0.5 truncate text-[11px] font-semibold opacity-80">
                                            {activeBooking.user_phone}
                                          </p>
                                          <p className="mt-0.5 truncate text-[11px] font-semibold opacity-70">
                                            {activeBooking.booking_reference}
                                          </p>
                                        </div>
                                        <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
                                          isPaid ? "bg-white text-emerald-700" : "bg-white text-amber-700"
                                        }`}>
                                          {isPaid ? "Payé" : "En attente"}
                                        </span>
                                      </div>
                                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-semibold opacity-80">
                                        <span>{activeBooking.start_time.slice(0, 5)} - {activeBooking.end_time.slice(0, 5)}</span>
                                        <span>{activeBooking.total_price} DA</span>
                                      </div>
                                    </button>
                                  </td>
                                );
                              }

                              return (
                                <td key={res.id} className="border-b border-sky-50 p-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedSlotForBooking({ resource: res, time })
                                    }
                                    className="group flex h-full min-h-[64px] w-full cursor-pointer items-center justify-center rounded-[1.25rem] border border-dashed border-emerald-200 bg-emerald-50/20 px-3 text-sm font-black text-emerald-700 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-50/60 hover:shadow-[0_16px_32px_rgba(16,185,129,0.10)] focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-white"
                                  >
                                    <span className="transition group-hover:scale-[1.02]">+ Réserver</span>
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
            <div>
              <h3 className="text-xl font-bold text-slate-900">{t("machinesTitle")}</h3>
              <p className="text-xs text-slate-500">{t("machinesSubtitle")}</p>
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
                  return (
                    <div
                      key={res.id}
                      className={`rounded-3xl border p-5 flex flex-col justify-between gap-4 transition hover:shadow-md ${
                        isActive ? "border-sky-100 bg-white" : "border-rose-100 bg-rose-50/20"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-bold text-slate-900 text-base">{res.label}</p>
                          <p className="text-[10px] font-bold text-slate-400 mt-0.5">ID: {res.id}</p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                            isActive
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800 animate-pulse"
                          }`}
                        >
                          {isActive ? "Actif" : "En panne"}
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={loadingMachines}
                        onClick={() => handleToggleMachine(res)}
                        className={`w-full rounded-2xl py-2.5 text-xs font-bold transition cursor-pointer ${
                          isActive
                            ? "bg-rose-50 hover:bg-rose-100 text-rose-700"
                            : "bg-sky-50 hover:bg-sky-100 text-sky-700"
                        }`}
                      >
                        {isActive ? t("reportBroken") : t("setMachineActive")}
                      </button>
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
      {selectedSlotForBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] border border-sky-100 bg-white p-6 shadow-2xl text-slate-900">
            <div className="flex items-center justify-between border-b border-sky-50 pb-4 mb-4">
              <div>
                <h4 className="text-lg font-bold text-slate-900">Nouvelle Réservation Manuelle</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedSlotForBooking.resource.label} • {selectedSlotForBooking.time} •{" "}
                  {selectedDate}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedSlotForBooking(null);
                  setSelectedClientForBooking(null);
                  setSearchClientForBooking("");
                  setQuickCreateOpen(false);
                }}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>


            {/* Quick Register New Client Panel (Toggle inside Modal) */}
            {quickCreateOpen ? (
              <form onSubmit={handleQuickCreateClient} className="space-y-4">
                <div className="flex justify-between items-center">
                  <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Création rapide client
                  </h5>
                  <button
                    type="button"
                    onClick={() => setQuickCreateOpen(false)}
                    className="text-xs text-sky-600 hover:underline cursor-pointer"
                  >
                    Retour à la recherche
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-semibold text-slate-600">
                    Nom
                    <input
                      type="text"
                      required
                      value={quickLastName}
                      onChange={(e) => setQuickLastName(e.target.value)}
                      className="w-full mt-1 rounded-xl border border-sky-50 bg-sky-50/40 px-3 py-2 text-slate-900 outline-none"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-600">
                    Prénom
                    <input
                      type="text"
                      required
                      value={quickFirstName}
                      onChange={(e) => setQuickFirstName(e.target.value)}
                      className="w-full mt-1 rounded-xl border border-sky-50 bg-sky-50/40 px-3 py-2 text-slate-900 outline-none"
                    />
                  </label>
                </div>
                <label className="block text-xs font-semibold text-slate-600">
                  Téléphone
                  <input
                    type="text"
                    required
                    value={quickPhone}
                    onChange={(e) => setQuickPhone(e.target.value)}
                    className="w-full mt-1 rounded-xl border border-sky-50 bg-sky-50/40 px-3 py-2 text-slate-900 outline-none"
                  />
                </label>

                <button
                  type="submit"
                  disabled={quickSubmitting}
                  className="w-full rounded-2xl bg-sky-600 text-white font-bold py-2.5 text-xs transition cursor-pointer"
                >
                  {quickSubmitting ? "Création..." : "Créer le client"}
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                {/* Client Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {t("selectClientForBooking")}
                  </label>
                  {selectedClientForBooking ? (
                    <div className="mt-2 flex items-center justify-between p-3 rounded-2xl bg-emerald-50 border border-emerald-100">
                      <div>
                        <p className="font-bold text-emerald-950 text-sm">
                          {selectedClientForBooking.first_name} {selectedClientForBooking.last_name}
                        </p>
                        <p className="text-xs text-emerald-800">{selectedClientForBooking.phone}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedClientForBooking(null)}
                        className="text-xs font-bold text-sky-700 hover:underline cursor-pointer"
                      >
                        Modifier
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2 items-center mt-2">
                        <input
                          type="text"
                          value={searchClientForBooking}
                          onChange={(e) => setSearchClientForBooking(e.target.value)}
                          placeholder="Rechercher par nom ou numéro..."
                          className="w-full rounded-2xl border border-sky-50 bg-sky-50/40 px-4 py-2.5 text-xs outline-none focus:bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => setQuickCreateOpen(true)}
                          className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-2.5 text-xs font-bold text-sky-700 hover:bg-sky-100 transition whitespace-nowrap cursor-pointer"
                        >
                          + Nouveau
                        </button>
                      </div>

                      {/* Dropdown list of results */}
                      {searchClientForBooking && (
                        <div className="border border-sky-50 rounded-2xl bg-white max-h-[150px] overflow-y-auto divide-y divide-sky-50 shadow-sm text-xs">
                          {clientsForBookingResults.length === 0 ? (
                            <p className="p-3 text-slate-400 text-center">Aucun client trouvé.</p>
                          ) : (
                            clientsForBookingResults.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => setSelectedClientForBooking(c)}
                                className="w-full text-left p-3 hover:bg-sky-50/50 transition flex justify-between items-center cursor-pointer"
                              >
                                <span className="font-bold text-slate-800">
                                  {c.first_name} {c.last_name}
                                </span>
                                <span className="text-slate-400 font-semibold">{c.phone}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Duration */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {t("durationLabel")}
                  </label>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {([15, 30, 60] as const).map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => setBookingDuration(dur)}
                        className={`rounded-2xl border py-2.5 text-xs font-bold transition ${
                          bookingDuration === dur
                            ? "border-sky-600 bg-sky-600 text-white"
                            : "border-sky-50 bg-sky-50/30 text-slate-600 hover:bg-sky-50"
                        }`}
                      >
                        {dur} min
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pricing Summary */}
                <div className="bg-sky-50/40 border border-sky-100 p-4 rounded-2xl text-xs flex justify-between items-center">
                  <div>
                    <span className="text-slate-500 font-bold block">Prix total</span>
                    <span className="text-slate-400 mt-0.5 block font-medium">Tarif: 15 DA / min</span>
                  </div>
                  <span className="text-lg font-extrabold text-slate-900">
                    {bookingDuration * 15} DA
                  </span>
                </div>

                {/* Submit */}
                <button
                  type="button"
                  disabled={submittingBooking || !selectedClientForBooking}
                  onClick={handleSaveManualBooking}
                  className="w-full rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-bold py-3.5 text-xs transition shadow-lg shadow-sky-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {submittingBooking ? "Enregistrement..." : t("saveBooking")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
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