"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { session, signOut } from "@/lib/api";

const NAV = [
  { href: "/", label: "Overview", icon: "M3 12l9-8 9 8v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/map/", label: "Live Map", icon: "M9 4l6 2 6-2v14l-6 2-6-2-6 2V6zM9 4v14M15 6v14" },
  { href: "/mechanics/", label: "Mechanics", icon: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0" },
  { href: "/groups/", label: "WhatsApp Groups", icon: "M4 5h16v11H9l-5 4z" },
  { href: "/zones/", label: "Cities and Zones", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  { href: "/lookup/", label: "Location Lookup", icon: "M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.800 7 11 7 11zM12 12.500a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5z" },
  { href: "/training/", label: "Training", icon: "M3 9l9-5 9 5-9 5zM7 12v5c3 2 7 2 10 0v-5" },
];
const ADMIN_NAV = [{ href: "/manage/", label: "Manage", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 1-2-1V5h-4v2L9 8 7 7l-2 4 2 1v2l-2 1 2 4 2-1 2 1v2h4v-2l2-1 2 1 2-4-2-1z" }];

function Icon({ d }: { d: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

export default function Shell({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  const path = usePathname();
  const [me, setMe] = useState<any>(undefined);
  const [open, setOpen] = useState(false);
  const [small, setSmall] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    const s = session();
    if (!s?.token) { window.location.href = "/login/"; return; }
    setMe(s);
    try { setSmall(localStorage.getItem("im-sidebar") === "small"); } catch {}
  }, []);
  if (!me) return <div className="p-10 muted">Loading…</div>;

  const items = me.role === "admin" ? [...NAV, ...ADMIN_NAV] : NAV;
  const toggleSmall = () => { setSmall(!small); try { localStorage.setItem("im-sidebar", !small ? "small" : "full"); } catch {} };
  const search = (e: any) => { e.preventDefault(); window.location.href = "/mechanics/?q=" + encodeURIComponent(q.trim()); };

  return (
    <div className="md:flex h-full">
      <aside className={`no-print bg-white border-r border-line flex-none flex flex-col ${small ? "md:w-[68px]" : "md:w-60"} ${open ? "" : "hidden md:flex"}`}>
        <div className="bg-white border-b border-line px-4 py-3 flex items-center gap-3">
          {small && <img src="/favicon.png" alt="Instant Mechanic" className="h-10 w-10 flex-none" />}
          {!small && <div><img src="/logo.png" alt="Instant Mechanic" className="h-12 w-auto block" /><div className="text-xs font-semibold text-brand-deep mt-1">Training dashboard</div></div>}
        </div>
        <nav className="p-2 flex-1 overflow-auto" aria-label="Main">
          {items.map((n) => {
            const on = n.href === "/" ? path === "/" : path.startsWith(n.href.replace(/\/$/, ""));
            return (
              <Link key={n.href} href={n.href} title={n.label} aria-current={on ? "page" : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-l-4 font-medium ${on ? "bg-brand-tint border-brand-orange font-bold" : "border-transparent hover:bg-canvas"}`}>
                <Icon d={n.icon} />{!small && <span>{n.label}</span>}
              </Link>
            );
          })}
        </nav>
        <button onClick={toggleSmall} className="hidden md:block m-2 btn text-sm" aria-label="Collapse or expand the sidebar">{small ? "»" : "« Collapse"}</button>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col h-full">
        <header className="no-print bg-white border-b border-line px-4 md:px-6 py-3 flex items-center gap-3 flex-wrap">
          <button className="md:hidden btn px-3" onClick={() => setOpen(!open)} aria-label="Open the menu">☰</button>
          <h1 className="!text-xl mr-auto">{title}</h1>
          <form onSubmit={search} className="flex-1 min-w-[180px] max-w-md order-last md:order-none w-full md:w-auto">
            <input id="global-search" className="input !rounded-full !bg-canvas" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, Maps name, group, phone, zone" aria-label="Search mechanics" />
          </form>
          <Link href="/account/" className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-canvas" title="My account">
            <span className="hidden sm:inline text-sm font-semibold max-w-[140px] truncate">{me.name || me.email}</span>
            <span className={`chip ${me.role === "admin" ? "chip-warn" : ""}`}>{me.role === "admin" ? "Admin" : "Agent"}</span>
          </Link>
          <button className="btn text-sm" onClick={signOut}>Sign out</button>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className={`mx-auto flex flex-col gap-5 ${wide ? "max-w-[1500px]" : "max-w-6xl"}`}>{children}</div>
        </main>
      </div>
    </div>
  );
}
