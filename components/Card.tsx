import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-[var(--surface)] rounded-[var(--radius)] p-4 ${className}`}
      style={{
        border: "var(--card-border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      {children}
    </div>
  );
}

export function Icon({
  name,
  className = "",
  style,
}: {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`material-symbols-rounded ${className}`}
      style={{ fontFamily: "'Material Symbols Rounded'", ...style }}
    >
      {name}
    </span>
  );
}
