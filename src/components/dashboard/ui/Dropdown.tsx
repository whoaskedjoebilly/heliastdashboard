"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface DropdownProps {
  /** Text/icons shown on the trigger button. Receives whether the menu is
   * currently open in case a caller wants to react to it. */
  trigger: ReactNode | ((open: boolean) => ReactNode);
  /** Menu content. Receives a `close()` callback so items can dismiss the
   * menu after a single-select action without also needing local state. */
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  className?: string;
  panelClassName?: string;
  hideCaret?: boolean;
}

/** A small headless dropdown: a trigger button plus an absolutely
 * positioned panel that closes on outside click or Escape. Used throughout
 * the report builder toolbar (dataset/columns/group-by/sort/chart/date
 * range) instead of dumping every option on screen as permanent chip rows. */
export function Dropdown({ trigger, children, align = "left", className = "", panelClassName = "", hideCaret = false }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={`dd-wrap ${className}`} ref={wrapRef}>
      <button type="button" className={`dd-trigger ${open ? "open" : ""}`} onClick={() => setOpen((o) => !o)}>
        {typeof trigger === "function" ? trigger(open) : trigger}
        {!hideCaret && <ChevronDown size={13} className="dd-caret" />}
      </button>
      {open && <div className={`dd-panel dd-panel-${align} ${panelClassName}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}
