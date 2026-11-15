"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { ErrorBox, Notice } from "@/components/ui";
import { api, saveSession, session } from "@/lib/api";

export default function Account() {
  const [me, setMe] = useState<any>(null);
  const [cur, setCur] = useState(""); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  useEffect(() => setMe(session()), []);
  const save = async (e: any) => {
    e.preventDefault(); setErr(""); setMsg("");
    if (pw !== pw2) { setErr("The two new passwords are not the same."); return; }
    try {
      await api("/me/password", { json: { current: cur, new: pw } });
      // the old session ends when the password changes, so sign in again quietly with the new one
      saveSession(await api("/auth/login", { json: { email: me.email, password: pw } }));
      setCur(""); setPw(""); setPw2(""); setMsg("Password changed.");
    } catch (x: any) { setErr(x.message); }
  };
  return (
    <Shell title="My account">
      {me && <div className="card"><h2>{me.name || me.email}</h2><p className="muted">Signed in as {me.email} · {me.role === "admin" ? "Admin" : "Agent"}</p></div>}
      <form onSubmit={save} className="card flex flex-col gap-3 max-w-md"><h2>Change my password</h2>
        <div><label className="label" htmlFor="cur">Current password</label><input id="cur" type="password" required autoComplete="current-password" className="input" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
        <div><label className="label" htmlFor="pw">New password (at least 8 characters)</label><input id="pw" type="password" required minLength={8} autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <div><label className="label" htmlFor="pw2">New password again</label><input id="pw2" type="password" required minLength={8} autoComplete="new-password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
        <ErrorBox text={err} /><Notice text={msg} /><button className="btn btn-primary self-start">Change password</button>
      </form>
    </Shell>
  );
}
