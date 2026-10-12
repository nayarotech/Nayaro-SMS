import type { ReactNode } from "react";
import { Navigate, Outlet } from "react-router";
import { useAuth } from "@/lib/auth";
import { Spinner } from "../ui/display";
import { WebsitePagesPage } from "@/features/website/WebsitePagesPage";

/** Redirects to /login when not signed in. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Loading…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Hides a page from users without the permission (the API enforces it as well). */
export function RequirePermission({ permission, children }: { permission: string | string[]; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(permission)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/**
 * /website: page builders see the pages list; people who only write notices
 * or answer enquiries go straight to their screen.
 */
export function WebsiteHome() {
  const { can } = useAuth();
  if (can("website.edit")) return <WebsitePagesPage />;
  return <Navigate to={can("website.posts") ? "/website/posts" : "/website/enquiries"} replace />;
}
