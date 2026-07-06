"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { updateUserProfile } from "@/lib/firestore";
import { Card, Icon } from "@/components/Card";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";
import { useLanguage, type Language } from "@/lib/i18n";
import { useTheme, type ThemePreference } from "@/lib/themeContext";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { currency, setCurrency } = useCurrencyDisplay();
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [name, setName] = useState(user?.displayName ?? "");

  async function handleSaveName() {
    if (!user) return;
    await updateUserProfile(user.uid, { name });
  }

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="text-[26px] font-extrabold tracking-tight mb-4 mt-1">{t("settings.title")}</div>

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
          <span className="flex-1 text-sm">{t("settings.language")}</span>
          <div className="flex rounded-[10px] overflow-hidden" style={{ background: "var(--surface2)" }}>
            {(["th", "en"] as Language[]).map((l) => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                className="px-3 py-1.5 text-xs font-semibold"
                style={
                  language === l
                    ? { background: "var(--accent)", color: "#04120c" }
                    : { color: "var(--muted)" }
                }
              >
                {l === "th" ? t("settings.languageThai") : t("settings.languageEnglish")}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: "var(--card-border)" }}>
          <Icon name="dark_mode" style={{ fontSize: 20, color: "var(--muted)" }} />
          <span className="flex-1 text-sm">{t("settings.theme")}</span>
          <div className="flex rounded-[10px] overflow-hidden" style={{ background: "var(--surface2)" }}>
            {(["dark", "light", "system"] as ThemePreference[]).map((th) => (
              <button
                key={th}
                onClick={() => setTheme(th)}
                className="px-3 py-1.5 text-xs font-semibold"
                style={
                  theme === th
                    ? { background: "var(--accent)", color: "#04120c" }
                    : { color: "var(--muted)" }
                }
              >
                {th === "dark"
                  ? t("settings.themeDark")
                  : th === "light"
                    ? t("settings.themeLight")
                    : t("settings.themeSystem")}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Icon name="payments" style={{ fontSize: 20, color: "var(--muted)" }} />
          <span className="flex-1 text-sm">{t("settings.currency")}</span>
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
                {c === "THB" ? t("settings.currencyThb") : t("settings.currencyUsd")}
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
        {t("settings.logout")}
      </button>
    </div>
  );
}
