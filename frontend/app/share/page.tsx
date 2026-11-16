"use client";
import { useEffect, useRef, useState } from "react";
import { api, param } from "@/lib/api";

/** Public page for a mechanic. He opens his private link and taps Share. No sign-in. */
export default function Share() {
  const [info, setInfo] = useState<any>(null);
  const [err, setErr] = useState("");
  const [on, setOn] = useState(false);
  const [last, setLast] = useState("");
  const watch = useRef<number | null>(null);
  const token = useRef("");
  useEffect(() => {
    token.current = param("t");
    if (!token.current) { setErr("This link is not complete. Ask the office to send it again."); return; }
    api(`/share/${token.current}`, { public: true }).then(setInfo).catch((e) => setErr(e.message));
    return () => { if (watch.current != null) navigator.geolocation.clearWatch(watch.current); };
  }, []);
  const start = () => {
    setErr("");
    if (!navigator.geolocation) { setErr("This phone's browser cannot share location."); return; }
    setOn(true);
    let sentAt = 0;
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        if (Date.now() - sentAt < 30000) return;   // send at most every 30 seconds
        sentAt = Date.now();
        api(`/share/${token.current}`, { public: true, json: { lat: p.coords.latitude, lng: p.coords.longitude } })
          .then(() => setLast(new Date().toLocaleTimeString("en-IN"))).catch((e) => setErr(e.message));
      },
      () => { setErr("Location permission was not given. Allow location for this site in the browser settings, then try again."); setOn(false); },
      { enableHighAccuracy: true, maximumAge: 15000 },
    );
  };
  const stop = () => { if (watch.current != null) navigator.geolocation.clearWatch(watch.current); watch.current = null; setOn(false); };

  return (
    <div className="min-h-full grid place-items-center p-4">
      <div className="card w-full max-w-sm !p-0 overflow-hidden text-center">
        <div className="bg-white border-b-4 border-brand-orange p-5"><img src="/logo.png" alt="Instant Mechanic" className="h-14 w-auto block" /></div>
        <div className="p-6 flex flex-col gap-4">
          {info && <h1 className="!text-xl">Hello {info.name}</h1>}
          {err && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 text-alert p-3">{err}</div>}
          {info && !info.share_enabled && <p>Location sharing is switched off for you. Ask the office to switch it on.</p>}
          {info?.share_enabled && !on && <><p>Tap the button to share your location with the Instant Mechanic office. Keep this page open while you are on duty.</p><button className="btn btn-primary !py-4 text-lg" onClick={start}>Share my location</button></>}
          {on && <><div className="chip chip-ok self-center !text-sm !py-1">Sharing is on{last ? ` · sent at ${last}` : " · waiting for GPS"}</div><p className="muted">Keep this page open. Closing it stops sharing.</p><button className="btn" onClick={stop}>Stop sharing</button></>}
        </div>
      </div>
    </div>
  );
}
