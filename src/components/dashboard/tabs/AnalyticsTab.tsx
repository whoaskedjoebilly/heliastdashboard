"use client";

import { useState } from "react";
import { BarChart3, FileText, Sparkles, Trash2, Users } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Panel } from "../ui/Panel";
import { ReportBuilder } from "../ReportBuilder";
import { LeadsPanel } from "../LeadsPanel";
import { DATASETS, type ReportConfig } from "@/lib/reports/registry";
import type { CustomReport, SavedReport } from "@/lib/dashboard-data";

interface AnalyticsTabProps {
  configured: boolean;
  clientId: string | null;
  reports: SavedReport[];
  reportsLoading: boolean;
  deleteReport: (id: string) => Promise<void>;
  customReports: CustomReport[];
  customReportsLoading: boolean;
  saveCustomReport: (title: string, config: ReportConfig) => Promise<{ error: string | null }>;
  deleteCustomReport: (id: string) => Promise<void>;
}

export function AnalyticsTab({
  configured,
  clientId,
  reports,
  reportsLoading,
  deleteReport,
  customReports,
  customReportsLoading,
  saveCustomReport,
  deleteCustomReport,
}: AnalyticsTabProps) {
  const [subtab, setSubtab] = useState<"reports" | "leads">("reports");
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [loadedReportId, setLoadedReportId] = useState<string | null>(null);

  const selectedAnswerReport = reports.find((r) => r.id === selectedAnswer) ?? null;
  const loadedReport = customReports.find((r) => r.id === loadedReportId) ?? null;

  return (
    <>
      <div className="analytics-subnav">
        <button type="button" className={subtab === "reports" ? "active" : ""} onClick={() => setSubtab("reports")}>
          <BarChart3 size={13} /> Reports
        </button>
        <button type="button" className={subtab === "leads" ? "active" : ""} onClick={() => setSubtab("leads")}>
          <Users size={13} /> Leads (CRM)
        </button>
      </div>

      {subtab === "leads" ? (
        <LeadsPanel configured={configured} clientId={clientId} />
      ) : (
        <>
          <ReportBuilder
            key={loadedReportId ?? "new"}
            configured={configured}
            clientId={clientId}
            onSave={configured ? saveCustomReport : undefined}
            initialConfig={loadedReport?.config}
          />

          <div className="grid-2">
            <Panel title="Saved reports">
              {!configured ? (
                <div className="live-empty">
                  Reports are only saveable on a real account — sign in for real (not the demo account) to save
                  reports you build above.
                </div>
              ) : customReportsLoading ? (
                <div className="live-empty">Loading…</div>
              ) : customReports.length === 0 ? (
                <div className="live-empty">
                  <BarChart3 size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                  No saved reports yet — build one above and click &ldquo;Save report&rdquo;.
                </div>
              ) : (
                <div className="saved-report-list">
                  {customReports.map((r) => (
                    <div className="custom-report-row" key={r.id}>
                      <div className="custom-report-meta">
                        <button className="custom-report-title" onClick={() => setLoadedReportId(r.id)} type="button">
                          <BarChart3 size={14} />
                          <span>{r.title}</span>
                        </button>
                        <span className="table-sub">
                          {DATASETS[r.config.dataset]?.label ?? r.config.dataset} · {new Date(r.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        className="saved-report-delete"
                        onClick={() => {
                          if (loadedReportId === r.id) setLoadedReportId(null);
                          deleteCustomReport(r.id);
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

            <Panel title="Saved answers from Athena">
              {!configured ? (
                <div className="live-empty">
                  Saved answers are only available on a real account — sign in for real to save answers from Athena
                  in the corner.
                </div>
              ) : reportsLoading ? (
                <div className="live-empty">Loading…</div>
              ) : reports.length === 0 ? (
                <div className="live-empty">
                  <Sparkles size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                  No saved answers yet — ask Athena in the corner a question, then save its answer here.
                </div>
              ) : (
                <div className="saved-report-list">
                  {reports.map((r) => (
                    <div className={`saved-report-row ${selectedAnswer === r.id ? "active" : ""}`} key={r.id}>
                      <button className="saved-report-title" onClick={() => setSelectedAnswer(r.id)} type="button">
                        <FileText size={14} />
                        <span>{r.title}</span>
                      </button>
                      <span className="table-sub">{new Date(r.created_at).toLocaleDateString()}</span>
                      <button
                        className="saved-report-delete"
                        onClick={() => {
                          if (selectedAnswer === r.id) setSelectedAnswer(null);
                          deleteReport(r.id);
                        }}
                        type="button"
                        aria-label="Delete answer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          {selectedAnswerReport && (
            <Panel title={selectedAnswerReport.title} className="reports-content-panel">
              <p className="table-sub" style={{ marginBottom: 14 }}>
                Asked: &ldquo;{selectedAnswerReport.prompt}&rdquo; · {new Date(selectedAnswerReport.created_at).toLocaleString()}
              </p>
              <div className="report-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedAnswerReport.content}</ReactMarkdown>
              </div>
            </Panel>
          )}
        </>
      )}
    </>
  );
}
