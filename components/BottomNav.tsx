"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Card";

const PRIMARY = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: "home" },
  { id: "portfolio", href: "/portfolio", label: "Portfolio", icon: "donut_small" },
  { id: "transactions", href: "/transactions", label: "Transaction", icon: "receipt_long" },
  { id: "earn", href: "/earn", label: "Earn", icon: "savings" },
];

const MORE = [
  { href: "/goals", label: "เป้าหมาย (Goals)", icon: "flag" },
  { href: "/dividends", label: "เงินปันผล (Dividends)", icon: "paid" },
  { href: "/cashflow", label: "กระแสเงินสด (Cashflow)", icon: "account_balance" },
  { href: "/performance", label: "ผลตอบแทน (Performance)", icon: "trending_up" },
  { href: "/rebalance", label: "ปรับสมดุลพอร์ต (Rebalance)", icon: "balance" },
  { href: "/reports", label: "รายงาน (Reports)", icon: "description" },
  { href: "/settings", label: "ตั้งค่า (Settings)", icon: "settings" },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-[24px] p-5 pb-8"
            style={{
              background: "var(--surface)",
              animation: "sheetup 0.25s ease both",
              maxWidth: 480,
              margin: "0 auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[15px] font-bold mb-3">เมนูเพิ่มเติม</div>
            <div className="grid grid-cols-3 gap-3">
              {MORE.map((m) => (
                <button
                  key={m.href}
                  onClick={() => {
                    setMoreOpen(false);
                    router.push(m.href);
                  }}
                  className="flex flex-col items-center gap-2 p-3 rounded-[14px] text-center"
                  style={{ background: "var(--surface2)" }}
                >
                  <Icon
                    name={m.icon}
                    style={{ fontSize: 22, color: "var(--accent)" }}
                  />
                  <span className="text-[11px]" style={{ color: "var(--text)" }}>
                    {m.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 flex items-center justify-around px-2 py-2 z-30"
        style={{
          background: "var(--nav-bg)",
          backdropFilter: "blur(12px)",
          borderTop: "var(--card-border)",
          maxWidth: 480,
          margin: "0 auto",
        }}
      >
        {PRIMARY.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              className="flex flex-col items-center gap-0.5 px-2 py-1"
              style={{ color: active ? "var(--accent)" : "var(--muted)" }}
            >
              <Icon name={item.icon} style={{ fontSize: 22 }} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center gap-0.5 px-2 py-1"
          style={{ color: moreOpen ? "var(--accent)" : "var(--muted)" }}
        >
          <Icon name="apps" style={{ fontSize: 22 }} />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>
    </>
  );
}
