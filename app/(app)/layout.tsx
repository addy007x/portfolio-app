"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import { LivePriceUpdater } from "@/components/LivePriceUpdater";
import { CurrencyProvider } from "@/lib/currencyDisplay";
import { LanguageProvider, useLanguage } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/themeContext";
import { PortfolioProvider } from "@/lib/portfolioContext";

function LoadingScreen() {
  const { t } = useLanguage();
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--bg)", color: "var(--muted)" }}
    >
      {t("common.loading")}
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  return (
    <ThemeProvider>
      <LanguageProvider>
        <CurrencyProvider>
          {loading || !user ? (
            <LoadingScreen />
          ) : (
            <PortfolioProvider>
              <div
                className="min-h-screen mx-auto flex flex-col"
                style={{ background: "var(--bg)", maxWidth: 480 }}
              >
                <LivePriceUpdater />
                <div className="flex-1 overflow-y-auto px-4 pt-4" style={{ paddingBottom: 96 }}>
                  {children}
                </div>
                <BottomNav />
              </div>
            </PortfolioProvider>
          )}
        </CurrencyProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
