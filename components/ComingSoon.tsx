"use client";

import { Icon } from "@/components/Card";
import { useLanguage } from "@/lib/i18n";

export function ComingSoon({ title, icon }: { title: string; icon: string }) {
  const { t } = useLanguage();
  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="text-[26px] font-extrabold tracking-tight mb-4 mt-1">{title}</div>
      <div
        className="flex flex-col items-center justify-center gap-3 py-16 text-center"
        style={{ color: "var(--muted)" }}
      >
        <Icon name={icon} style={{ fontSize: 40 }} />
        <div className="text-sm">{t("reports.comingSoonMessage")}</div>
      </div>
    </div>
  );
}
