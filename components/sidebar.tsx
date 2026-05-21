"use client";

import { AlertTriangle, CalendarClock, CheckCircle2, CheckSquare, ChevronsLeft, ChevronsRight, ClipboardList, Flame, ListChecks, ScrollText, Settings, Type, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ComponentType, MouseEvent } from "react";

type NavItem = readonly [label: string, helper: string, href: string, Icon: ComponentType<{ size?: number }>];
type NavGroup = {
  label: string;
  items: readonly NavItem[];
};

const navGroups: readonly NavGroup[] = [
  {
    label: "Today",
    items: [
      ["Dashboard", "Start here", "/dashboard", ClipboardList],
      ["New Requests", "Match customers", "/pipeline?stage=New%20Requests", ListChecks],
      ["Needs Review", "Fix blocked work", "/review-queue", AlertTriangle]
    ]
  },
  {
    label: "Work",
    items: [
      ["Opportunities", "Follow up", "/pipeline?stage=Opportunity", ClipboardList],
      ["Approved Orders", "Create work order", "/pipeline?stage=Approved%20for%20SWO", CheckSquare],
      ["Work Orders", "Ready to schedule", "/pipeline?stage=Work%20Order%20Created", Wrench],
      ["Calendar", "Technician jobs", "/calendar-mapping", CalendarClock]
    ]
  },
  {
    label: "Records",
    items: [
      ["Completed", "Finished jobs", "/pipeline?stage=Completed", CheckCircle2],
      ["Logs", "Reports and audits", "/logs", ScrollText],
      ["Problems", "Sync errors", "/review-queue?filter=errors", AlertTriangle]
    ]
  }
] as const;

const bottomItems: readonly NavItem[] = [
  ["Text Size", "Display preferences", "/settings", Type],
  ["System", "Backend setup", "/admin", Settings]
] as const;

const navItems = [...navGroups.flatMap((group) => group.items), ...bottomItems];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(() => readSidebarCollapsed());

  useEffect(() => {
    navItems.forEach(([, , href]) => router.prefetch(href));
    router.prefetch("/requests");
  }, [router]);

  useEffect(() => {
    document.documentElement.dataset.sidebar = collapsed ? "collapsed" : "expanded";
    window.localStorage.setItem("serviceops-sidebar-collapsed", collapsed ? "true" : "false");
  }, [collapsed]);

  const handleNavClick = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    router.push(href);
  };

  return (
    <aside className={collapsed ? "sidebar collapsed" : "sidebar"}>
      <div className="brand">
        <h1><Flame size={18} /><span>Classic Fireplace</span></h1>
        <p>Live operations console</p>
        <button className="sidebar-collapse-button" type="button" onClick={() => setCollapsed((value) => !value)} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>
      <nav className="nav" aria-label="Primary">
        {navGroups.map((group) => (
          <div className="nav-group" key={group.label}>
            <span className="nav-group-label">{group.label}</span>
            {group.items.map(([label, helper, href, Icon]) => (
              <Link key={label} href={href} prefetch title={helper} onClick={handleNavClick(href)} className={isActivePath(pathname, searchParams, href) ? "active" : ""}>
                <Icon size={17} />
                <span>
                  <strong>{label}</strong>
                </span>
              </Link>
            ))}
          </div>
        ))}
        {pathname.startsWith("/requests/") ? (
          <Link href={pathname} prefetch onClick={handleNavClick(pathname)} className="active">
            <ListChecks size={17} />
            <span><strong>Work Item</strong></span>
          </Link>
        ) : null}
      </nav>
      <div className="sidebar-bottom" aria-label="Account and settings">
        {bottomItems.map(([label, helper, href, Icon]) => (
          <Link key={label} href={href} prefetch title={helper} onClick={handleNavClick(href)} className={isActivePath(pathname, searchParams, href) ? "active" : ""}>
            <Icon size={17} />
            <span>
              <strong>{label}</strong>
            </span>
          </Link>
        ))}
      </div>
    </aside>
  );
}

function readSidebarCollapsed() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("serviceops-sidebar-collapsed") === "true";
}

function isActivePath(pathname: string, searchParams: URLSearchParams, href: string) {
  const [baseHref, queryString] = href.split("?");
  if (baseHref === "/dashboard") return pathname === "/" || pathname === "/dashboard";
  if (queryString) {
    const expected = new URLSearchParams(queryString);
    const expectedStage = expected.get("stage");
    const expectedFilter = expected.get("filter");
    if (expectedStage) return pathname === baseHref && searchParams.get("stage") === expectedStage;
    if (expectedFilter) return pathname === baseHref && searchParams.get("filter") === expectedFilter;
  }
  return pathname === baseHref || pathname.startsWith(`${baseHref}/`);
}
