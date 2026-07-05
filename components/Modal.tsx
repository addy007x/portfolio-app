"use client";

import type { ReactNode } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 rounded-t-[24px] p-5 pb-8 max-h-[85vh] overflow-y-auto"
        style={{
          background: "var(--surface)",
          animation: "sheetup 0.25s ease both",
          maxWidth: 480,
          margin: "0 auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <div className="text-[16px] font-bold">{title}</div>
          <button onClick={onClose} style={{ color: "var(--muted)" }}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FormInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }
) {
  const { label, className, ...rest } = props;
  return (
    <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--muted)" }}>
      {label}
      <input
        {...rest}
        className={`rounded-[12px] px-3 py-2.5 text-sm outline-none ${className ?? ""}`}
        style={{ background: "var(--surface2)", color: "var(--text)" }}
      />
    </label>
  );
}

export function FormSelect(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & {
    label: string;
    children: ReactNode;
  }
) {
  const { label, children, className, ...rest } = props;
  return (
    <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--muted)" }}>
      {label}
      <select
        {...rest}
        className={`rounded-[12px] px-3 py-2.5 text-sm outline-none ${className ?? ""}`}
        style={{ background: "var(--surface2)", color: "var(--text)" }}
      >
        {children}
      </select>
    </label>
  );
}

export function SubmitButton({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="rounded-[14px] py-3 font-bold text-center mt-2"
      style={{ background: "var(--accent)", color: "#04120c" }}
    >
      {children}
    </button>
  );
}
