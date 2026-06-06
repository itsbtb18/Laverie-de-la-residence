import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

import "./i18n";
import { clearAuthSession, getAuthSession } from "./auth/session";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LanguageAwareShell } from "./components/LanguageAwareShell";
import { AppLanguage, LANGUAGE_STORAGE_KEY } from "./i18n";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminBookingDetailPage } from "./pages/AdminBookingDetailPage";
import { AdminCustomerDetailPage } from "./pages/AdminCustomerDetailPage";
import { AdminAssistantPage } from "./pages/AdminAssistantPage";
import { BookingPage } from "./pages/BookingPage";
import { PaymentSuccessPage } from "./pages/PaymentSuccessPage";
import { PaymentFailurePage } from "./pages/PaymentFailurePage";
import { LanguageSelectionPage } from "./pages/LanguageSelectionPage";
import { ReservationConfirmationPage } from "./pages/ReservationConfirmationPage";
import { StaffLogin } from "./pages/StaffLogin";
import { SuperAdminDashboardPage } from "./pages/SuperAdminDashboardPage";
import { UserLogin } from "./pages/UserLogin";

export default function App() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return storedLanguage === "fr" || storedLanguage === "ar"
      ? storedLanguage
      : null;
  });

  useEffect(() => {
    if (selectedLanguage) {
      i18n.changeLanguage(selectedLanguage);
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, selectedLanguage);
    }
  }, [i18n, selectedLanguage]);

  useEffect(() => {
    if (typeof window === "undefined" || !import.meta.env.DEV) {
      return;
    }

    const { protocol, hostname, port } = window.location;
    if (protocol === "http:" && (hostname === "127.0.0.1" || hostname === "localhost") && port === "5173") {
      window.location.replace(window.location.href.replace(/^http:/, "https:"));
    }
  }, []);

  const language = selectedLanguage ?? "fr";
  const session = getAuthSession();

  const customerRedirectTarget = session && session.role === "CUSTOMER" ? "/appointments" : null;

  const staffRedirectTarget = session
    ? session.role === "ADMIN"
      ? "/admin/dashboard/creation"
      : session.role === "SUPER_ADMIN"
        ? "/superadmin/dashboard" // stays on /superadmin/dashboard after login
        : null
    : null;

  return (
    <LanguageAwareShell language={language}>
      <Routes>
        <Route path="/" element={<Navigate to="/language" replace />} />

        <Route
          path="/language"
          element={
            <LanguageSelectionPage
              onSelectLanguage={(nextLanguage) => {
                setSelectedLanguage(nextLanguage);
                navigate("/login");
              }}
            />
          }
        />

        <Route
          path="/login"
          element={
            customerRedirectTarget
              ? <Navigate to={customerRedirectTarget} replace />
              : <UserLogin
                  language={language}
                  onChangeLanguage={setSelectedLanguage}
                />
          }
        />

        <Route
          path="/staff/login"
          element={
            staffRedirectTarget
              ? <Navigate to={staffRedirectTarget} replace />
              : <StaffLogin
                  language={language}
                  onChangeLanguage={setSelectedLanguage}
                />
          }
        />

        <Route element={<ProtectedRoute allowedRoles={["CUSTOMER"]} redirectTo="/login" />}>
          <Route
            path="/appointments/*"
            element={<BookingPage language={language} phoneNumber={getAuthSession()?.phone || ""} />}
          />
          <Route path="/confirmation" element={<ReservationConfirmationPage />} />
          <Route path="/payment/success" element={<PaymentSuccessPage />} />
          <Route path="/payment/failure" element={<PaymentFailurePage />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["ADMIN", "SUPER_ADMIN"]} redirectTo="/staff/login" />}>
          <Route path="/admin/dashboard" element={<Navigate to="/admin/dashboard/creation" replace />} />
          <Route path="/admin/dashboard/customers/:customerId" element={<AdminCustomerDetailPage language={language} />} />
          <Route path="/admin/dashboard/customers/:customerId/ticket" element={<AdminDashboardPage language={language} />} />
          <Route path="/admin/dashboard/*" element={<AdminDashboardPage language={language} />} />
          <Route
            path="/admin/dashboard/bookings/:bookingId"
            element={<AdminBookingDetailPage language={language} />}
          />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={["SUPER_ADMIN"]} redirectTo="/staff/login" />}>
          <Route path="/superadmin/dashboard"       element={<SuperAdminDashboardPage language={language} />} />
          <Route path="/superadmin/establishments"  element={<SuperAdminDashboardPage language={language} />} />
          <Route path="/superadmin/assistants"      element={<SuperAdminDashboardPage language={language} />} />
          <Route path="/superadmin/assistants/:assistantId" element={<SuperAdminDashboardPage language={language} />} />
          <Route path="/superadmin/history"         element={<SuperAdminDashboardPage language={language} />} />
          <Route path="/superadmin/settings"        element={<SuperAdminDashboardPage language={language} />} />
        </Route>

        <Route
          path="/logout"
          element={
            <LogoutPage onDone={() => {
              clearAuthSession();
            }} />
          }
        />

        <Route
          path="*"
          element={<Navigate to={selectedLanguage ? "/login" : "/language"} replace />}
        />
      </Routes>
    </LanguageAwareShell>
  );
}

function LogoutPage({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    onDone();
  }, [onDone]);

  return <Navigate to="/login" replace />;
}