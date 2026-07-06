"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { updateUserProfile } from "@/lib/firestore";
import { Card, Icon } from "@/components/Card";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { currency, setCurrency } = useCurrencyDisplay();
  const router = useRouter();
  const [name, setName] = useState(user?.displayName ?? "");

  async function handleSaveName() {
    if (!user) return;
    await updateUserProfile(user.uid, { name });
  }

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="text-[26px] font-extrabold tracking-tight mb-4 mt-1">Settings</div>

      <Card className="flex items-center gap-3">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center flex-none font-extrabold text-lg"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {(user?.displayName ?? user?.email ?? "?").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleSaveName}
            className="text-sm font-bold bg-transparent outline-none w-full"
            style={{ color: "var(--text)" }}
          />
          <div className="text-[12px] truncate" style={{ color: "var(--muted)" }}>
            {user?.email}
          </div>
        </div>
      </Card>

      <Card className="mt-3 !p-0 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: "var(--card-border)" }}>
          <Icon name="language" style={{ fontSize: 20, color: "var(--muted)" }} />
          <span className="flex-1 text-sm">ภาษา</span>
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            ไทย
          </span>
        </div>
        <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: "var(--card-border)" }}>
          <Icon name="dark_mode" style={{ fontSize: 20, color: "var(--muted)" }} />
          <span className="flex-1 text-sm">ธีม</span>
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            เข้ม
          </span>
        </div>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Icon name="payments" style={{ fontSize: 20, color: "var(--muted)" }} />
          <span className="flex-1 text-sm">สกุลเงิน</span>
          <div className="flex rounded-[10px] overflow-hidden" style={{ background: "var(--surface2)" }}>
            {(["THB", "USD"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className="px-3 py-1.5 text-xs font-semibold"
                style={
                  currency === c
                    ? { background: "var(--accent)", color: "#04120c" }
                    : { color: "var(--muted)" }
                }
              >
                {c === "THB" ? "บาท" : "USD"}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <button
        onClick={async () => {
          await signOut();
          router.replace("/login");
        }}
        className="w-full mt-4 rounded-[14px] py-3.5 font-bold text-center"
        style={{ background: "var(--surface2)", color: "var(--down)" }}
      >
        ออกจากระบบ
      </button>
    </div>
  );
}
