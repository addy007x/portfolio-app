"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  watchHoldings,
  watchTransactions,
  getInvestPlan,
  saveInvestPlan,
} from "@/lib/firestore";
import type { Holding, Transaction } from "@/lib/types";
import { ASSET_CLASS_COLOR } from "@/lib/types";
import { Card } from "@/components/Card";
import { AssetIcon } from "@/components/AssetIcon";
import { FormInput, FormSelect } from "@/components/Modal";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";
import { useLanguage } from "@/lib/i18n";

function currentBeYear(): number {
  return new Date().getFullYear() + 543;
}

interface PlanRow {
  symbol: string;
  pct: string; // kept as text while editing
}

export default function PlanPage() {
  const { user } = useAuth();
  const { formatMoney } = useCurrencyDisplay();
  const { t } = useLanguage();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [year, setYear] = useState(String(currentBeYear()));
  const [budget, setBudget] = useState("");
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [savedExists, setSavedExists] = useState(false);
  // The year whose plan has finished loading — comparing against the
  // selected year doubles as the "loaded" flag without needing a
  // synchronous setState when the year changes.
  const [loadedYear, setLoadedYear] = useState<number | null>(null);
  // Once the user edits anything, stop deriving default rows from holdings.
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addSymbol, setAddSymbol] = useState("");

  useEffect(() => {
    if (!user) return;
    const unsub1 = watchHoldings(user.uid, setHoldings);
    const unsub2 = watchTransactions(user.uid, setTransactions);
    return () => {
      unsub1();
      unsub2();
    };
  }, [user]);

  const beYear = parseInt(year) || 0;
  const yearValid = beYear >= 2500 && beYear <= 2700;

  // Load the saved plan whenever the selected year changes.
  useEffect(() => {
    if (!user || !yearValid) return;
    let cancelled = false;
    getInvestPlan(user.uid, beYear).then((plan) => {
      if (cancelled) return;
      if (plan) {
        setBudget(plan.budget > 0 ? String(plan.budget) : "");
        setRows(plan.items.map((i) => ({ symbol: i.symbol, pct: String(i.pct) })));
        setSavedExists(true);
      } else {
        setRows([]);
        setSavedExists(false);
      }
      setTouched(false);
      setLoadedYear(beYear);
    });
    return () => {
      cancelled = true;
    };
  }, [user, beYear, yearValid]);

  const loaded = loadedYear === beYear;

  // Everything the user could plan for (cash isn't DCA'd into).
  const plannableHoldings = holdings.filter((h) => h.assetClass !== "cash");

  // For a year with no saved plan, start from what's actually held (at 0%)
  // instead of an empty list. Derived at render time — becomes real state
  // on the first edit — so no setState-in-effect is needed.
  const displayRows: PlanRow[] =
    !touched && !savedExists && loaded && rows.length === 0
      ? plannableHoldings.map((h) => ({ symbol: h.symbol.toUpperCase(), pct: "0" }))
      : rows;

  function mutateRows(next: PlanRow[]) {
    setRows(next);
    setTouched(true);
  }

  const ceYearPrefix = `${beYear - 543}-`;
  function investedThisYear(symbol: string): number {
    return transactions
      .filter(
        (tx) =>
          tx.type === "buy" &&
          tx.symbol.toUpperCase() === symbol.toUpperCase() &&
          tx.date.startsWith(ceYearPrefix)
      )
      .reduce((sum, tx) => sum + tx.totalValue, 0);
  }

  const budgetNum = parseFloat(budget) || 0;
  const totalInvested = displayRows.reduce((sum, r) => sum + investedThisYear(r.symbol), 0);
  const remainingBudget = budgetNum - totalInvested;
  const pctSum = displayRows.reduce((sum, r) => sum + (parseFloat(r.pct) || 0), 0);

  const inPlan = new Set(displayRows.map((r) => r.symbol.toUpperCase()));
  const addable = plannableHoldings.filter((h) => !inPlan.has(h.symbol.toUpperCase()));

  function holdingFor(symbol: string): Holding | undefined {
    return holdings.find((h) => h.symbol.toUpperCase() === symbol.toUpperCase());
  }

  async function handleSave() {
    if (!user || !yearValid) return;
    setSaving(true);
    try {
      await saveInvestPlan(user.uid, beYear, {
        budget: budgetNum,
        items: displayRows.map((r) => ({
          symbol: r.symbol.toUpperCase(),
          pct: parseFloat(r.pct) || 0,
        })),
      });
      // Whatever was showing (possibly holdings-derived defaults) is now
      // the saved plan — promote it to real state.
      setRows(displayRows);
      setSavedExists(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="flex justify-between items-start mb-4 mt-1">
        <div className="text-[26px] font-extrabold tracking-tight">{t("plan.title")}</div>
      </div>

      <Card>
        {budgetNum > 0 && (
          <div className="text-sm font-bold mb-1">
            {remainingBudget > 0
              ? t("plan.belowBudget", { year, amount: formatMoney(remainingBudget) })
              : t("plan.metBudget", { year })}
          </div>
        )}
        <div className="text-[11px] mb-3" style={{ color: "var(--muted)" }}>
          {t("plan.budgetThisYear")} {formatMoney(budgetNum)} ·{" "}
          {savedExists ? t("plan.savedInfo") : t("plan.notSavedYet")}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormInput
            label={t("plan.yearLabel")}
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
          <FormInput
            label={t("plan.budgetLabel")}
            type="number"
            step="any"
            placeholder="120000"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !yearValid}
          className="w-full rounded-[14px] py-3 font-bold text-center mt-3"
          style={{ background: "var(--accent)", color: "#04120c", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? t("plan.saving") : t("plan.save")}
        </button>
      </Card>

      {addable.length > 0 && (
        <div className="flex items-end gap-2 mt-3">
          <div className="flex-1">
            <FormSelect
              label={t("plan.addPlaceholder")}
              value={addSymbol}
              onChange={(e) => setAddSymbol(e.target.value)}
            >
              <option value="" disabled>
                {t("plan.addPlaceholder")}
              </option>
              {addable.map((h) => (
                <option key={h.id} value={h.symbol.toUpperCase()}>
                  {h.symbol.toUpperCase()}
                </option>
              ))}
            </FormSelect>
          </div>
          <button
            onClick={() => {
              if (!addSymbol) return;
              mutateRows([...displayRows, { symbol: addSymbol, pct: "0" }]);
              setAddSymbol("");
            }}
            className="rounded-[12px] px-4 py-2.5 text-sm font-bold flex-none"
            style={{ background: "var(--surface2)", color: "var(--accent)" }}
          >
            {t("plan.addToPlan")}
          </button>
        </div>
      )}

      <div
        className="text-[11px] mt-3 mb-2"
        style={{ color: pctSum > 100 ? "var(--down)" : "var(--muted)" }}
      >
        {t("plan.pctTotal", { pct: Math.round(pctSum * 100) / 100 })}
      </div>

      <div className="flex flex-col gap-2.5">
        {displayRows.length === 0 && (
          <div className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
            {t("plan.empty")}
          </div>
        )}
        {displayRows.map((r, idx) => {
          const h = holdingFor(r.symbol);
          const invested = investedThisYear(r.symbol);
          const investedPct = budgetNum > 0 ? (invested / budgetNum) * 100 : 0;
          const pctNum = parseFloat(r.pct) || 0;
          const target = (budgetNum * pctNum) / 100;
          const remaining = target - invested;
          const assetClass = h?.assetClass ?? "foreign_stock";
          return (
            <Card key={r.symbol} className="!p-3.5">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-none overflow-hidden"
                  style={{ background: `${ASSET_CLASS_COLOR[assetClass]}22` }}
                >
                  <AssetIcon symbol={r.symbol} assetClass={assetClass} iconUrl={h?.iconUrl} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{r.symbol}</div>
                  <div className="text-[11px] truncate" style={{ color: "var(--muted)" }}>
                    {formatMoney(invested)} · {t("plan.investedNow")} {investedPct.toFixed(1)}%
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-none">
                  <input
                    type="number"
                    step="any"
                    value={r.pct}
                    onChange={(e) =>
                      mutateRows(
                        displayRows.map((x, i) => (i === idx ? { ...x, pct: e.target.value } : x))
                      )
                    }
                    className="rounded-[10px] px-2 py-1.5 text-sm text-center outline-none"
                    style={{ background: "var(--surface2)", color: "var(--text)", width: 58 }}
                  />
                  <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                    %
                  </span>
                </div>
                <div className="text-right flex-none" style={{ minWidth: 96 }}>
                  <div
                    className="text-sm font-bold"
                    style={{ color: remaining >= 0 ? "var(--up)" : "var(--down)" }}
                  >
                    {formatMoney(Math.abs(remaining))}
                  </div>
                  <div
                    className="text-[10px]"
                    style={{ color: remaining >= 0 ? "var(--up)" : "var(--down)" }}
                  >
                    {remaining >= 0
                      ? `${t("plan.buyableNow")} ${formatMoney(remaining)}`
                      : `${t("plan.overPlan")} ${formatMoney(-remaining)}`}
                  </div>
                  <button
                    onClick={() => mutateRows(displayRows.filter((_, i) => i !== idx))}
                    className="text-[10px] font-semibold mt-0.5"
                    style={{ color: "var(--down)" }}
                  >
                    {t("plan.removeFromPlan")}
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
