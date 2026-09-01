"use client";

import { useState } from "react";
import "./dashboard.css";
import { LoginScreen } from "./LoginScreen";
import { DashboardShell } from "./DashboardShell";

export function DashboardApp() {
  const [authed, setAuthed] = useState(false);

  return (
    <div className="dashboard-root">
      {authed ? (
        <DashboardShell onLogout={() => setAuthed(false)} />
      ) : (
        <LoginScreen onLogin={() => setAuthed(true)} />
      )}
    </div>
  );
}
