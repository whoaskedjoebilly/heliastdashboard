"use client";

import { useState } from "react";
import { FileText, Trash2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Panel } from "../ui/Panel";
import type { SavedReport } from "@/lib/dashboard-data";

interface ReportsTabProps {
  configured: boolean;
  reports: SavedReport[];
  loading: boolean;
  deleteReport: (id: string) => Promise<void>;
}

export function ReportsTab({ configured, reports, loading, deleteReport }: ReportsTabProps) {
  const [selected, setSelected] = useState<string | null>(reports[0]?.id ?? null);
  const selectedReport = reports.find((r) => r.id === selected) ?? reports[0] ?? null;

  if (!configured) {
    return (
      <Panel title="Saved reports">
        <div className="live-empty">
          Reports are only saveable on a real account — sign in for real (not the demo account) to save reports
          from the AI assistant in the corner.
        </div>
      </Panel>
    );
  }

  return (
    <div className="reports-layout">
      <Panel title="Saved reports" className="reports-list-panel">
        {loading ? (
          <div className="live-empty">Loading…</div>
        ) : reports.length === 0 ? (
          <div className="live-empty">
            <Sparkles size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
            No saved reports yet — ask Athena in the corner a question, then save its answer here.
          </div>
        ) : (
          <div className="saved-report-list">
            {reports.map((r) => (
              <div className={`saved-report-row ${selectedReport?.id === r.id ? "active" : ""}`} key={r.id}>
                <button className="saved-report-title" onClick={() => setSelected(r.id)} type="button">
                  <FileText size={14} />
                  <span>{r.title}</span>
                </button>
                <span className="table-sub">{new Date(r.created_at).toLocaleDateString()}</span>
                <button
                  className="saved-report-delete"
                  onClick={() => {
                    if (selected === r.id) setSelected(null);
                    deleteReport(r.id);
                  }}
                  type="button"
                  aria-label="Delete report"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {selectedReport && (
        <Panel title={selectedReport.title} className="reports-content-panel">
          <p className="table-sub" style={{ marginBottom: 14 }}>
            Asked: &ldquo;{selectedReport.prompt}&rdquo; · {new Date(selectedReport.created_at).toLocaleString()}
          </p>
          <div className="report-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedReport.content}</ReactMarkdown>
          </div>
        </Panel>
      )}
    </div>
  );
}
