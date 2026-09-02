"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { DEMO_ACCOUNT } from "./mock-data";

interface LoginScreenProps {
  onLogin: (opts?: { demo?: boolean }) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    if (!email || !password) {
      setError("Enter your email and password to continue.");
      return;
    }
    setLoading(true);

    // The demo account always works locally, whether or not Supabase is
    // configured — it's a fixed shortcut into the mock-data dashboard, not
    // a real account, so it must never be routed through real auth.
    const isDemoCredentials = email.trim().toLowerCase() === DEMO_ACCOUNT.email && password === DEMO_ACCOUNT.password;
    if (isDemoCredentials) {
      setTimeout(() => onLogin({ demo: true }), 400);
      return;
    }

    // Once a Supabase project is connected (dashboard-live-setup.md Phase 2)
    // this authenticates for real; until then it falls back to a
    // demo-credentials-only error so the dashboard stays testable.
    if (supabase) {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }
      onLogin();
      return;
    }

    setTimeout(() => {
      setError("That email and password don't match. Try the demo credentials below.");
      setLoading(false);
    }, 550);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") submit();
  };

  const fillDemo = () => {
    setEmail(DEMO_ACCOUNT.email);
    setPassword(DEMO_ACCOUNT.password);
    setError("");
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-mark">
          <span className="mark-glyph">H</span>
          <span className="mark-word">Heliast</span>
        </div>
        <h1>Sign in to your dashboard</h1>
        <p className="login-sub">See how your SEO and ads are performing, in one place.</p>

        <div>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="you@business.com"
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button type="button" className="btn-primary" onClick={submit} disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </div>

        <button className="demo-link" onClick={fillDemo} type="button">
          Use demo account ({DEMO_ACCOUNT.email})
        </button>
      </div>
      <p className="login-footer">Heliast · client performance dashboard</p>
    </div>
  );
}
