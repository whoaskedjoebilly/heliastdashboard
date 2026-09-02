"use client";

import { useEffect, useState } from "react";
import "./dashboard.css";
import { LoginScreen } from "./LoginScreen";
import { DashboardShell } from "./DashboardShell";
import { supabase } from "@/lib/supabase/client";

export function DashboardApp() {
  const [authed, setAuthed] = useState(false);
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
      setAuthed(session !== null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = () => {
    if (supabase) {
      supabase.auth.signOut();
    }
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
      {authed ? <DashboardShell onLogout={handleLogout} /> : <LoginScreen onLogin={() => setAuthed(true)} />}
    </div>
  );
}
