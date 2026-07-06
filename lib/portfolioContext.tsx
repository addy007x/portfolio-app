"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth";
import {
  watchPortfolios,
  addPortfolio,
  deletePortfolio,
  getUserProfile,
  updateUserProfile,
} from "@/lib/firestore";
import type { Portfolio } from "@/lib/types";

const DEFAULT_PORTFOLIO_NAME = "พอร์ตหลัก";

interface PortfolioContextValue {
  portfolios: Portfolio[];
  currentPortfolioId: string | null;
  defaultPortfolioId: string | null;
  setCurrentPortfolioId: (id: string) => void;
  createPortfolio: (name: string) => Promise<void>;
  removePortfolio: (id: string) => Promise<{ ok: boolean; reason?: string }>;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [currentPortfolioId, setCurrentPortfolioIdState] = useState<string | null>(null);
  const [defaultPortfolioId, setDefaultPortfolioId] = useState<string | null>(null);
  const hasTriedMigration = useRef(false);

  useEffect(() => {
    if (!user) return;
    return watchPortfolios(user.uid, setPortfolios);
  }, [user]);

  // Load saved preferences once per session.
  useEffect(() => {
    if (!user) return;
    getUserProfile(user.uid).then((profile) => {
      if (profile?.defaultPortfolioId) setDefaultPortfolioId(profile.defaultPortfolioId);
      if (profile?.currentPortfolioId) setCurrentPortfolioIdState(profile.currentPortfolioId);
    });
  }, [user]);

  // First-run migration: a brand-new account (or one from before this
  // feature existed) has zero portfolio docs. Auto-create one so existing
  // untagged holdings/transactions have somewhere to belong (see
  // belongsToPortfolio in lib/firestore.ts).
  useEffect(() => {
    if (!user || hasTriedMigration.current) return;
    if (portfolios.length > 0) {
      hasTriedMigration.current = true;
      return;
    }
    // Wait for the profile load above to confirm there truly is no
    // recorded default before creating one, to avoid a duplicate on
    // a slow initial snapshot.
    getUserProfile(user.uid).then(async (profile) => {
      if (hasTriedMigration.current) return;
      if (profile?.defaultPortfolioId) return; // already migrated, just waiting on snapshot
      hasTriedMigration.current = true;
      const id = await addPortfolio(user.uid, DEFAULT_PORTFOLIO_NAME);
      await updateUserProfile(user.uid, { defaultPortfolioId: id, currentPortfolioId: id });
      setDefaultPortfolioId(id);
      setCurrentPortfolioIdState(id);
    });
  }, [user, portfolios]);

  // If the saved current selection doesn't exist (not loaded yet, or it was
  // deleted), fall back to the first available portfolio. Computed during
  // render rather than corrected via a setState-in-effect.
  const effectiveCurrentPortfolioId =
    currentPortfolioId && portfolios.some((p) => p.id === currentPortfolioId)
      ? currentPortfolioId
      : (portfolios[0]?.id ?? null);

  const setCurrentPortfolioId = useCallback(
    (id: string) => {
      setCurrentPortfolioIdState(id);
      if (user) updateUserProfile(user.uid, { currentPortfolioId: id });
    },
    [user]
  );

  const createPortfolio = useCallback(
    async (name: string) => {
      if (!user || !name.trim()) return;
      await addPortfolio(user.uid, name.trim());
    },
    [user]
  );

  const removePortfolio = useCallback(
    async (id: string): Promise<{ ok: boolean; reason?: string }> => {
      if (!user) return { ok: false, reason: "not signed in" };
      if (portfolios.length <= 1) {
        return { ok: false, reason: "ต้องมีอย่างน้อย 1 พอร์ต" };
      }
      await deletePortfolio(user.uid, id);
      return { ok: true };
    },
    [user, portfolios]
  );

  return (
    <PortfolioContext.Provider
      value={{
        portfolios,
        currentPortfolioId: effectiveCurrentPortfolioId,
        defaultPortfolioId,
        setCurrentPortfolioId,
        createPortfolio,
        removePortfolio,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolios() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolios must be used within PortfolioProvider");
  return ctx;
}
