import clsx from "clsx";
import { ArrowLeftRight, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, setActingSchoolId } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Avatar } from "../ui/display";
import { NAVIGATION, type NavItem } from "./navigation";

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Sidebar: fixed on desktop, drawer on mobile */}
      <div
        className={clsx("fixed inset-0 z-40 bg-slate-900/40 lg:hidden", mobileOpen ? "block" : "hidden")}
        onClick={() => setMobileOpen(false)}
      />
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-200 bg-white transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Sidebar onNavigate={() => setMobileOpen(false)} />
      </aside>

      <TopBar onMenu={() => setMobileOpen(true)} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const { user, can, moduleEnabled } = useAuth();
  const inSchool = Boolean(user?.school);

  const visible = (item: NavItem) => {
    if (item.superAdminOnly) return Boolean(user?.isSuperAdmin);
    if (!inSchool) return item.path === "/";
    if (item.module && !moduleEnabled(item.module)) return false;
    return !item.permission || can(item.permission);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-slate-100 px-4">
        {user?.school?.logoUrl ? (
          <img src={user.school.logoUrl} alt="" className="size-9 rounded-lg object-contain" />
        ) : (
          <div className="flex size-9 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
            {(user?.school?.code ?? "SMS").slice(0, 3)}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{user?.school?.name ?? "Platform admin"}</p>
          <p className="truncate text-xs text-slate-500">{(user?.settings?.["branding.motto"] as string) || "School Management System"}</p>
        </div>
        <button className="ml-auto rounded-md p-1 text-slate-400 lg:hidden" onClick={onNavigate} aria-label="Close menu">
          <X className="size-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAVIGATION.map((section, index) => {
          const items = section.items.filter(visible);
          if (!items.length) return null;
          return (
            <div key={index} className="mb-5">
              {section.labelKey && (
                <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-slate-400">{t(section.labelKey)}</p>
              )}
              {items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={["/", "/students", "/settings", "/website", "/attendance", "/exams"].includes(item.path)}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    clsx(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive ? "bg-brand-soft text-brand" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                    )
                  }
                >
                  <item.icon className="size-4.5 shrink-0" />
                  {t(item.labelKey)}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { t, i18n } = useTranslation();
  const { user, logout, reload } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const leaveSchool = async () => {
    setActingSchoolId(null);
    queryClient.clear();
    await reload();
    navigate("/platform/schools");
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu className="size-5" />
      </button>

      {user?.isSuperAdmin && user.school && (
        <button
          onClick={leaveSchool}
          className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
        >
          <ArrowLeftRight className="size-3.5" /> Viewing as super admin · back to all schools
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
          {(["en", "ne"] as const).map((language) => (
            <button
              key={language}
              onClick={() => {
                void i18n.changeLanguage(language);
                void api.patch("/auth/me", { preferredLanguage: language }).catch(() => undefined);
              }}
              className={clsx(
                "rounded-md px-2 py-1 font-medium",
                i18n.language === language ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {language === "en" ? "EN" : "नेपाली"}
            </button>
          ))}
        </div>

        <NavLink to="/account" className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50">
          <Avatar name={user?.fullName ?? "?"} url={user?.photoUrl} size={32} />
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-medium leading-tight text-slate-900">{user?.fullName}</span>
            <span className="block text-xs leading-tight text-slate-500">
              {user?.isSuperAdmin ? "Super Admin" : user?.roles.map((role) => role.name).join(", ")}
            </span>
          </span>
        </NavLink>

        <button onClick={() => void logout()} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" title={t("common.logout")}>
          <LogOut className="size-4.5" />
        </button>
      </div>
    </header>
  );
}
