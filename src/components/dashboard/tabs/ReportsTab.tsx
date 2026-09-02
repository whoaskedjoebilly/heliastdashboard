"use client";

import { useState } from "react";
import { Sparkles, Save, Trash2, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Panel } from "../ui/Panel";
import { supabase } from "@/lib/supabase/client";
import { useSavedReports } from "@/lib/dashboard-data";
import type { TabDataProps } from "../types";

export function ReportsTab({ configured, clientId, clientLoading }: TabDataProps) {
  const [prompt, setPrompt] = useState("");
  const [content, setContent] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedSaved, setSelectedSaved] = useState<string | null>(null);
  const { reports, loading: reportsLoading, saveReport, deleteReport } = useSavedReports(clientId);

  const isDemo = !configured;

  const generate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || generating) return;
    setError("");
    setContent("");
    setSelectedSaved(null);
    setGenerating(true);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (!isDemo && supabase) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: trimmed, demo: isDemo }),
      });

      if (!res.ok || !res.body) {
        setError(await res.text());
        setGenerating(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setContent(acc);
      }
    } catch {
      setError("Something went wrong generating the report. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!saveTitle.trim() || !content || saving) return;
    setSaving(true);
    const { error: saveError } = await saveReport(saveTitle.trim(), prompt.trim(), content);
    setSaving(false);
    if (saveError) {
      setError(saveError);
    } else {
      setSaveTitle("");
    }
  };

  const viewSaved = (id: string) => {
    const report = reports.find((r) => r.id === id);
    if (!report) return;
    setSelectedSaved(id);
    setPrompt(report.prompt);
    setContent(report.content);
    setError("");
  };

  return (
    <>
      <Panel title="Ask for a custom report">
        {isDemo && (
          <p className="table-sub" style={{ marginBottom: 14 }}>
            Demo mode — reports are generated from MigraineMend&apos;s sample data and can&apos;t be saved. Sign in
            with a real account to save reports.
          </p>
        )}
        <textarea
          className="report-prompt-input"
          placeholder="e.g. Summarize how our paid campaigns performed this month, and flag anything that needs attention"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          disabled={generating || (configured && clientLoading)}
        />
        <button className="btn-primary" style={{ width: "auto", padding: "10px 20px", marginTop: 10 }} onClick={generate} disabled={generating || !prompt.trim()}>
          <Sparkles size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
          {generating ? "Generating…" : "Generate report"}
        </button>
        {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}
      </Panel>

      {(content || generating) && (
        <Panel title={selectedSaved ? "Saved report" : "Report"}>
          <div className="report-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || "…"}</ReactMarkdown>
          </div>
          {!isDemo && content && !generating && (
            <div className="report-save-row">
              <input
                type="text"
                placeholder="Name this report to save it…"
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                className="report-save-input"
              />
              <button className="btn-secondary" onClick={handleSave} disabled={!saveTitle.trim() || saving}>
                <Save size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </Panel>
      )}

      {!isDemo && (
        <Panel title="Saved reports">
          {reportsLoading ? (
            <div className="live-empty">Loading…</div>
          ) : reports.length === 0 ? (
            <div className="live-empty">No saved reports yet — generate one above and save it.</div>
          ) : (
            <div className="saved-report-list">
              {reports.map((r) => (
                <div className="saved-report-row" key={r.id}>
                  <button className="saved-report-title" onClick={() => viewSaved(r.id)} type="button">
                    <FileText size={14} />
                    <span>{r.title}</span>
                  </button>
                  <span className="table-sub">{new Date(r.created_at).toLocaleDateString()}</span>
                  <button className="saved-report-delete" onClick={() => deleteReport(r.id)} type="button" aria-label="Delete report">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
