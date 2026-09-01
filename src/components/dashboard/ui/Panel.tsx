import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, action, children, className = "" }: PanelProps) {
  return (
    <div className={`panel ${className}`}>
      <div className="panel-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}
