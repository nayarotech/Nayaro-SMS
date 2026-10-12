import { ExternalLink } from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { Badge, PageHeader } from "@/components/ui/display";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { siteUrl, useWebsite } from "./website.api";

const TABS = [
  { path: "/website", label: "Pages", permission: "website.edit", end: true },
  { path: "/website/theme", label: "Theme", permission: "website.edit" },
  { path: "/website/layout", label: "Header & footer", permission: "website.edit" },
  { path: "/website/posts", label: "Notices, news & events", permission: "website.posts" },
  { path: "/website/gallery", label: "Gallery", permission: ["website.edit", "website.posts"] },
  { path: "/website/enquiries", label: "Enquiries", permission: "website.enquiries" },
  { path: "/website/settings", label: "Settings", permission: "website.edit" },
];

/** Header, status and tabs shared by every Website screen. */
export function WebsiteLayout() {
  const { can } = useAuth();
  const { data } = useWebsite();

  return (
    <div>
      <PageHeader
        title="School website"
        description="Build and update your school's public website — no technical skills needed."
        actions={
          data && (
            <>
              {data.isPublished ? <Badge tone="green">Online</Badge> : <Badge tone="amber">Offline</Badge>}
              <a href={siteUrl(data.schoolCode)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
                View website <ExternalLink className="size-3.5" />
              </a>
            </>
          )
        }
      />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.filter((tab) => can(tab.permission)).map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.end}
            className={({ isActive }) =>
              cn("-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium", isActive ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-800")
            }
          >
            {tab.label}
            {tab.path === "/website/enquiries" && data?.counts.newEnquiries ? (
              <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{data.counts.newEnquiries}</span>
            ) : null}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
