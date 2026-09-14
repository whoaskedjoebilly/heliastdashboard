"use client";

import type { ReactNode } from "react";
import { AthenaBarChart, AthenaDonutChart, type AthenaChartPoint } from "./AthenaCharts";

// Shared between the live chat (AiAssistant) and a saved answer's full-text
// view (AnalyticsTab) — both render the same Athena markdown content, and
// both need fenced ```chart-bar / ```chart-donut blocks turned into actual
// charts instead of react-markdown's default <pre><code> dump of raw JSON.

interface ParsedChart {
  title?: string;
  data: AthenaChartPoint[];
}

/** While a block is still streaming in, its JSON is incomplete — parsing
 * just fails silently and a "Building chart…" placeholder shows until the
 * block closes. Not relevant once a saved answer is fully loaded, but kept
 * here since a saved answer with a malformed/edited chart block should
 * degrade the same way rather than crash. */
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

export function markdownComponents(): Record<string, (props: Record<string, unknown>) => ReactNode> {
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
