"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getUserProfile, updateUserProfile } from "@/lib/firestore";
import { importWebullTrades } from "@/lib/webullImport";
import { usePortfolios } from "@/lib/portfolioContext";
import { Card, Icon } from "@/components/Card";
import { FormInput } from "@/components/Modal";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";
import { useLanguage, type Language } from "@/lib/i18n";
import { useTheme, type ThemePreference } from "@/lib/themeContext";
import { formatBaht, formatSignedBaht } from "@/lib/format";

interface WebullPositionView {
  symbol: string;
  quantity: number;
  costPrice: number;
  lastPrice: number;
  unrealizedPnl: number;
  currency: string;
}
interface WebullBalanceView {
  totalMarketValue: number;
  totalCashBalance: number;
  totalUnrealizedPnl: number;
  currency: string;
}

function formatUsd(value: number): string {
  return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const todayIso = new Date().toISOString().slice(0, 10);
const oneYearAgoIso = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { currency, setCurrency } = useCurrencyDisplay();
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [name, setName] = useState(user?.displayName ?? "");
  const [lineToken, setLineToken] = useState("");
  const [lineUserId, setLineUserId] = useState("");
  const [lineSaved, setLineSaved] = useState(false);
  const [lineTesting, setLineTesting] = useState(false);
  const [lineTestResult, setLineTestResult] = useState<{ ok: boolean; detail: string } | null>(
    null
  );
  const { currentPortfolioId } = usePortfolios();
  const [uidCopied, setUidCopied] = useState(false);
  const [importFrom, setImportFrom] = useState(oneYearAgoIso);
  const [importTo, setImportTo] = useState(todayIso);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [positions, setPositions] = useState<WebullPositionView[] | null>(null);
  const [balance, setBalance] = useState<WebullBalanceView | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then((p) => {
      if (p?.lineToken) setLineToken(p.lineToken);
      if (p?.lineUserId) setLineUserId(p.lineUserId);
    });
  }, [user]);

  async function handleSaveName() {
    if (!user) return;
    await updateUserProfile(user.uid, { name });
  }

  async function handleSaveLine() {
    if (!user) return;
    await updateUserProfile(user.uid, {
      lineToken: lineToken.trim(),
      lineUserId: lineUserId.trim(),
    });
    setLineSaved(true);
    setTimeout(() => setLineSaved(false), 2000);
  }

  async function handleTestLine() {
    if (lineTesting) return;
    setLineTestResult(null);
    const token = lineToken.trim();
    const userId = lineUserId.trim();
    if (!token || !userId) {
      setLineTestResult({ ok: false, detail: t("settings.lineTestMissing") });
      return;
    }
    setLineTesting(true);
    try {
      const res = await fetch("/api/line-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, userId, message: t("settings.lineTestMessage") }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      setLineTestResult(
        data.ok
          ? { ok: true, detail: t("settings.lineTestOk") }
          : { ok: false, detail: data.error ?? t("settings.lineTestFail") }
      );
    } catch {
      setLineTestResult({ ok: false, detail: t("settings.lineTestNetworkError") });
    } finally {
      setLineTesting(false);
    }
  }

  // Pulls filled orders from the owner's Webull account and turns the ones
  // not already imported into transactions. See lib/webullImport.ts — this
  // is also used by the Portfolio page's automatic sync.
  async function handleImportWebull() {
    if (!user || importing) return;
    setImportResult(null);
    if (importFrom > importTo) {
      setImportResult({ ok: false, detail: t("settings.webullBadRange") });
      return;
    }
    setImporting(true);
    try {
      const outcome = await importWebullTrades(user, importFrom, importTo, currentPortfolioId);
      if (!outcome.ok) {
        // Unknown codes must not leak a raw dictionary key into the UI —
        // t() returns the key verbatim when it has no entry.
        const key = `settings.webullErr.${outcome.error}`;
        const detail = t(key);
        setImportResult({ ok: false, detail: detail === key ? t("settings.webullErr.undefined") : detail });
        return;
      }
      const { totalFound, added, skipped } = outcome.summary;
      setImportResult({
        ok: true,
        detail:
          added === 0
            ? t("settings.webullNothingNew", { found: totalFound })
            : t("settings.webullImported", { added, skipped }),
      });
    } finally {
      setImporting(false);
    }
  }

  // Read-only view of current Webull holdings — separate from the import
  // flow above, and from /api/prices, since /openapi/assets/* needs only
  // the account/trading permission already granted, not the (unpurchased)
  // market-data subscription that blocks live US quotes elsewhere.
  async function handleLoadPositions() {
    if (!user || positionsLoading) return;
    setPositionsError(null);
    setPositionsLoading(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/webull/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        positions?: WebullPositionView[];
        balance?: WebullBalanceView | null;
      };
      if (!data.ok) {
        const key = `settings.webullErr.${data.error ?? "undefined"}`;
        const detail = t(key);
        setPositionsError(detail === key ? t("settings.webullErr.undefined") : detail);
        return;
      }
      setPositions(data.positions ?? []);
      setBalance(data.balance ?? null);
    } catch {
      setPositionsError(t("settings.webullErr.network"));
    } finally {
      setPositionsLoading(false);
    }
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

      <Card className="mt-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon name="notifications" style={{ fontSize: 20, color: "var(--muted)" }} />
          <span className="text-sm font-bold">{t("settings.lineTitle")}</span>
        </div>
        <div className="text-[11px] mb-3" style={{ color: "var(--muted)" }}>
          {t("settings.lineHelp")}
        </div>
        <div className="flex flex-col gap-3">
          <FormInput
            label={t("settings.lineToken")}
            type="password"
            value={lineToken}
            onChange={(e) => setLineToken(e.target.value)}
          />
          <FormInput
            label={t("settings.lineUserId")}
            value={lineUserId}
            onChange={(e) => setLineUserId(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSaveLine}
              className="flex-1 rounded-[12px] py-2.5 text-sm font-bold"
              style={{ background: "var(--accent)", color: "#04120c" }}
            >
              {lineSaved ? t("settings.lineSaved") : t("settings.lineSave")}
            </button>
            <button
              onClick={handleTestLine}
              disabled={lineTesting}
              className="flex-1 rounded-[12px] py-2.5 text-sm font-bold"
              style={{
                background: "var(--surface2)",
                color: "var(--accent)",
                opacity: lineTesting ? 0.7 : 1,
              }}
            >
              {lineTesting ? t("settings.lineTesting") : t("settings.lineTest")}
            </button>
          </div>
          {lineTestResult && (
            <div
              className="text-[11.5px] rounded-[10px] px-3 py-2"
              style={{
                background: lineTestResult.ok ? "var(--accent-soft)" : "rgba(224,57,62,0.12)",
                color: lineTestResult.ok ? "var(--accent)" : "var(--down)",
              }}
            >
              {lineTestResult.detail}
            </div>
          )}
        </div>
      </Card>

      <Card className="mt-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon name="sync_alt" style={{ fontSize: 20, color: "var(--muted)" }} />
          <span className="text-sm font-bold">{t("settings.webullTitle")}</span>
        </div>
        <div className="text-[11px] mb-3" style={{ color: "var(--muted)" }}>
          {t("settings.webullHelp")}
        </div>

        {/* The server only serves this data to the uid in WEBULL_OWNER_UID,
            so the value has to be readable somewhere to configure it. */}
        <div className="mb-3">
          <div className="text-[11px] mb-1" style={{ color: "var(--muted)" }}>
            {t("settings.webullUidLabel")}
          </div>
          <button
            onClick={() => {
              if (!user) return;
              navigator.clipboard?.writeText(user.uid);
              setUidCopied(true);
              setTimeout(() => setUidCopied(false), 2000);
            }}
            className="w-full flex items-center gap-2 rounded-[10px] px-3 py-2 text-left"
            style={{ background: "var(--surface2)" }}
          >
            <span
              className="flex-1 text-[11px] font-mono break-all"
              style={{ color: "var(--muted)" }}
            >
              {user?.uid ?? "—"}
            </span>
            <Icon
              name={uidCopied ? "check" : "content_copy"}
              style={{ fontSize: 16, color: "var(--accent)" }}
            />
          </button>
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <FormInput
              label={t("settings.webullFrom")}
              type="date"
              value={importFrom}
              onChange={(e) => setImportFrom(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <FormInput
              label={t("settings.webullTo")}
              type="date"
              value={importTo}
              onChange={(e) => setImportTo(e.target.value)}
            />
          </div>
        </div>

        <button
          onClick={handleImportWebull}
          disabled={importing}
          className="w-full mt-3 rounded-[12px] py-2.5 text-sm font-bold flex items-center justify-center gap-2"
          style={{
            background: "var(--accent)",
            color: "#04120c",
            opacity: importing ? 0.7 : 1,
          }}
        >
          <Icon name={importing ? "hourglass_top" : "download"} style={{ fontSize: 17 }} />
          {importing ? t("settings.webullImporting") : t("settings.webullImport")}
        </button>

        {importResult && (
          <div
            className="text-[11.5px] rounded-[10px] px-3 py-2 mt-3"
            style={{
              background: importResult.ok ? "var(--accent-soft)" : "rgba(224,57,62,0.12)",
              color: importResult.ok ? "var(--accent)" : "var(--down)",
            }}
          >
            {importResult.detail}
          </div>
        )}
      </Card>

      <Card className="mt-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon name="pie_chart" style={{ fontSize: 20, color: "var(--muted)" }} />
          <span className="text-sm font-bold">{t("settings.webullAssetsTitle")}</span>
        </div>
        <div className="text-[11px] mb-3" style={{ color: "var(--muted)" }}>
          {t("settings.webullAssetsHelp")}
        </div>

        <button
          onClick={handleLoadPositions}
          disabled={positionsLoading}
          className="w-full rounded-[12px] py-2.5 text-sm font-bold flex items-center justify-center gap-2"
          style={{
            background: "var(--surface2)",
            color: "var(--accent)",
            opacity: positionsLoading ? 0.7 : 1,
          }}
        >
          <Icon name={positionsLoading ? "hourglass_top" : "refresh"} style={{ fontSize: 17 }} />
          {positionsLoading ? t("settings.webullLoading") : t("settings.webullRefresh")}
        </button>

        {positionsError && (
          <div
            className="text-[11.5px] rounded-[10px] px-3 py-2 mt-3"
            style={{ background: "rgba(224,57,62,0.12)", color: "var(--down)" }}
          >
            {positionsError}
          </div>
        )}

        {balance && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="rounded-[10px] px-3 py-2" style={{ background: "var(--surface2)" }}>
              <div className="text-[10.5px]" style={{ color: "var(--muted)" }}>
                {t("settings.webullMarketValue")}
              </div>
              <div className="text-sm font-bold">{formatBaht(balance.totalMarketValue)}</div>
            </div>
            <div className="rounded-[10px] px-3 py-2" style={{ background: "var(--surface2)" }}>
              <div className="text-[10.5px]" style={{ color: "var(--muted)" }}>
                {t("settings.webullUnrealizedPnl")}
              </div>
              <div
                className="text-sm font-bold"
                style={{ color: balance.totalUnrealizedPnl >= 0 ? "var(--accent)" : "var(--down)" }}
              >
                {formatSignedBaht(balance.totalUnrealizedPnl)}
              </div>
            </div>
          </div>
        )}

        {positions && positions.length > 0 && (
          <div className="flex flex-col gap-2 mt-3">
            {positions.map((p) => (
              <div
                key={p.symbol}
                className="flex items-center justify-between rounded-[10px] px-3 py-2"
                style={{ background: "var(--surface2)" }}
              >
                <div>
                  <div className="text-sm font-bold">{p.symbol}</div>
                  <div className="text-[10.5px]" style={{ color: "var(--muted)" }}>
                    {p.quantity} @ {formatUsd(p.costPrice)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold">{formatUsd(p.lastPrice)}</div>
                  <div
                    className="text-[10.5px] font-semibold"
                    style={{ color: p.unrealizedPnl >= 0 ? "var(--accent)" : "var(--down)" }}
                  >
                    {p.unrealizedPnl >= 0 ? "+" : ""}
                    {formatUsd(p.unrealizedPnl)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {positions && positions.length === 0 && (
          <div className="text-[11.5px] text-center mt-3" style={{ color: "var(--muted)" }}>
            {t("settings.webullNoPositions")}
          </div>
        )}
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
