"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth";
import { getUserProfile, updateUserProfile } from "@/lib/firestore";
import { fetchFxRateToThb } from "@/lib/priceFeed";

export type DisplayCurrency = "THB" | "USD";

// USD formatting at an explicit, caller-supplied rate — for figures like
// cost basis that should read as a fixed, settled amount rather than
// tracking the live rate the way current value/PnL legitimately should.
// Same "$X.XX" formatting as formatMoney's USD branch.
export function formatUsdAt(thbValue: number, rate: number): string {
  const usdValue = thbValue / rate;
  return (
    "$" +
    usdValue.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

interface CurrencyContextValue {
  currency: DisplayCurrency;
  setCurrency: (c: DisplayCurrency) => void;
  formatMoney: (thbValue: number) => string;
  formatSignedMoney: (thbValue: number) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const RATE_REFRESH_MS = 60_000;

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currency, setCurrencyState] = useState<DisplayCurrency>("THB");
  const [usdRate, setUsdRate] = useState(1);

  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then((profile) => {
      if (profile?.currency === "USD") setCurrencyState("USD");
    });
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const rate = await fetchFxRateToThb("USD");
      if (!cancelled && rate > 0) setUsdRate(rate);
    }
    tick();
    const interval = setInterval(tick, RATE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const setCurrency = useCallback(
    (c: DisplayCurrency) => {
      setCurrencyState(c);
      if (user) updateUserProfile(user.uid, { currency: c });
    },
    [user]
  );

  const formatMoney = useCallback(
    (thbValue: number) => {
      if (currency === "USD") {
        const usdValue = thbValue / usdRate;
        return (
          "$" +
          usdValue.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        );
      }
      return "฿" + Math.round(thbValue).toLocaleString("en-US");
    },
    [currency, usdRate]
  );

  const formatSignedMoney = useCallback(
    (thbValue: number) => {
      const sign = thbValue >= 0 ? "+" : "-";
      return sign + formatMoney(Math.abs(thbValue));
    },
    [formatMoney]
  );

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatMoney, formatSignedMoney }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrencyDisplay() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrencyDisplay must be used within CurrencyProvider");
  return ctx;
}
