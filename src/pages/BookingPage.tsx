import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";

import { authHeader, clearAuthSession, getAuthSession } from "../auth/session";
import { ClientBrandPanel } from "../components/ClientBrandPanel";
import { LANGUAGE_STORAGE_KEY, localizeResourceLabel, type AppLanguage } from "../i18n";
import logoImg from "../assets/logo.png";
import heroBgImg from "../assets/background.png";

type BookingPageProps = {
  language: AppLanguage;
  phoneNumber?: string;
};

type WashModeKey = string;
type WizardStep = "mode" | "calendar" | "time";
type DashboardTab = "myBookings" | "newBooking";

type WashMode = {
  key: WashModeKey;
  label: string;
  duration: number;
  pricePerMinute: number;
  price: number;            // prix total effectif (prix_specifique ?? prix_base)
  accent: string;
  description: string;      // message_guide
  clothTypes: string[];     // types_vetements
  recommended: boolean;     // recommandé pour cet établissement
};

// Forme brute renvoyée par /api/establishments/{id}/modes/
type ApiMode = {
  id: number;
  nom: string;
  nom_ar?: string;
  duree: number;
  prix_base: string | number;
  prix_effectif: string | number;
  capacite_max?: string | number;
  types_vetements?: string[];
  types_vetements_ar?: string[];
  message_guide?: string;
  message_guide_ar?: string;
  recommande?: boolean;
};

type BookingRecord = {
  id: number;
  booking_reference: string;
  resource: number;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: "EN_ATTENTE" | "PAYE" | "ANNULE" | string;
  total_price: string;
  resource_label: string;
  establishment_name: string;
};

type TimeSlot = {
  start_time: string;
  end_time: string;
  reserved_resources: number;
  total_resources: number;
  available_resources: number;
  status: "AVAILABLE" | "FULL" | "CLOSED";
  status_label: string;
  color: string;
};

type DayAvailability = {
  date: string;
  label: string;
  weekday: string;
  slots: TimeSlot[];
  opening_time: string;
  closing_time: string;
  total_resources: number;
  availableCount: number;
  fullCount: number;
  isAvailable: boolean;
};

type ConfirmationDraft = {
  booking_date: string;
  start_time: string;
  end_time: string;
  total_price: string;
  modeLabel: string;
  modeKey?: string;
  bookingStatus?: string;
  paymentMethod: "cash" | "baridimob";
  clientName: string;
  establishmentName: string;
  establishmentAddress: string;
  bookingId: number | null;
};

function loadBookingResumeDraft(state: unknown): ConfirmationDraft | null {
  if (state && typeof state === "object") {
    const candidate = state as Partial<ConfirmationDraft>;
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
        paymentMethod: candidate.paymentMethod === "baridimob" ? "baridimob" : "cash",
      } as ConfirmationDraft;
    }
  }

  return null;
}

function getModeKeyFromDraft(draft: ConfirmationDraft | null): WashModeKey | null {
  if (!draft) {
    return null;
  }
  return draft.modeKey ?? null;
}

const ACKNOWLEDGED_VALIDATIONS_KEY = "chrono-acknowledged-validations";
const PRICE_PER_MINUTE = 15;
const DAY_COUNT = 30;
const SLOT_STEP_MINUTES = 15;
// Marge tampon (min) imposée entre deux réservations — doit rester alignée sur
// BOOKING_BUFFER_MINUTES côté backend (api/views.py).
const BOOKING_BUFFER_MINUTES = 5;
const OPEN_MINUTES = 8 * 60;
const CLOSE_MINUTES = 22 * 60;

// Dégradés appliqués cycliquement aux cartes de modes (préserve le design existant)
const MODE_ACCENTS = [
  "from-cyan-500 to-sky-600",
  "from-sky-500 to-blue-600",
  "from-blue-500 to-indigo-600",
  "from-slate-900 to-slate-700",
];

function mapApiMode(apiMode: ApiMode, index: number, language: AppLanguage = "fr"): WashMode {
  const duration = Number(apiMode.duree) || 1;
  const price = Number(apiMode.prix_effectif ?? apiMode.prix_base ?? 0);
  const isAr = language === "ar";
  // Si la traduction arabe existe on l'utilise, sinon on retombe sur le français.
  const label = isAr && apiMode.nom_ar?.trim() ? apiMode.nom_ar : apiMode.nom;
  const description = isAr && apiMode.message_guide_ar?.trim()
    ? apiMode.message_guide_ar
    : (apiMode.message_guide || "");
  const clothTypesAr = Array.isArray(apiMode.types_vetements_ar) ? apiMode.types_vetements_ar : [];
  const clothTypesFr = Array.isArray(apiMode.types_vetements) ? apiMode.types_vetements : [];
  const clothTypes = isAr && clothTypesAr.length > 0 ? clothTypesAr : clothTypesFr;
  return {
    key: String(apiMode.id),
    label,
    duration,
    price,
    pricePerMinute: duration > 0 ? Math.round(price / duration) : price,
    accent: MODE_ACCENTS[index % MODE_ACCENTS.length],
    description,
    clothTypes,
    recommended: Boolean(apiMode.recommande),
  };
}

const BOOKING_STEP_PATHS: Record<WizardStep, string> = {
  mode: "/appointments/mode",
  calendar: "/appointments/calendar",
  time: "/appointments/time",
};

function getModeByKey(modes: WashMode[], modeKey: WashModeKey | null): WashMode | undefined {
  return modes.find((mode) => mode.key === modeKey) ?? modes[0];
}

function getModeByDuration(modes: WashMode[], durationMinutes: number): WashMode | undefined {
  return modes.find((mode) => mode.duration === durationMinutes) ?? modes[0];
}

function getWizardStepFromPath(pathname: string): WizardStep {
  if (pathname.includes("/time")) {
    return "time";
  }

  if (pathname.includes("/calendar")) {
    return "calendar";
  }

  return "mode";
}

function isBookingPath(pathname: string) {
  return pathname === "/appointments" || pathname.startsWith("/appointments/");
}

