"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ago, api } from "@/lib/api";

/** Loads data from the backend and gives back {data, error, loading, reload}. */
export function useLoad(path: string | null, deps: any[] = []) {
  const [state, setState] = useState<any>({ data: null, error: "", loading: !!path });
  const reload = useCallback(() => {
    if (!path) return;
    setState((s: any) => ({ ...s, loading: true, error: "" }));
    api(path).then((data) => setState({ data, error: "", loading: false }))
      .catch((e) => setState({ data: null, error: e.message, loading: false }));
  }, [path]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [reload, ...deps]);
  return { ...state, reload };
}

export const Skeleton = ({ rows = 4 }: { rows?: number }) => (
  <div className="flex flex-col gap-2" aria-busy="true">{Array.from({ length: rows }).map((_, i) => <div key={i} className="h-10 rounded-xl bg-line/60 animate-pulse" />)}</div>
);
export const ErrorBox = ({ text }: { text: string }) => (text ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 text-alert px-4 py-3 font-medium">{text}</div> : null);
export const Notice = ({ text }: { text: string }) => (text ? <div role="status" className="rounded-xl border border-green-200 bg-okbg text-ok px-4 py-3 font-medium">{text}</div> : null);
export const Empty = ({ text, children }: { text: string; children?: any }) => (
  <div className="rounded-xl border border-dashed border-line bg-canvas px-4 py-8 text-center muted">{text}{children && <div className="mt-3">{children}</div>}</div>
);
export const Blank = ({ v }: { v?: string }) => (v ? <>{v}</> : <span className="text-muted italic">Not added yet</span>);

export const POSITION: Record<string, { label: string; cls: string; color: string }> = {
  live: { label: "Live", cls: "chip-ok", color: "#1E8E4E" },
  exact: { label: "Exact location", cls: "", color: "#202124" },
  last_seen: { label: "Last seen", cls: "", color: "#8A8F98" },
  approximate: { label: "Approximate", cls: "chip-warn", color: "#FF7900" },
  none: { label: "No location", cls: "chip-warn", color: "#8A8F98" },
};

export function PositionChip({ p }: { p: any }) {
  const meta = POSITION[p?.kind] || POSITION.none;
  let text = meta.label;
  if (p?.kind === "live") text = `Live, updated ${ago(p.live?.at)}`;
  if (p?.kind === "last_seen") text = `Last seen ${ago(p.live?.at)}`;
  if (p?.kind === "exact" && p.live) text = `Exact location (last seen ${ago(p.live.at)})`;
  return <span className={`chip ${meta.cls}`}><span className="inline-block w-2 h-2 rounded-full" style={{ background: meta.color }} />{text}</span>;
}

export const digits = (p: string) => (p || "").replace(/\D/g, "");
export const waNumber = (p: string) => { const d = digits(p); return d.length === 10 ? "91" + d : d; };

/** Call, WhatsApp, group and Maps buttons. Each one shows only when its detail exists. */
export function ContactButtons({ m, small }: { m: any; small?: boolean }) {
  const cls = small ? "pill !py-0.5 text-xs" : "btn text-sm";
  const pos = m.position;
  const mapsUrl = m.gmaps_link || (pos && (pos.kind === "exact" || pos.kind === "live") ? `https://www.google.com/maps?q=${pos.lat},${pos.lng}` : "");
  const none = !m.phone && !mapsUrl && !m.groups?.some((g: any) => g.link);
  return (
    <div className="flex gap-2 flex-wrap">
      {m.phone && <a className={cls} href={`tel:${m.phone}`}>Call {small ? "" : m.phone}</a>}
      {m.phone && <a className={cls} href={`https://wa.me/${waNumber(m.phone)}`} target="_blank" rel="noreferrer">WhatsApp</a>}
      {m.groups?.filter((g: any) => g.link).map((g: any) => <a key={g.id} className={cls} href={g.link} target="_blank" rel="noreferrer">Open group</a>)}
      {mapsUrl && <a className={cls} href={mapsUrl} target="_blank" rel="noreferrer">Open in Maps</a>}
      {none && !small && <span className="muted">No phone, group link or exact location added yet.</span>}
    </div>
  );
}

/** Compact mechanic card used beside the map and in lists. */
export function MechanicCard({ m, extra }: { m: any; extra?: any }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3 flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/mechanic/?id=${m.id}`} className="font-bold hover:text-brand-deep">{m.name}</Link>
        <span className="chip">{m.zone}</span>
      </div>
      <div className="text-sm grid grid-cols-[92px_1fr] gap-x-2">
        <span className="text-muted">Maps name</span><span><Blank v={m.gmaps_name} /></span>
        <span className="text-muted">WhatsApp</span><span><Blank v={m.groups?.map((g: any) => g.name).join(", ")} /></span>
        <span className="text-muted">Hours</span><span><Blank v={m.working_hours} /></span>
        <span className="text-muted">Area</span><span><Blank v={m.locality} /></span>
      </div>
      <div className="flex gap-1.5 flex-wrap items-center">
        {m.service_type && <span className="chip">{m.service_type}</span>}
        <PositionChip p={m.position} />
        {extra}
      </div>
      <ContactButtons m={m} small />
    </div>
  );
}
