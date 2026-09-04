// Turns a raw traffic channel value ("paid_search") into the label a human
// reads ("Paid Search"). dashboard_daily_traffic.channel is documented as
// the enum 'organic' | 'paid_social' | 'paid_search' | 'direct' — this is
// the single place that enum gets displayed, so the Overview donut, the
// Analytics report builder, and the channel filter dropdown can never show
// three different spellings of the same channel.

const KNOWN_CHANNEL_LABELS: Record<string, string> = {
  organic: "Organic",
  paid_social: "Paid Social",
  paid_search: "Paid Search",
  direct: "Direct",
};

export function humanizeChannel(raw: string): string {
  const known = KNOWN_CHANNEL_LABELS[raw];
  if (known) return known;
  if (!raw) return "Other";
  return raw
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