function isDashboardHomePath(pathname: string) {
  return pathname === "/appointments" || pathname === "/appointments/";
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeKey(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function addMinutesToTime(timeValue: string, minutesToAdd: number) {
  const [hours, minutes] = timeValue.split(":").map(Number);
  // On reste sur 24h : 24:00 devient 00:00 (évite une heure invalide côté API)
  const total = (hours * 60 + minutes + minutesToAdd) % (24 * 60);
  return formatTimeKey(total);
}

function isValidTimeValue(timeValue: string) {
  return /^\d{2}:\d{2}$/.test(timeValue);
}

function dateToLabel(dateValue: string, language: AppLanguage) {
  const current = new Date(`${dateValue}T12:00:00`);
  return new Intl.DateTimeFormat(language === "ar" ? "ar-DZ" : "fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(current);
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

function getNextDates(count: number) {
  const dates: string[] = [];
  const today = new Date();

  for (let index = 0; index < count; index += 1) {
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + index);
    dates.push(formatDateKey(nextDate));
  }

  return dates;
}

function getMinutesFromTime(timeValue: string) {
  const [hours, minutes] = timeValue.split(":").map(Number);
  return hours * 60 + minutes;
}

function getVisibleSlots(dayAvailability: DayAvailability | undefined) {
  return [...(dayAvailability?.slots ?? [])].sort((left, right) => left.start_time.localeCompare(right.start_time));
}

function filterTodaySlotsWithLeadTime(dateValue: string, slots: TimeSlot[], leadMinutes = 0) {
  const todayKey = formatDateKey(new Date());
  if (dateValue !== todayKey) {
    return slots;
  }

  const now = new Date();
  // On garde uniquement les créneaux dont le début est >= maintenant :
  // la grille étant calée sur 15 min, le 1er créneau affiché sera la prochaine
  // borne (xx:00 / xx:15 / xx:30 / xx:45).
  const minStartMinutes = now.getHours() * 60 + now.getMinutes() + leadMinutes;

  return slots.filter((slot) => getMinutesFromTime(slot.start_time) >= minStartMinutes);
}

function buildDayAvailability(dateValue: string, apiResponse: any, language: AppLanguage): DayAvailability {
  const rawSlots: TimeSlot[] = Array.isArray(apiResponse?.slots) ? apiResponse.slots : [];
  const slots = filterTodaySlotsWithLeadTime(dateValue, rawSlots, 0);
  const availableCount = slots.filter((slot) => slot.status === "AVAILABLE").length;
  const fullCount = slots.filter((slot) => slot.status === "FULL").length;

  return {
    date: dateValue,
    label: dateToLabel(dateValue, language),
    weekday: dateToLabel(dateValue, language).split(" ")[0],
    slots,
    opening_time: apiResponse?.opening_time ?? "08:00",
    closing_time: apiResponse?.closing_time ?? "22:00",
    total_resources: apiResponse?.total_resources ?? 0,
    availableCount,
    fullCount,
    isAvailable: availableCount > 0,
  };
}

function getSlotClass(slot: TimeSlot, selected = false) {
  if (selected) {
    return "border-sky-600 bg-sky-600 text-white shadow-[0_14px_40px_rgba(14,165,233,0.28)]";
  }

  if (slot.status === "AVAILABLE") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100";
  }

  if (slot.status === "FULL") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }

  return "border-slate-200 bg-slate-100 text-slate-500";
}

function getDayCardClass(day: DayAvailability) {
  return day.isAvailable
    ? "border-slate-200 bg-white text-slate-900 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
    : "border-rose-200 bg-rose-50 text-rose-900 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(244,63,94,0.14)]";
}

export function BookingPage({ language, phoneNumber }: BookingPageProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const isArabic = language === "ar";
  const session = getAuthSession();
  const resumeDraft = useMemo(() => loadBookingResumeDraft(location.state), [location.state]);
  const resumeModeKey = useMemo(() => getModeKeyFromDraft(resumeDraft), [resumeDraft]);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!session) {
      navigate("/login", { replace: true });
    }
  }, [session, navigate]);

  // Return early if not authenticated to prevent rendering booking page without session
  if (!session) {
    return null;
  }

  const customerPhone = phoneNumber || session?.phone || "";
  const establishmentId = session?.establishmentId ?? 1;
  const establishmentName = session?.establishmentName ?? "Laverie de la residence - Laverie Automatique";
  const [clientDisplayName, setClientDisplayName] = useState("Client");
  const [establishmentDisplayName, setEstablishmentDisplayName] = useState(establishmentName);
  const [establishmentAddress, setEstablishmentAddress] = useState("Adresse non renseignée");

  const [dashboardTab, setDashboardTab] = useState<DashboardTab>(resumeDraft ? "newBooking" : "myBookings");
  const [modes, setModes] = useState<WashMode[]>([]);
  const [modesLoading, setModesLoading] = useState(true);
  const [selectedModeKey, setSelectedModeKey] = useState<WashModeKey>(resumeModeKey ?? "");
  const [selectedDate, setSelectedDate] = useState(resumeDraft?.booking_date ?? formatDateKey(new Date()));
  const [selectedTime, setSelectedTime] = useState(resumeDraft?.start_time ?? "");
  const [selectedBookingToEdit, setSelectedBookingToEdit] = useState<BookingRecord | null>(
    resumeDraft?.bookingId !== null && typeof resumeDraft?.bookingId === "number"
      ? ({ id: resumeDraft.bookingId, status: resumeDraft.bookingStatus ?? "EN_ATTENTE" } as BookingRecord)
      : null
  );
  const [selectedBookingDetails, setSelectedBookingDetails] = useState<BookingRecord | null>(null);
  const [userBookings, setUserBookings] = useState<BookingRecord[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [availabilityByDate, setAvailabilityByDate] = useState<Record<string, DayAvailability>>({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [validatedModalOpen, setValidatedModalOpen] = useState(false);
  const [validatedBookingId, setValidatedBookingId] = useState<number | null>(null);
  // Rendez-vous validés (PAYE) que le client a déjà acquittés : on les masque de
  // son interface (ils restent en base pour les statistiques).
  const [acknowledgedValidations, setAcknowledgedValidations] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const parsed = JSON.parse(window.localStorage.getItem(ACKNOWLEDGED_VALIDATIONS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const latestAvailabilityRequestRef = useRef(0);
  const wizardStep = useMemo(() => getWizardStepFromPath(location.pathname), [location.pathname]);

  const selectedMode = useMemo(() => getModeByKey(modes, selectedModeKey), [modes, selectedModeKey]);
  const selectedPrice = selectedMode?.price ?? 0;

  // Mémorise la sélection courante pour la restaurer après navigation (page de détail, etc.)
  useEffect(() => {
    if (selectedModeKey && typeof window !== "undefined") {
      window.sessionStorage.setItem("chrono-selected-mode", selectedModeKey);
    }
  }, [selectedModeKey]);
  const activeBookings = useMemo(
    () =>
      userBookings.filter(
        (booking) =>
          booking.status !== "ANNULE" &&
          // Les rendez-vous validés que le client a acquittés disparaissent de
          // son interface (ils restent en base pour les statistiques).
          !acknowledgedValidations.includes(booking.id)
      ),
    [userBookings, acknowledgedValidations]
  );
  const hasBookings = activeBookings.length > 0;
  // Anti-spam : une seule réservation EN_ATTENTE autorisée à la fois
  const pendingBookings = useMemo(
    () => userBookings.filter((booking) => booking.status === "EN_ATTENTE"),
    [userBookings]
  );
  // Bloque la création d'une nouvelle réservation (sauf si on modifie celle déjà en attente)
  const isBlockedByPending = pendingBookings.length > 0 && !selectedBookingToEdit;
  const isDashboardHome = isDashboardHomePath(location.pathname);
  const showDashboardHome = isDashboardHome && hasBookings;
  const selectedDayAvailability = availabilityByDate[selectedDate];
  const visibleSlots = useMemo(() => getVisibleSlots(selectedDayAvailability), [selectedDayAvailability]);
  const calendarDates = useMemo(() => getNextDates(DAY_COUNT), []);

  const handleLogout = () => {
    clearAuthSession();
    navigate("/login", { replace: true });
  };

  const handleLanguageChange = (nextLanguage: AppLanguage) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    setLanguageMenuOpen(false);
    window.location.reload();
  };

  const resetWizard = (keepMode = false, target: "mode" | "home" = "mode") => {
    setSelectedDate(formatDateKey(new Date()));
    setSelectedTime("");
    setSelectedBookingToEdit(null);
    if (!keepMode) {
      setSelectedModeKey(modes[0]?.key ?? "");
    }
    navigate(target === "home" ? "/appointments" : BOOKING_STEP_PATHS.mode, { replace: true });
  };

  useEffect(() => {
    if (bookingsLoading) {
      return;
    }

    if (!isBookingPath(location.pathname)) {
      return;
    }

    const validPaths = ["/appointments", ...Object.values(BOOKING_STEP_PATHS)];
    if (!validPaths.includes(location.pathname)) {
      navigate(hasBookings ? "/appointments" : BOOKING_STEP_PATHS.mode, { replace: true });
      return;
    }

    if (isDashboardHome && !hasBookings) {
      setDashboardTab("newBooking");
      navigate(BOOKING_STEP_PATHS.mode, { replace: true });
    }
  }, [bookingsLoading, hasBookings, isDashboardHome, location.pathname, navigate]);

  const refreshAll = () => setRefreshCounter((value) => value + 1);

  // Affiche la fenêtre de confirmation dès qu'un rendez-vous validé (PAYE) n'a
  // pas encore été acquitté par le client. Fonctionne aussi bien lors d'une
  // validation en direct qu'au rechargement si elle a eu lieu en son absence.
  useEffect(() => {
    if (validatedModalOpen) {
      return;
    }
    const newlyValidated = userBookings.find(
      (booking) => booking.status === "PAYE" && !acknowledgedValidations.includes(booking.id)
    );
    if (newlyValidated) {
      setValidatedBookingId(newlyValidated.id);
      setValidatedModalOpen(true);
    }
  }, [userBookings, validatedModalOpen, acknowledgedValidations]);

  const acknowledgeValidation = () => {
    if (validatedBookingId != null) {
      setAcknowledgedValidations((prev) => {
        if (prev.includes(validatedBookingId)) return prev;
        const next = [...prev, validatedBookingId];
        if (typeof window !== "undefined") {
          window.localStorage.setItem(ACKNOWLEDGED_VALIDATIONS_KEY, JSON.stringify(next));
        }
        return next;
      });
    }
    setValidatedModalOpen(false);
    setValidatedBookingId(null);
  };

  // Tant qu'un rendez-vous est en attente de paiement, on rafraîchit
  // périodiquement pour détecter sa validation côté caisse en temps quasi réel.
  useEffect(() => {
    const hasPending = userBookings.some((booking) => booking.status === "EN_ATTENTE");
    if (!hasPending) {
      return;
    }
    const intervalId = window.setInterval(() => {
      void loadUserBookings(true);
    }, 8000);
    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userBookings]);

  // `silent` : rafraîchissement en arrière-plan (polling) qui ne déclenche pas
  // l'écran de chargement plein écran.
  const loadUserBookings = async (silent = false) => {
    if (!customerPhone) {
      setUserBookings([]);
      setBookingsLoading(false);
      return;
    }

    if (!silent) {
      setBookingsLoading(true);
    }
    try {
      const response = await fetch(
        `/api/bookings/?search=${encodeURIComponent(customerPhone)}&establishment_id=${establishmentId}`,
        { headers: authHeader() }
      );

      if (response.ok) {
        const data = (await response.json()) as BookingRecord[];
        setUserBookings(Array.isArray(data) ? data : []);
      } else if (!silent) {
        setUserBookings([]);
      }
    } catch {
      if (!silent) {
        setUserBookings([]);
      }
    } finally {
      if (!silent) {
        setBookingsLoading(false);
      }
    }
  };

  const loadAvailability = async (mode: WashMode, signal: AbortSignal, requestId: number) => {
    setAvailabilityLoading(true);
    setAvailabilityError(null);

    try {
      const dates = getNextDates(DAY_COUNT);
      const start = dates[0];
      const end = dates[dates.length - 1];

      const response = await fetch(
        `/api/bookings/available-slots-range/?start=${start}&end=${end}&establishment_id=${establishmentId}&duration=${mode.duration}`,
        {
          signal,
          headers: authHeader(),
        }
      );

      if (!response.ok) {
        throw new Error(`Server returned ${response.status} ${response.statusText}`);
      }

      const payload = (await response.json()) as { availability?: Record<string, any> };

      const entries: Array<readonly [string, DayAvailability]> = Object.keys(payload.availability || {}).map((dateKey) => {
        const dayPayload = payload.availability[dateKey];
        return [dateKey, buildDayAvailability(dateKey, dayPayload, language)] as const;
      });

      if (!signal.aborted && requestId === latestAvailabilityRequestRef.current) {
        setAvailabilityByDate(Object.fromEntries(entries));
      }
    } catch (err) {
      if (!signal.aborted && requestId === latestAvailabilityRequestRef.current) {
        // Log to console for debugging and expose a more informative message in the UI
        // so the developer/user can see HTTP status or parsing errors.
        // eslint-disable-next-line no-console
        console.error("loadAvailability error:", err);
        const message = err instanceof Error ? err.message : String(err);
        setAvailabilityError(`Impossible de charger le calendrier. (${message})`);
        setAvailabilityByDate({});
      }
    } finally {
      if (!signal.aborted && requestId === latestAvailabilityRequestRef.current) {
        setAvailabilityLoading(false);
      }
    }
  };

  useEffect(() => {
    loadUserBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerPhone, establishmentId, refreshCounter]);

  useEffect(() => {
    let isMounted = true;

    const loadProfileDetails = async () => {
      try {
        const [userResponse, establishmentResponse] = await Promise.all([
          fetch(`/api/users/${session.userId}/`, { headers: authHeader() }),
          fetch(`/api/establishments/${establishmentId}/`, { headers: authHeader() }),
        ]);

        if (isMounted && userResponse.ok) {
          const userPayload = (await userResponse.json()) as { first_name?: string; last_name?: string };
          const nameParts = [userPayload.first_name, userPayload.last_name].filter(Boolean);
          setClientDisplayName(nameParts.length > 0 ? nameParts.join(" ") : "Client");
        }

        if (isMounted && establishmentResponse.ok) {
          const establishmentPayload = (await establishmentResponse.json()) as {
            name?: string;
            address?: string;
          };
          if (establishmentPayload.name) {
            setEstablishmentDisplayName(establishmentPayload.name);
          }
          setEstablishmentAddress(establishmentPayload.address || "Adresse non renseignée");
        }
      } catch {
        if (isMounted) {
          setClientDisplayName("Client");
          setEstablishmentDisplayName(establishmentName);
          setEstablishmentAddress("Adresse non renseignée");
        }
      }
    };

    void loadProfileDetails();

    return () => {
      isMounted = false;
    };
  }, [establishmentId, establishmentName, session.userId]);

  // Charge dynamiquement les modes de lavage configurés pour l'établissement du client
  useEffect(() => {
    let isMounted = true;

    const loadModes = async () => {
      setModesLoading(true);
      try {
        const response = await fetch(`/api/establishments/${establishmentId}/modes/`, {
          headers: authHeader(),
        });
        if (!response.ok) {
          if (isMounted) setModes([]);
          return;
        }
        const data = (await response.json()) as ApiMode[];
        if (!isMounted) return;

        const mapped = Array.isArray(data) ? data.map((m, i) => mapApiMode(m, i, language)) : [];
        setModes(mapped);

        // Restaure la sélection mémorisée (survit à la navigation vers la page de détail)
        const stored = typeof window !== "undefined"
          ? window.sessionStorage.getItem("chrono-selected-mode")
          : null;
        setSelectedModeKey((prev) => {
          if (mapped.some((m) => m.key === prev)) return prev;
          if (stored && mapped.some((m) => m.key === stored)) return stored;
          return mapped[0]?.key ?? "";
        });
      } catch {
        if (isMounted) setModes([]);
      } finally {
        if (isMounted) setModesLoading(false);
      }
    };

    void loadModes();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [establishmentId, refreshCounter, language]);

  useEffect(() => {
    if (bookingsLoading) {
      return;
    }

    if (!isBookingPath(location.pathname)) {
      return;
    }

    if (!hasBookings) {
      setDashboardTab("newBooking");
      if (isDashboardHomePath(location.pathname)) {
        navigate(BOOKING_STEP_PATHS.mode, { replace: true });
      }
      return;
    }

    if (dashboardTab === "myBookings" && !isDashboardHomePath(location.pathname)) {
      navigate("/appointments", { replace: true });
    }
  }, [bookingsLoading, hasBookings, dashboardTab, location.pathname, navigate]);

  useEffect(() => {
    if (!selectedMode) {
      return;
    }

    const controller = new AbortController();
    const requestId = latestAvailabilityRequestRef.current + 1;
    latestAvailabilityRequestRef.current = requestId;

    void loadAvailability(selectedMode, controller.signal, requestId);

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModeKey, selectedMode?.duration, establishmentId, refreshCounter, language]);

  const startNewBooking = () => {
    setDashboardTab("newBooking");
    resetWizard(true);
  };

  const openBookingForEdit = (booking: BookingRecord) => {
    setSelectedBookingToEdit(booking);
    setDashboardTab("newBooking");
    const matchedMode = getModeByDuration(
      modes,
      Math.max(getMinutesFromTime(booking.end_time.slice(0, 5)) - getMinutesFromTime(booking.start_time.slice(0, 5)), 15)
    );
    if (matchedMode) {
      setSelectedModeKey(matchedMode.key);
    }
    setSelectedDate(booking.booking_date);
    setSelectedTime(booking.start_time.slice(0, 5));
    navigate(BOOKING_STEP_PATHS.calendar);
  };

  const openBookingDetails = (booking: BookingRecord) => {
    setSelectedBookingDetails(booking);
  };

  const closeBookingDetails = () => {
    setSelectedBookingDetails(null);
  };

  const selectDate = (dateValue: string) => {
    setSelectedDate(dateValue);
    navigate(BOOKING_STEP_PATHS.time);
  };

  const selectTime = (timeValue: string) => {
    if (!selectedMode) {
      return;
    }
    setSelectedTime(timeValue);
    const confirmationDraft: ConfirmationDraft = {
      booking_date: selectedDate,
      start_time: timeValue,
      end_time: addMinutesToTime(timeValue, selectedMode.duration),
      total_price: String(selectedPrice),
      modeLabel: selectedMode.label,
      modeKey: selectedModeKey,
      bookingStatus: selectedBookingToEdit?.status,
      paymentMethod: "cash",
      clientName: clientDisplayName,
      establishmentName: establishmentDisplayName,
      establishmentAddress,
      bookingId: selectedBookingToEdit?.id ?? null,
    };

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("chrono-dz-confirmation-draft", JSON.stringify(confirmationDraft));
    }

    navigate("/confirmation", { replace: true, state: confirmationDraft });
  };

  const confirmReservation = async () => {
    if (!customerPhone || !session?.userId || !selectedMode) {
      return;
    }

    setSubmittingBooking(true);
    setAvailabilityError(null);

    try {
      const startTime = selectedTime;
      const endTime = addMinutesToTime(selectedTime, selectedMode.duration);
      const bookingDate = selectedDate;
      const activeResourceId = await resolveAvailableResourceId({
        establishmentId,
        bookingDate,
        startTime,
        endTime,
        ignoreBookingId: selectedBookingToEdit?.id ?? null,
      });

      if (!activeResourceId) {
        setAvailabilityError("Aucun créneau libre n'est disponible sur cette date.");
        return;
      }

      const payload = {
        user: session.userId,
        resource: activeResourceId,
        booking_date: bookingDate,
        start_time: startTime,
        end_time: endTime,
        status: selectedBookingToEdit?.status ?? "EN_ATTENTE",
        payment_method: "CASH",
        total_price: String(selectedPrice),
      };

      const response = await fetch(
        selectedBookingToEdit ? `/api/bookings/${selectedBookingToEdit.id}/` : "/api/bookings/",
        {
          method: selectedBookingToEdit ? "PATCH" : "POST",
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

      const result = (await response.json()) as BookingRecord;
      setUserBookings((previousBookings) => {
        const withoutCurrent = previousBookings.filter((booking) => booking.id !== result.id);
        return [result, ...withoutCurrent];
      });
      const confirmationPayload: BookingConfirmationPayload = {
        booking_reference: result.booking_reference,
        booking_date: result.booking_date,
        start_time: result.start_time.slice(0, 5),
        end_time: result.end_time.slice(0, 5),
        total_price: result.total_price,
        modeLabel: selectedMode.label,
      };
      window.sessionStorage.setItem("chrono-dz-confirmation", JSON.stringify(confirmationPayload));
      refreshAll();
      setDashboardTab("myBookings");
      setSelectedBookingToEdit(null);
      navigate("/confirmation", { replace: true, state: confirmationPayload });
    } catch (error) {
      setAvailabilityError(error instanceof Error ? error.message : "Erreur inattendue.");
    } finally {
      setSubmittingBooking(false);
    }
  };

  const cancelAndReset = () => {
    setSelectedBookingToEdit(null);
    resetWizard(false, hasBookings ? "home" : "mode");
    setDashboardTab(hasBookings ? "myBookings" : "newBooking");
  };

  const cancelExistingBooking = async (bookingId: number) => {
    try {
      const response = await fetch(`/api/bookings/${bookingId}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeader(),
        },
        body: JSON.stringify({ status: "ANNULE" }),
      });

      if (response.ok) {
        refreshAll();
      }
    } catch {
      // no-op
    }
  };

  if (bookingsLoading) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-slate-50 text-slate-900">
        <div className="text-sm font-semibold text-slate-500">Chargement...</div>
      </main>
    );
  }

  if (isDashboardHome && !hasBookings) {
    return null;
  }

  return (
    <main dir={isArabic ? "rtl" : "ltr"} className="relative min-h-screen w-full overflow-x-hidden bg-slate-50 text-slate-900">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(37,99,235,0.12),_transparent_24%),linear-gradient(135deg,rgba(248,250,252,1),rgba(241,245,249,1),rgba(255,255,255,1))]" />
      <div className="relative z-10 flex min-h-[100dvh] flex-col animate-fade-in">
        <div className="flex flex-1 flex-col">
          {showDashboardHome ? (
            <section className="relative flex flex-1 flex-col animate-fade-in">
              {/* Fond image pleine page + teinte bleue (hero fusionné au contenu) */}
              <div className="pointer-events-none absolute inset-0">
                <img src={heroBgImg} alt="" className="h-full w-full object-cover object-center" />
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/55 via-sky-900/45 to-slate-900/55" />
              </div>
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5 blur-2xl" />
              <div className="pointer-events-none absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-blue-400/10 blur-3xl" />

              <div className="relative z-10 flex w-full flex-1 flex-col px-5 pb-6 pt-6 sm:px-8 sm:pt-8 lg:px-14">
                {/* En-tête intégré au contenu (logo + nom + langue + déconnexion) */}
                <div className="flex w-full items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3 sm:gap-5">
                    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-[0_18px_50px_rgba(2,6,23,0.4)] ring-1 ring-white/60 sm:h-24 sm:w-24 sm:rounded-[1.85rem]">
                      <span className="absolute -inset-1 -z-10 rounded-2xl bg-gradient-to-br from-sky-400/40 to-cyan-300/30 blur-md sm:rounded-[2.1rem]" />
                      <img src={logoImg} alt="Logo" className="h-8 w-auto sm:h-16" />
                    </span>
                    <span className="text-lg font-black leading-tight tracking-tight text-white drop-shadow-[0_4px_20px_rgba(2,6,23,0.5)] sm:text-4xl lg:text-[2.5rem]">{t("appName")}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setLanguageMenuOpen((value) => !value)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/15 px-3 py-2 text-xs font-bold text-white backdrop-blur-md transition hover:bg-white/25 sm:text-sm"
                      >
                        <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" /></svg>
                        <span>{language === "ar" ? "العربية" : "FR"}</span>
                        <span className={`text-[10px] transition ${languageMenuOpen ? "rotate-180" : ""}`}>▾</span>
                      </button>

                      {languageMenuOpen ? (
                        <div className="absolute end-0 top-[calc(100%+0.5rem)] z-40 w-40 overflow-hidden rounded-2xl border border-sky-100 bg-white p-1.5 text-slate-900 shadow-[0_20px_60px_rgba(15,23,42,0.16)]">
                          <button
                            type="button"
                            onClick={() => handleLanguageChange("fr")}
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-sky-50 ${language === "fr" ? "bg-sky-50 text-sky-700" : ""}`}
                          >
                            <span>Français</span>
                            <span className="text-xs font-black uppercase tracking-[0.22em]">FR</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleLanguageChange("ar")}
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-sky-50 ${language === "ar" ? "bg-sky-50 text-sky-700" : ""}`}
                          >
                            <span>العربية</span>
                            <span className="text-xs font-black uppercase tracking-[0.22em]">AR</span>
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={handleLogout}
                      aria-label="Se déconnecter"
                      title="Se déconnecter"
                      className="group flex h-10 w-10 items-center justify-center rounded-xl border border-white/30 bg-white/15 text-white backdrop-blur-md transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                    >
                      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Layout deux colonnes plein écran (comme la page de login) */}
                <div className="grid flex-1 items-center gap-6 py-4 sm:gap-10 sm:py-6 lg:grid-cols-2 lg:gap-16">
                  {/* Colonne gauche : badge + titre + sous-titre */}
                  <div className="flex flex-col justify-center text-start">
                    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/30 bg-white/20 px-4 py-2 text-sm font-extrabold text-white backdrop-blur-md">
                      <span className="h-2 w-2 rounded-full bg-cyan-300 animate-pulse" />
                      {activeBookings.length} {activeBookings.length === 1 ? t("bookingActiveBookings").replace(/s$/, "") : t("bookingActiveBookings")}
                    </span>
                    <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight text-white drop-shadow-[0_4px_20px_rgba(2,6,23,0.4)] sm:text-6xl lg:text-7xl">
                      {t("bookingNavMyBookings")}
                    </h1>
                    <p className="mt-4 max-w-lg text-sm font-bold leading-relaxed text-white drop-shadow-[0_1px_8px_rgba(2,6,23,0.45)] sm:mt-5 sm:text-lg">
                      {t("bookingHomeSubtitle")}
                    </p>

                    {/* Points forts (masqués sur petit mobile pour épurer) */}
                    <ul className="mt-8 hidden max-w-md gap-3.5 sm:grid">
                      {[t("brandFeature1"), t("brandFeature2"), t("brandFeature3")].map((feature) => (
                        <li key={feature} className="flex items-center gap-3 text-base font-black text-white drop-shadow-[0_1px_8px_rgba(2,6,23,0.4)]">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} className="h-4 w-4 text-cyan-200"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </span>
                          {feature}
                        </li>
                      ))}
                    </ul>

                    {/* Carte résumé établissement (masquée sur petit mobile) */}
                    <div className="mt-8 hidden w-fit items-center gap-3 rounded-2xl border border-white/25 bg-white/12 px-5 py-3.5 text-white shadow-[0_12px_36px_rgba(2,6,23,0.2)] backdrop-blur-md sm:inline-flex">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
                        <svg className="h-5 w-5 text-cyan-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      </span>
                      <div className="min-w-0 leading-tight">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200">{t("appName")}</p>
                        <p className="truncate text-base font-black">{establishmentDisplayName}</p>
                      </div>
                    </div>
                  </div>

                  {/* Colonne droite : carte(s) de rendez-vous */}
                  <div className="flex flex-col gap-5">
                  {activeBookings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-sky-200 bg-sky-50/50 p-10 text-center sm:p-14">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-100 text-sky-400">
                        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                      </div>
                      <p className="text-sm font-semibold text-slate-500">{t("bookingNoBookings")}</p>
                    </div>
                  ) : (
                    activeBookings.map((booking, bookingIndex) => (
                      (() => {
                        const cardMode = getModeByDuration(modes, Math.max(getMinutesFromTime(booking.end_time.slice(0, 5)) - getMinutesFromTime(booking.start_time.slice(0, 5)), 10));
                        const accentBar = booking.status === "PAYE" ? "from-emerald-400 to-teal-500" : booking.status === "ANNULE" ? "from-rose-400 to-rose-500" : "from-sky-400 via-blue-500 to-indigo-500";
                        const pill = booking.status === "PAYE" ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : booking.status === "ANNULE" ? "bg-rose-50 text-rose-700 ring-rose-100" : "bg-amber-50 text-amber-700 ring-amber-100";
                        const dot = booking.status === "PAYE" ? "bg-emerald-500" : booking.status === "ANNULE" ? "bg-rose-500" : "bg-amber-500";
                        return (
                      <article
                        key={booking.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openBookingDetails(booking)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openBookingDetails(booking);
                          }
                        }}
                        className="group relative cursor-pointer overflow-hidden rounded-[2rem] border border-cyan-100 bg-white shadow-[0_18px_60px_rgba(8,145,178,0.12)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300 hover:shadow-[0_28px_70px_rgba(8,145,178,0.22)] animate-fade-in-up"
                        style={{ animationDelay: `${bookingIndex * 80}ms` }}
                      >
                        {/* Accent bar */}
                        <div className={`h-2 w-full bg-gradient-to-r ${accentBar}`} />

                        <div className="p-5 sm:p-8">
                          {/* Header: mode + status */}
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-[0_12px_30px_rgba(8,145,178,0.35)] sm:h-16 sm:w-16">
                                <svg className="h-6 w-6 sm:h-8 sm:w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="4" y="3" width="16" height="18" rx="2.5" /><circle cx="12" cy="13.5" r="4.3" /><path strokeLinecap="round" d="M7 6h.01M10 6h.01" /></svg>
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-mono text-[11px] font-extrabold uppercase tracking-[0.16em] text-cyan-600 sm:text-xs">{booking.booking_reference}</p>
                                <h3 className="mt-0.5 truncate text-xl font-black tracking-tight text-slate-900 sm:mt-1 sm:text-3xl">{cardMode?.label ?? t("bookingDetailsMode")}</h3>
                              </div>
                            </div>
                            <span className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] ring-1 sm:px-4 sm:py-2 sm:text-xs ${pill}`}>
                              <span className={`h-2 w-2 rounded-full sm:h-2.5 sm:w-2.5 ${dot}`} />
                              {booking.status === "PAYE" ? t("bookingStatusValidated") : booking.status === "ANNULE" ? t("bookingStatusCancelled") : t("bookingStatusPendingPayment")}
                            </span>
                          </div>

                          {/* Info grid — grand et clair */}
                          <div className="mt-6 grid gap-3">
                            <div className="flex items-center gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/60 px-4 py-3.5">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-cyan-600 shadow-sm">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              </span>
                              <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-500">{t("bookingDetailsDate") || "Date"}</p>
                                <p className="truncate text-base font-black text-slate-900">{dateToLongLabel(booking.booking_date, language)}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/60 px-4 py-3.5">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-cyan-600 shadow-sm">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              </span>
                              <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-500">{t("bookingDetailsTime") || "Heure"}</p>
                                <p className="truncate text-base font-black text-slate-900">{booking.start_time.slice(0, 5)} - {booking.end_time.slice(0, 5)}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/60 px-4 py-3.5">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-cyan-600 shadow-sm">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              </span>
                              <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-500">{t("bookingDetailsPoste")}</p>
                                <p className="truncate text-base font-black text-slate-900">{localizeResourceLabel(booking.resource_label, language)}</p>
                              </div>
                            </div>
                          </div>

                          {/* Price + QR hint */}
                          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-cyan-100 bg-gradient-to-r from-cyan-50 to-white px-4 py-3.5 sm:mt-5 sm:px-5 sm:py-4">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-500 sm:text-[11px]">{t("priceTotal")}</p>
                              <p className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{booking.total_price} <span className="text-sm font-bold text-cyan-500 sm:text-base">{t("currency")}</span></p>
                            </div>
                            <span className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-cyan-500 to-sky-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-[0_10px_26px_rgba(8,145,178,0.32)] transition group-hover:-translate-y-0.5 sm:px-5 sm:py-3 sm:text-sm">
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                              {t("bookingShowQr")}
                            </span>
                          </div>

                          {/* Action buttons — uniquement pour un rendez-vous en attente de paiement.
                              Une fois validé (PAYE), le rendez-vous est définitif : ni modifiable ni annulable. */}
                          {booking.status === "EN_ATTENTE" ? (
                            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openBookingForEdit(booking);
                                }}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-cyan-500 to-sky-600 px-5 py-3.5 text-sm font-extrabold text-white shadow-[0_12px_30px_rgba(8,145,178,0.3)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(8,145,178,0.42)] sm:py-4 sm:text-base sm:flex-1"
                              >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                {t("bookingModify")}
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  cancelExistingBooking(booking.id);
                                }}
                                className="group/cancel inline-flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-rose-200 bg-white px-5 py-3.5 text-sm font-extrabold text-rose-600 transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-50 sm:py-4 sm:text-base sm:flex-1"
                              >
                                <svg className="h-5 w-5 transition-transform group-hover/cancel:rotate-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                {t("bookingCancel")}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </article>
                        );
                      })()
                    ))
                  )}

                  {/* Message : une seule réservation en attente à la fois */}
                  {pendingBookings.length > 0 ? (
                    <div className="flex items-start gap-3.5 rounded-2xl border border-white/30 bg-white/15 px-5 py-4 text-white shadow-[0_10px_30px_rgba(2,6,23,0.12)] backdrop-blur-md">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/25">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </span>
                      <p className="text-base font-bold leading-6 text-white">
                        {t("bookingPendingHomeNotice", { establishment: establishmentDisplayName })}
                      </p>
                    </div>
                  ) : null}
                  </div>
                </div>

              </div>
            </section>
            ) : (
            <section className="relative flex flex-1 items-stretch animate-scale-in">
              {/* Fond plein écran + filtre cyan (comme la page de sélection de langue) */}
              <div className="pointer-events-none absolute inset-0">
                <img src={heroBgImg} alt="" className="h-full w-full object-cover object-center" />
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/55 via-sky-900/45 to-slate-900/55" />
              </div>
              <div className="relative z-10 grid min-h-full w-full lg:min-h-[calc(100dvh-0px)] lg:grid-cols-[0.88fr_1.12fr]">
                <ClientBrandPanel
                  hideBackground
                  className="hidden lg:flex lg:order-1 lg:min-h-full"
                  footer={
                    selectedMode ? (
                    <div className="grid gap-3 rounded-[1.5rem] border border-white/15 bg-white/10 p-4 text-sm text-sky-50/90 shadow-[0_16px_40px_rgba(2,132,199,0.18)] backdrop-blur-xl sm:rounded-[1.75rem] sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-white">Mode sélectionné</span>
                        <span className="text-lg font-black text-white">{selectedMode.label}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-white">Durée · Prix</span>
                        <span className="text-lg font-black text-white">{selectedMode.duration} min · {selectedMode.price} {t("currency")}</span>
                      </div>
                    </div>
                    ) : undefined
                  }
                />

                <div className="order-1 flex min-h-0 flex-col px-4 py-4 pb-7 sm:px-6 sm:py-8 lg:order-2 lg:px-8 lg:py-9 animate-fade-in-up">
                  {/* Action buttons (Logout & optional Back) */}
                  <div className="mb-2 flex items-center justify-between w-full">
                    {hasBookings ? (
                      <button
                        type="button"
                        onClick={cancelAndReset}
                        className="group inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-sky-300 hover:text-sky-700 hover:shadow-md"
                      >
                        <span className="text-base transition group-hover:-translate-x-0.5">{isArabic ? "→" : "←"}</span>
                        {t("bookingBack")}
                      </button>
                    ) : (
                      <div />
                    )}

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

                  {availabilityError ? (
                    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                      {availabilityError}
                    </div>
                  ) : null}

                  {isBlockedByPending ? (
                    <PendingBlockNotice
                      onGoToBookings={() => { setDashboardTab("myBookings"); navigate("/appointments"); }}
                    />
                  ) : (
                    <>
                      {wizardStep === "mode" ? (
                        <WizardModeStep
                          modes={modes}
                          loading={modesLoading}
                          selectedModeKey={selectedModeKey}
                          selectedMode={selectedMode}
                          language={language}
                          selectedPrice={selectedPrice}
                          onSelectMode={setSelectedModeKey}
                          onViewDetails={(mode) => navigate(`/mode-details/${mode.key}`, { state: { mode } })}
                          onNext={() => navigate(BOOKING_STEP_PATHS.calendar)}
                        />
                      ) : null}

                      {wizardStep === "calendar" && selectedMode ? (
                        <WizardCalendarStep
                          selectedMode={selectedMode}
                          selectedDate={selectedDate}
                          language={language}
                          days={calendarDates.map((dateValue) => availabilityByDate[dateValue] ?? buildFallbackDay(dateValue, language, selectedMode))}
                          loading={availabilityLoading}
                          onSelectDate={selectDate}
                          onBack={() => navigate(BOOKING_STEP_PATHS.mode)}
                        />
                      ) : null}

                      {wizardStep === "time" && selectedMode ? (
                        <WizardTimeStep
                          selectedMode={selectedMode}
                          selectedDate={selectedDate}
                          selectedTime={selectedTime}
                          language={language}
                          dayAvailability={selectedDayAvailability}
                          visibleSlots={visibleSlots}
                          onBack={() => navigate(BOOKING_STEP_PATHS.calendar)}
                          onSelectTime={selectTime}
                        />
                      ) : null}
                    </>
                  )}

                </div>
              </div>
            </section>
          )}
        </div>

        {/* Fenêtre de confirmation après validation du rendez-vous par la caisse */}
        {validatedModalOpen ? (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm animate-fade-in"
            role="presentation"
          >
            <div
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-sm overflow-hidden rounded-[2rem] border border-white/70 bg-white text-center shadow-[0_30px_90px_rgba(15,23,42,0.3)] animate-scale-in"
            >
              <div className="flex flex-col items-center px-7 pt-9">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <svg className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </span>
                <h3 className="mt-5 text-xl font-black leading-snug tracking-tight text-slate-900">{t("bookingValidatedModalTitle")}</h3>
                <p className="mt-2 text-sm font-bold text-slate-500">{t("bookingValidatedModalQuestion")}</p>
              </div>
              <div className="mt-7 flex flex-col gap-3 px-7 pb-7">
                <button
                  type="button"
                  onClick={() => { acknowledgeValidation(); startNewBooking(); }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-sky-600 px-6 py-3.5 text-sm font-extrabold text-white shadow-[0_14px_36px_rgba(8,145,178,0.32)] transition hover:-translate-y-0.5"
                >
                  {t("bookingValidatedModalConfirm")}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {selectedBookingDetails ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm animate-fade-in"
            role="presentation"
            onClick={closeBookingDetails}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Détails du rendez-vous"
              onClick={(event) => event.stopPropagation()}
              className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)] animate-scale-in"
            >
              {/* Header */}
              <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-600 px-6 py-5 text-white">
                <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
                <div className="relative flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.32em] text-white/80">{t("bookingDetailsDialogTitle")}</p>
                    <h3 className="mt-1 truncate font-mono text-lg font-black tracking-tight">{selectedBookingDetails.booking_reference}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={closeBookingDetails}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-white transition hover:bg-white/30"
                    aria-label={t("close")}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                {/* QR code — élément principal */}
                <div className="flex flex-col items-center">
                  {selectedBookingDetails.status === "PAYE" ? (
                    <div className="flex flex-col items-center gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 px-8 py-7 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
                        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <p className="text-base font-black text-emerald-700">{t("bookingStatusValidated")}</p>
                      <p className="max-w-[15rem] text-xs text-emerald-600/80">{t("bookingQrPaidNote")}</p>
                    </div>
                  ) : selectedBookingDetails.status === "ANNULE" ? (
                    <div className="flex flex-col items-center gap-3 rounded-3xl border border-rose-200 bg-rose-50 px-8 py-7 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/30">
                        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </div>
                      <p className="text-base font-black text-rose-700">{t("bookingStatusCancelled")}</p>
                    </div>
                  ) : (
                    <>
                      <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-600 ring-1 ring-amber-100">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        {t("bookingStatusPendingPayment")}
                      </span>
                      <div className="rounded-3xl border-2 border-sky-100 bg-white p-4 shadow-[0_18px_50px_rgba(14,165,233,0.14)]">
                        <QRCodeSVG
                          value={`VALIDATE_BOOKING:${selectedBookingDetails.booking_reference}`}
                          size={188}
                          level="H"
                          includeMargin={false}
                          fgColor="#0c4a6e"
                        />
                      </div>
                      <p className="mt-4 max-w-[17rem] text-center text-sm font-semibold leading-6 text-slate-600">
                        {t("bookingQrScanHint")}
                      </p>
                    </>
                  )}
                </div>

                {/* Détails */}
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <DetailCard label={t("bookingDetailsMode")} value={getModeByDuration(modes, Math.max(getMinutesFromTime(selectedBookingDetails.end_time.slice(0, 5)) - getMinutesFromTime(selectedBookingDetails.start_time.slice(0, 5)), 10))?.label ?? "—"} />
                  <DetailCard label={t("bookingDetailsAmount")} value={`${selectedBookingDetails.total_price} ${t("currency")}`} />
                  <DetailCard label={t("bookingDetailsDate")} value={dateToLongLabel(selectedBookingDetails.booking_date, language)} />
                  <DetailCard label={t("bookingDetailsTime")} value={`${selectedBookingDetails.start_time.slice(0, 5)} - ${selectedBookingDetails.end_time.slice(0, 5)}`} />
                  <DetailCard label={t("bookingDetailsPoste")} value={localizeResourceLabel(selectedBookingDetails.resource_label, language)} />
                  <DetailCard label={t("bookingDetailsEstablishment")} value={selectedBookingDetails.establishment_name} />
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-end border-t border-slate-100 px-6 py-4">
                <button
                  type="button"
                  onClick={closeBookingDetails}
                  className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  {t("close")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function DetailCard({
  label,
  value,
  accent = "sky",
  className,
}: {
  label: string;
  value: string;
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
  const requestedStartMinutes = getMinutesFromTime(startTime.slice(0, 5));
  const requestedEndMinutes = getMinutesFromTime(endTime.slice(0, 5));

  const [resourcesResponse, bookingsResponse] = await Promise.all([
    fetch(`/api/resources/?establishment_id=${establishmentId}`, { headers: authHeader() }),
    fetch(`/api/bookings/?establishment_id=${establishmentId}&date=${bookingDate}`, { headers: authHeader() }),
  ]);

  if (!resourcesResponse.ok || !bookingsResponse.ok) {
    return null;
  }

  const resources = (await resourcesResponse.json()) as Array<{ id: number; status: string }>;
  const bookings = (await bookingsResponse.json()) as BookingRecord[];

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

      const bookingStartMinutes = getMinutesFromTime(booking.start_time.slice(0, 5));
      const bookingEndMinutes = getMinutesFromTime(booking.end_time.slice(0, 5));
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

function buildFallbackDay(dateValue: string, language: AppLanguage, mode: WashMode): DayAvailability {
  return {
    date: dateValue,
    label: dateToLabel(dateValue, language),
    weekday: dateToLabel(dateValue, language).split(" ")[0],
    slots: [],
    opening_time: "08:00",
    closing_time: "22:00",
    total_resources: 0,
    availableCount: 0,
    fullCount: 0,
    isAvailable: false,
  };
}

function PendingBlockNotice({ onGoToBookings }: { onGoToBookings: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 items-center justify-center py-10">
      <div className="w-full max-w-lg rounded-[2rem] border border-amber-200 bg-white p-8 text-center shadow-[0_18px_50px_rgba(15,23,42,0.08)] animate-scale-in sm:p-10">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-500">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9l-8 13.8A2 2 0 004 21h16a2 2 0 001.7-3.3l-8-13.8a2 2 0 00-3.4 0z" /></svg>
        </div>
        <h2 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{t("pendingBlockTitle")}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">{t("pendingBlockMessage")}</p>
        <button
          type="button"
          onClick={onGoToBookings}
          className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 py-3.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 sm:w-auto"
        >
          {t("pendingBlockCta")}
          <span>→</span>
        </button>
      </div>
    </div>
  );
}

function WizardModeStep({
  modes,
  loading,
  selectedModeKey,
  selectedMode,
  language,
  selectedPrice,
  onSelectMode,
  onViewDetails,
  onNext,
}: {
  modes: WashMode[];
  loading: boolean;
  selectedModeKey: WashModeKey;
  selectedMode: WashMode | undefined;
  language?: AppLanguage;
  selectedPrice: number;
  onSelectMode: (modeKey: WashModeKey) => void;
  onViewDetails: (mode: WashMode) => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();

  // Nombre de colonnes adapté au nombre de modes (3 ou 4 sur une seule rangée), optimisé pour la responsivité
  const colsClass =
    modes.length >= 4
      ? "xl:grid-cols-4 lg:grid-cols-2"
      : modes.length === 3
        ? "xl:grid-cols-3 lg:grid-cols-2"
        : modes.length === 2
          ? "lg:grid-cols-2"
          : "lg:grid-cols-1";

  const header = (
    <div className="pt-2 sm:pt-6">
      <h2 className="text-2xl font-black leading-[1.08] tracking-tight text-white drop-shadow-[0_2px_14px_rgba(2,6,23,0.4)] sm:text-3xl lg:text-4xl">
        <span className="block">{t("bookingModeTitle")}</span>
      </h2>
      <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-white/90 drop-shadow-[0_1px_8px_rgba(2,6,23,0.4)] sm:text-base">
        {t("bookingModeIntroSub")}
      </p>
    </div>
  );

  // État de chargement
  if (loading) {
    return (
      <div className="flex h-full flex-col gap-5 sm:gap-6">
        {header}
        <div className="flex flex-1 items-center justify-center py-20">
          <div className="h-10 w-10 rounded-full border-4 border-sky-200 border-t-sky-600 animate-spin" />
        </div>
      </div>
    );
  }

  // Aucun mode configuré pour cet établissement
  if (modes.length === 0) {
    return (
      <div className="flex h-full flex-col gap-5 sm:gap-6">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-sky-200 bg-sky-50/40 px-6 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-100 text-sky-500 mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3h14a1 1 0 011 1v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" /><circle cx="12" cy="14" r="4.5" /><path strokeLinecap="round" strokeLinejoin="round" d="M7 6h.01M10 6h.01" /></svg>
          </div>
          <p className="text-base font-black text-slate-700">{t("noClientModesTitle")}</p>
          <p className="mt-1.5 max-w-md text-sm text-slate-400">{t("noClientModesHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-5 sm:gap-6">
      {header}

      <div className={`grid flex-1 auto-rows-fr gap-5 grid-cols-1 sm:grid-cols-2 ${colsClass}`}>
        {modes.map((mode, index) => {
          const active = selectedModeKey === mode.key;
          return (
            <div
              key={mode.key}
              role="button"
              tabIndex={0}
              onClick={() => { onSelectMode(mode.key); onNext(); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectMode(mode.key); onNext(); } }}
              style={{ animationDelay: `${index * 90}ms` }}
              className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-[2rem] border bg-white text-left transition-all duration-300 animate-fade-in-up hover:-translate-y-1.5 ${
                active
                  ? "border-transparent shadow-[0_30px_70px_rgba(14,165,233,0.28)] ring-2 ring-sky-500"
                  : "border-slate-200/70 shadow-[0_10px_40px_rgba(15,23,42,0.06)] hover:border-sky-200 hover:shadow-[0_28px_60px_rgba(15,23,42,0.14)]"
              }`}
            >
              {/* En-tête dégradé premium */}
              <div className={`relative overflow-hidden px-6 pt-6 pb-7 sm:px-7 ${active ? `bg-gradient-to-br ${mode.accent}` : "bg-gradient-to-br from-slate-50 to-white"}`}>
                <div className={`pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full blur-2xl transition-opacity duration-300 ${active ? "bg-white/25" : `bg-gradient-to-br ${mode.accent} opacity-[0.08] group-hover:opacity-20`}`} />
                <div className={`pointer-events-none absolute -bottom-10 -left-8 h-28 w-28 rounded-full blur-2xl ${active ? "bg-white/10" : "bg-sky-200/20"}`} />
                <div className="relative flex items-start justify-between gap-3">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl transition ${active ? "bg-white/20 text-white" : "bg-white text-sky-600 shadow-sm ring-1 ring-slate-100"}`}>
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <rect x="4" y="3" width="16" height="18" rx="2.5" />
                      <circle cx="12" cy="13.5" r="4.3" />
                      <path strokeLinecap="round" d="M7 6h.01M10 6h.01" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.9 12.8c.7-.6 1.5-.6 2.1 0 .7.6 1.5.6 2.1 0" />
                    </svg>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {mode.recommended && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[0.6rem] font-black uppercase tracking-[0.14em] text-white shadow-sm">
                        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24"><path d="M11.48 3.5l2.2 4.46 4.92.72-3.56 3.47.84 4.9-4.4-2.31-4.4 2.31.84-4.9L4.36 8.68l4.92-.72 2.2-4.46z" /></svg>
                        {t("modeRecommendedBadge")}
                      </span>
                    )}
                    <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-[0.7rem] font-black uppercase tracking-[0.22em] ${active ? "bg-white/20 text-white" : "bg-sky-50 text-sky-700"}`}>
                      {mode.duration} min
                    </span>
                  </div>
                </div>
                <h3 className={`relative mt-4 text-2xl font-black leading-tight tracking-tight sm:text-[1.7rem] ${active ? "text-white" : "text-slate-900"}`}>{mode.label}</h3>
              </div>

              {/* Corps */}
              <div className="flex flex-1 flex-col px-6 pb-6 pt-5 sm:px-7">
                {active && (
                  <div className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-[0.7rem] font-black uppercase tracking-[0.18em] text-sky-600 ring-1 ring-sky-100">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    {t("modeSelectedBadge")}
                  </div>
                )}
                {mode.description ? (
                  <p className="text-sm leading-6 text-slate-500">{mode.description}</p>
                ) : null}

                {mode.clothTypes.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {mode.clothTypes.map((type) => (
                      <span
                        key={type}
                        className="inline-flex items-center gap-1 rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-[0.7rem] font-semibold text-sky-700"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                        {type}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-auto pt-5">
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-slate-400">Total</p>
                      <p className="mt-1 text-3xl font-black tracking-tight text-slate-900">
                        {Number(mode.price).toLocaleString("fr-FR")}<span className="ml-1.5 text-base font-bold text-slate-400">{t("currency")}</span>
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.7rem] font-bold text-slate-500">{mode.pricePerMinute} {t("currency")} / min</span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onViewDetails(mode); }}
                    className={`mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-bold transition ${active ? `bg-gradient-to-r ${mode.accent} text-white shadow-[0_14px_32px_rgba(14,165,233,0.32)]` : "bg-slate-900 text-white hover:bg-slate-800"}`}
                  >
                    {t("bookingViewDetails")}
                    <span className="transition group-hover:translate-x-0.5">→</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

function WizardCalendarStep({
  selectedMode,
  selectedDate,
  language,
  days,
  loading,
  onSelectDate,
  onBack,
}: {
  selectedMode: WashMode;
  selectedDate: string;
  language?: AppLanguage;
  days: DayAvailability[];
  loading: boolean;
  onSelectDate: (dateValue: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const todayKey = formatDateKey(new Date());
  const visibleDays = days.filter((day) => !(day.date === todayKey && day.availableCount === 0));

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white drop-shadow-[0_2px_14px_rgba(2,6,23,0.4)] sm:text-3xl lg:text-4xl">{t("bookingDateTitle")}</h2>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-2xl border border-sky-100 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-sky-50"
        >
          {t("bookingBack")}
        </button>
      </div>

      {loading ? (
        <div className="flex min-h-[300px] flex-1 items-center justify-center rounded-[1.75rem] border border-sky-100 bg-white/80 text-sm font-semibold text-slate-500 sm:min-h-[360px]">
          {t("bookingCalendarLoading")}
        </div>
      ) : (
        <section className="min-h-0 flex-1 rounded-[2rem] border border-sky-100 bg-white/90 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="grid min-h-0 max-h-[calc(100dvh-250px)] grid-cols-1 gap-3 overflow-y-auto pr-1 pb-1 sm:max-h-[calc(100dvh-290px)] sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {visibleDays.map((day, index) => {
            const active = day.date === selectedDate;
            const isSelectable = day.isAvailable;
            const cardClass = active
              ? "border-sky-500 bg-gradient-to-br from-sky-600 via-sky-500 to-cyan-500 text-white shadow-[0_22px_50px_rgba(14,165,233,0.24)]"
              : day.isAvailable
                ? "border-sky-100 bg-white/95 text-slate-900 shadow-[0_14px_36px_rgba(15,23,42,0.06)] hover:-translate-y-1 hover:border-sky-200 hover:shadow-[0_18px_42px_rgba(14,165,233,0.12)]"
                : "border-rose-100 bg-gradient-to-br from-rose-50 to-white text-rose-900 shadow-[0_14px_36px_rgba(244,63,94,0.08)]";
            return (
              <button
                key={day.date}
                type="button"
                disabled={!isSelectable}
                onClick={() => {
                  if (isSelectable) {
                    onSelectDate(day.date);
                  }
                }}
                className={`group relative min-h-[100px] overflow-hidden rounded-[1.6rem] border p-3.5 text-left backdrop-blur-xl transition duration-300 ease-out sm:min-h-[112px] sm:p-4 ${cardClass} ${active ? "ring-4 ring-sky-200 ring-offset-2 ring-offset-white" : ""} ${isSelectable ? "" : "cursor-not-allowed opacity-85"} animate-fade-in-up`}
                style={{ animationDelay: `${index * 55}ms` }}
              >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-0 transition group-hover:opacity-100" />
                <div className="relative flex flex-wrap items-start justify-between gap-2 sm:gap-4">
                  <div>
                    <p className={`text-[9px] font-black uppercase tracking-[0.24em] sm:text-[10px] sm:tracking-[0.35em] ${active ? "text-white/80" : day.isAvailable ? "text-sky-400" : "text-rose-400"}`}>
                      {day.weekday}
                    </p>
                    <p className={`mt-1 text-xl font-black leading-tight tracking-tight sm:text-2xl ${active ? "text-white" : "text-slate-900"}`}>
                      {day.label.split(" ").slice(1).join(" ")}
                    </p>
                  </div>
                  <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] shadow-sm sm:px-3 sm:text-[10px] sm:tracking-[0.25em] ${active ? "bg-white/18 text-white ring-1 ring-white/35 backdrop-blur" : day.isAvailable ? "bg-sky-50 text-sky-700 ring-1 ring-sky-100" : "bg-rose-100 text-rose-700 ring-1 ring-rose-200"}`}>
                    {day.isAvailable ? "Libre" : "Complet"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        </section>
      )}
    </div>
  );
}

function WizardTimeStep({
  selectedMode,
  selectedDate,
  selectedTime,
  language,
  dayAvailability,
  visibleSlots,
  onBack,
  onSelectTime,
}: {
  selectedMode: WashMode;
  selectedDate: string;
  selectedTime: string;
  language: AppLanguage;
  dayAvailability: DayAvailability | undefined;
  visibleSlots: TimeSlot[];
  onBack: () => void;
  onSelectTime: (timeValue: string) => void;
}) {
  const { t } = useTranslation();
  const totalSlots = visibleSlots.length;

  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white drop-shadow-[0_2px_14px_rgba(2,6,23,0.4)] sm:text-3xl lg:text-4xl">{t("bookingTimeTitle")}</h2>
          <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-white/90 drop-shadow-[0_1px_8px_rgba(2,6,23,0.4)]">
            {dateToLongLabel(selectedDate, language)} • {selectedMode.label} • {selectedMode.duration} min • {selectedMode.pricePerMinute} {t("currency")} / min.
          </p>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="rounded-2xl border border-sky-100 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-sky-50"
        >
          {t("bookingBack")}
        </button>
      </div>

      <section className="rounded-[2rem] border border-sky-100 bg-white/90 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        {totalSlots === 0 ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-[1.5rem] bg-slate-50 text-sm font-semibold text-slate-500">
            {t("bookingNoSlots")}
          </div>
        ) : (
          <div className="grid max-h-[calc(100dvh-280px)] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5">
            {visibleSlots.map((slot, index) => {
              const active = slot.start_time === selectedTime;
              const isClickable = slot.status === "AVAILABLE";
              const cardBgClass = active
                ? "border-sky-600 bg-gradient-to-br from-sky-600 via-sky-500 to-cyan-500 text-white shadow-[0_18px_50px_rgba(14,165,233,0.24)]"
                : isClickable
                  ? "border-sky-100 bg-white text-slate-900 shadow-[0_12px_36px_rgba(15,23,42,0.08)] hover:-translate-y-1 hover:border-sky-200 hover:shadow-[0_16px_42px_rgba(14,165,233,0.14)]"
                  : "border-rose-100 bg-gradient-to-br from-rose-50 to-white text-rose-700 shadow-[0_12px_36px_rgba(244,63,94,0.08)]";
              return (
                <button
                  key={`${selectedDate}-${slot.start_time}`}
                  type="button"
                  disabled={!isClickable}
                  onClick={() => onSelectTime(slot.start_time)}
                  className={`group relative overflow-hidden rounded-[1.6rem] border p-4 text-left backdrop-blur-xl transition duration-300 ease-out sm:p-5 ${cardBgClass} ${active ? "ring-4 ring-sky-200 ring-offset-2 ring-offset-white" : ""} ${isClickable ? "" : "cursor-not-allowed opacity-60"} animate-fade-in-up`}
                  style={{
                    animationDelay: `${index * 50}ms`
                  }}
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-0 transition group-hover:opacity-100" />
                  <div className="relative flex flex-col gap-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <div>
                        <div className={`text-2xl font-black tracking-tight sm:text-3xl ${active ? "text-white" : "text-slate-900"}`}>
                          {slot.start_time}
                        </div>
                        <div className={`mt-1 text-xs font-bold uppercase tracking-[0.28em] ${active ? "text-white/75" : "text-sky-500"}`}>
                          jusqu'à {slot.end_time}
                        </div>
                      </div>
                    </div>

                    <div className={`text-sm font-semibold leading-snug ${active ? "text-white" : isClickable ? "text-slate-600" : "text-rose-600"}`}>
                      {active ? "✓ Sélectionné" : isClickable ? "Disponible" : "Complet"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function WizardSummaryStep({
  selectedMode,
  selectedDate,
  selectedTime,
  language,
  clientName,
  establishmentName,
  establishmentAddress,
  price,
  editing,
  submitting,
  onConfirm,
  onCancel,
  onModify,
}: {
  selectedMode: WashMode;
  selectedDate: string;
  selectedTime: string;
  language: AppLanguage;
  clientName: string;
  establishmentName: string;
  establishmentAddress: string;
  price: number;
  editing: boolean;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onModify: () => void;
}) {
  const { t } = useTranslation();
  const timeRangeLabel = isValidTimeValue(selectedTime)
    ? `${selectedTime} - ${addMinutesToTime(selectedTime, selectedMode.duration)}`
    : "Heure non définie";

  return (
    <div className="flex h-full flex-col gap-6 lg:gap-8">
      <div className="relative overflow-hidden rounded-[2rem] border border-sky-100 bg-white/80 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-7">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-500 via-cyan-400 to-indigo-500" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.35em] text-sky-500">{t("bookingSummaryTitle")}</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">{t("bookingConfirmTitle")}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              {t("bookingConfirmSubtitle")}
            </p>
          </div>
          <div className="rounded-full border border-sky-100 bg-sky-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.3em] text-sky-700 shadow-sm">
            {t("bookingStepFinal")}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SummaryTile label="Client" value={clientName} />
        <SummaryTile label="Établissement" value={establishmentName} />
        <SummaryTile label="Adresse" value={establishmentAddress} className="sm:col-span-2" />
        <SummaryTile label="Date & heure" value={`${dateToLongLabel(selectedDate, language)} • ${timeRangeLabel}`} className="sm:col-span-2" />
        <SummaryTile label={t("bookingDetailsMode")} value={selectedMode.label} />
        <SummaryTile label={t("priceTotal")} value={`${price} ${t("currency")}`} />
      </div>

      <p className="text-sm font-semibold text-slate-600">{t("bookingConfirmQuestion")}</p>

      <div className="mt-2 flex flex-col items-end gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="order-1 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50"
        >
          {t("bookingCancel")}
        </button>
        <button
          type="button"
          onClick={onModify}
          className="order-2 rounded-2xl border border-sky-100 bg-sky-50 px-5 py-3 text-sm font-semibold text-sky-700 transition hover:-translate-y-0.5 hover:bg-sky-100"
        >
          {t("bookingModify")}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="order-3 rounded-2xl bg-slate-950 px-6 py-3 text-sm font-bold text-white shadow-[0_18px_40px_rgba(15,23,42,0.22)] transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {submitting ? t("bookingLoading") : t("bookingConfirmButton")}
        </button>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-[1.5rem] border border-sky-100 bg-white/80 p-5 shadow-sm ${className ?? ""}`}>
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-sky-500">{label}</p>
      <p className="mt-2 text-lg font-black leading-tight text-slate-900">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs font-bold uppercase tracking-[0.3em] text-sky-50/80">{label}</span>
      <span className="text-right text-sm font-black text-white">{value}</span>
    </div>
  );
}


