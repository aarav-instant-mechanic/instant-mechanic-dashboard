"use client";
import { useState } from "react";
import { api, saveSession } from "@/lib/api";
import { ErrorBox } from "@/components/ui";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: any) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { saveSession(await api("/auth/login", { json: { email, password } })); window.location.href = "/"; }
    catch (err: any) { setError(err.message); setBusy(false); }
  };
  return (
    <div className="min-h-full grid place-items-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm !p-0 overflow-hidden">
        <div className="bg-white border-b-4 border-brand-orange p-6 flex items-center gap-3">
          {null}
          <div><img src="/logo.png" alt="Instant Mechanic" className="h-16 w-auto block" /><div className="text-sm font-semibold text-brand-deep mt-1">Training dashboard</div></div>
        </div>
        <div className="p-6 flex flex-col gap-4">
          <h1 className="!text-xl">Sign in</h1>
          <div><label className="label" htmlFor="email">Email or username</label><input id="email" type="text" required autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><label className="label" htmlFor="password">Password</label><input id="password" type="password" required autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <ErrorBox text={error} />
          <button className="btn btn-primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <p className="muted">Use the login your Admin gave you. Forgot your password? Ask your Admin to reset it.</p>
        </div>
      </form>
    </div>
  );
}
