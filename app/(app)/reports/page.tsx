"use client";

import { ComingSoon } from "@/components/ComingSoon";
import { useLanguage } from "@/lib/i18n";

export default function ReportsPage() {
  const { t } = useLanguage();
  return <ComingSoon title={t("reports.title")} icon="description" />;
}
