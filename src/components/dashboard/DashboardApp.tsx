"use client";

import { useEffect, useRef, useState } from "react";
import "./dashboard.css";
import { LoginScreen } from "./LoginScreen";
import { DashboardShell } from "./DashboardShell";
import { supabase } from "@/lib/supabase/client";

export function DashboardApp() {
  const [authed, setAuthed] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const isDemoRef = useRef(false);
  const [checkingSession, setCheckingSession] = useState(supabase !== null);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setAuthed(data.session !== null);
      setCheckingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // A demo session isn't a real Supabase session, so real auth events
      // (token refresh, tab visibility checks, etc.) must not be able to
      // sign a demo user back out.
      if (isDemoRef.current) return;
      setAuthed(session !== null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = (opts?: { demo?: boolean }) => {
    isDemoRef.current = opts?.demo ?? false;
    setIsDemo(opts?.demo ?? false);
    setAuthed(true);
  };

  const handleLogout = () => {
    if (supabase && !isDemoRef.current) {
      supabase.auth.signOut();
    }
    isDemoRef.current = false;
    setIsDemo(false);
    setAuthed(false);
  };

  if (checkingSession) {
    return (
      <div className="dashboard-root">
        <div className="bg-blobs" aria-hidden="true">
          <span />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-root">
      <div className="bg-blobs" aria-hidden="true">
        <span />
      </div>
      {authed ? <DashboardShell onLogout={handleLogout} forceDemo={isDemo} /> : <LoginScreen onLogin={handleLogin} />}
    </div>
  );
}
