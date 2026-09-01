interface DeltaProps {
  value: number;
  invert?: boolean;
}

export function Delta({ value, invert = false }: DeltaProps) {
  const positive = invert ? value < 0 : value > 0;
  const zero = value === 0;
  const color = zero ? "var(--text-muted)" : positive ? "var(--accent)" : "var(--warn)";
  const sign = value > 0 ? "+" : "";
  return (
    <span className="delta" style={{ color }}>
      {zero ? "flat" : `${sign}${value}`}
    </span>
  );
}
