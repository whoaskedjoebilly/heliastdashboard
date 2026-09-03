"use client";

import { useState } from "react";
import { Calendar, Check } from "lucide-react";
import { Dropdown } from "./ui/Dropdown";
import { PRESET_ORDER, customRange, presetRange, type ReportRange } from "@/lib/reports/date-range";

const PRESET_LABEL: Record<(typeof PRESET_ORDER)[number], string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

interface DateRangePickerProps {
  value: ReportRange;
  onChange: (range: ReportRange) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [customStart, setCustomStart] = useState(value.key === "custom" ? value.startStr : value.startStr);
  const [customEnd, setCustomEnd] = useState(value.key === "custom" ? value.endStr : value.endStr);
  const [showCustom, setShowCustom] = useState(value.key === "custom");

  return (
    <Dropdown
      align="right"
      className="drp"
      trigger={
        <>
          <Calendar size={13} />
          <span>{value.label}</span>
        </>
      }
    >
      {(close) => (
        <div className="drp-menu">
          <div className="dd-section-label">Quick select</div>
          <div className="drp-presets">
            {PRESET_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                className={`dd-item ${value.key === key ? "active" : ""}`}
                onClick={() => {
                  onChange(presetRange(key));
                  setShowCustom(false);
                  close();
                }}
              >
                {PRESET_LABEL[key]}
                {value.key === key && <Check size={13} />}
              </button>
            ))}
            <button
              type="button"
              className={`dd-item ${value.key === "custom" ? "active" : ""}`}
              onClick={() => setShowCustom(true)}
            >
              Custom range
              {value.key === "custom" && <Check size={13} />}
            </button>
          </div>

          {showCustom && (
            <div className="drp-custom">
              <div className="dd-section-label">Custom range</div>
              <div className="drp-date-row">
                <input
                  type="date"
                  className="drp-date-input"
                  value={customStart}
                  max={customEnd}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
                <span className="drp-date-sep">to</span>
                <input
                  type="date"
                  className="drp-date-input"
                  value={customEnd}
                  min={customStart}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="drp-apply"
                onClick={() => {
                  onChange(customRange(customStart, customEnd));
                  close();
                }}
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </Dropdown>
  );
}
