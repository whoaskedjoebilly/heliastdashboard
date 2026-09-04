"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Sparkles, X, ArrowUp, Bookmark, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/lib/supabase/client";
import type { SavedReportSaver } from "./types";
import { AthenaBarChart, AthenaDonutChart, type AthenaChartPoint } from "./AthenaCharts";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AiAssistantProps {
  configured: boolean;
  clientId: string | null;
  businessName: string;
  saveReport: SavedReportSaver;
}

const EXAMPLE_PROMPTS = [
  "How has traffic grown in the last 3 days?",
  "Which ad campaigns need attention right now?",
  "Write me a report summarizing this month's SEO performance",
];

interface ParsedChart {
  title?: string;
  data: AthenaChartPoint[];
}

/** Athena renders breakdowns as fenced ```chart-bar / ```chart-donut code
 * blocks (see the assistant's system prompt) instead of wide markdown
 * tables that would overflow the narrow chat panel. While a block is still
 * streaming in, its JSON is incomplete — parsing just fails silently and a
 * "Building chart…" placeholder shows until the block closes. */
function parseChartBlock(raw: string): ParsedChart | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.data) || parsed.data.length === 0) return null;
    return parsed as ParsedChart;
  } catch {
    return null;
  }
}

function ChartPending() {
  return <div className="ai-chart-pending">Building chart…</div>;
}

function isChartClassName(className: unknown): boolean {
  return /language-(chart-bar|chart-donut)/.test(String(className ?? ""));
}

function markdownComponents(): Record<string, (props: Record<string, unknown>) => ReactNode> {
  return {
    // A <pre> only ever wraps a single <code> child — inline code (single
    // backtick) never has a <pre> ancestor at all, so it never reaches this
    // component. react-markdown hands pre() the *unrendered* <code> element
    // (its type is the code() function below, not whatever code() will
    // eventually return), so the only thing available to inspect here is
    // that element's own className prop — check it with the same regex
    // code() uses, rather than trying to look at what code() rendered.
    pre({ children }) {
      const child = Array.isArray(children) ? children[0] : children;
      const childClassName =
        child && typeof child === "object" && "props" in (child as object) ? (child as { props?: { className?: unknown } }).props?.className : undefined;
      if (isChartClassName(childClassName)) {
        return <>{children as ReactNode}</>;
      }
      return <pre className="report-code-pre">{children as ReactNode}</pre>;
    },
    code({ className, children }) {
      const lang = /language-(chart-bar|chart-donut)/.exec(String(className ?? ""))?.[1];
      if (lang) {
        const raw = String(children).replace(/\n$/, "");
        const parsed = parseChartBlock(raw);
        if (!parsed) return <ChartPending />;
        return lang === "chart-bar" ? (
          <AthenaBarChart title={parsed.title} data={parsed.data} />
        ) : (
          <AthenaDonutChart title={parsed.title} data={parsed.data} />
        );
      }
      // Not a chart block — return a bare <code>. Inline code renders it
      // directly (no <pre> ever wraps it); a normal fenced block gets
      // wrapped by the pre() override above.
      return <code className={className as string | undefined}>{children as ReactNode}</code>;
    },
    table({ children }) {
      return (
        <div className="report-table-wrap">
          <table>{children as ReactNode}</table>
        </div>
      );
    },
  };
}

export function AiAssistant({ configured, clientId, businessName, saveReport }: AiAssistantProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [saveTitle, setSaveTitle] = useState("");
  const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const isDemo = !configured;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    setError("");
    setInput("");
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setStreaming(true);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (!isDemo && supabase) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ messages: nextMessages, demo: isDemo }),
      });

      if (!res.ok || !res.body) {
        setError(await res.text());
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setStreaming(false);
    }
  };

  const openSaveForm = (index: number) => {
    const userBefore = [...messages].slice(0, index).reverse().find((m) => m.role === "user");
    setSaveTitle(userBefore ? userBefore.content.slice(0, 60) : "Saved answer");
    setSavingIndex(index);
  };

  const confirmSave = async () => {
    if (savingIndex === null || !saveTitle.trim()) return;
    const message = messages[savingIndex];
    const userBefore = [...messages].slice(0, savingIndex).reverse().find((m) => m.role === "user");
    const { error: saveError } = await saveReport(saveTitle.trim(), userBefore?.content ?? "", message.content);
    if (saveError) {
      setError(saveError);
    } else {
      setSavedIndices((prev) => new Set(prev).add(savingIndex));
    }
    setSavingIndex(null);
  };

  return (
    <>
      <button className={`ai-fab ${open ? "ai-fab-open" : ""}`} onClick={() => setOpen((v) => !v)} aria-label="Ask Athena">
        {open ? <X size={20} /> : <Sparkles size={20} />}
      </button>

      {open && (
        <div className="ai-panel">
          <div className="ai-panel-header">
            <div className="ai-panel-title">
              <Sparkles size={15} />
              <span>Athena</span>
            </div>
            <div className="ai-panel-sub">Powered by Claude · {businessName}</div>
          </div>

          <div className="ai-messages" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="ai-empty">
                <p>Hi, I&apos;m Athena — ask about your traffic, campaigns, SEO, or social performance, any time window.</p>
                <div className="ai-examples">
                  {EXAMPLE_PROMPTS.map((p) => (
                    <button key={p} className="ai-example-chip" onClick={() => send(p)} type="button">
                      {p}
                    </button>
                  ))}
                </div>
                {isDemo && <p className="table-sub" style={{ marginTop: 10 }}>Demo mode — answers use MigraineMend&apos;s sample data.</p>}
              </div>
            )}

            {messages.map((m, i) => (
              <div className={`ai-message ai-message-${m.role}`} key={i}>
                {m.role === "assistant" ? (
                  <div className="ai-message-bubble">
                    <div className="report-markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents()}>
                        {m.content || "…"}
                      </ReactMarkdown>
                    </div>
                    {!isDemo && m.content && !(streaming && i === messages.length - 1) && (
                      <div className="ai-message-actions">
                        {savingIndex === i ? (
                          <div className="ai-save-form">
                            <input
                              type="text"
                              value={saveTitle}
                              onChange={(e) => setSaveTitle(e.target.value)}
                              placeholder="Report title"
                              autoFocus
                            />
                            <button onClick={confirmSave} type="button" aria-label="Confirm save">
                              <Check size={13} />
                            </button>
                          </div>
                        ) : savedIndices.has(i) ? (
                          <span className="ai-saved-label">
                            <Check size={12} /> Saved
                          </span>
                        ) : (
                          <button className="ai-save-btn" onClick={() => openSaveForm(i)} type="button">
                            <Bookmark size={12} /> Save as report
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="ai-message-bubble">{m.content}</div>
                )}
              </div>
            ))}

            {error && <div className="login-error">{error}</div>}
          </div>

          <div className="ai-input-row">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={clientId || isDemo ? "Ask a question…" : "Sign in to ask about your data…"}
              disabled={streaming}
            />
            <button onClick={() => send(input)} disabled={streaming || !input.trim()} aria-label="Send" type="button">
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
