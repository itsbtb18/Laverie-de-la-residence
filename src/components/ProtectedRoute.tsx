import { Navigate, Outlet, useLocation } from "react-router-dom";

import { getAuthSession, type UserRole } from "../auth/session";

type ProtectedRouteProps = {
  allowedRoles: UserRole[];
  redirectTo?: string;
};

export function ProtectedRoute({ allowedRoles, redirectTo = "/login" }: ProtectedRouteProps) {
  const location = useLocation();
  const session = getAuthSession();

  if (!session) {
    return <Navigate to={redirectTo} state={{ from: location.pathname }} replace />;
  }

  if (!allowedRoles.includes(session.role)) {
    if (session.role === "SUPER_ADMIN") {
      return <Navigate to="/superadmin/dashboard" replace />;
    }

    if (session.role === "ADMIN") {
      return <Navigate to="/admin/dashboard/creation" replace />;
    }

    return <Navigate to="/appointments" replace />;
  }

  return <Outlet />;
}
