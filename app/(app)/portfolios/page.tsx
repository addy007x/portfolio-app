"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  watchHoldings,
  addHolding,
  updateHolding,
  updatePortfolio,
  computePortfolioSummary,
  findSymbolPortfolioConflict,
  UNASSIGNED_PORTFOLIO_ID,
} from "@/lib/firestore";
import { usePortfolios } from "@/lib/portfolioContext";
import type { Holding, AssetClass } from "@/lib/types";
import { ASSET_CLASS_LABEL } from "@/lib/types";
import { Card, Icon } from "@/components/Card";
import { AssetIcon } from "@/components/AssetIcon";
import { UnassignedPicker } from "@/components/UnassignedPicker";
import { Modal, FormInput, FormSelect, SubmitButton } from "@/components/Modal";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";

const ASSET_CLASSES: AssetClass[] = [
  "th_stock",
  "foreign_stock",
  "etf",
  "crypto",
  "cash",
];

export default function PortfoliosPage() {
  const { user } = useAuth();
  const { formatMoney } = useCurrencyDisplay();
  const {
    portfolios,
    currentPortfolioId,
    defaultPortfolioId,
    setCurrentPortfolioId,
    createPortfolio,
    removePortfolio,
  } = usePortfolios();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [targetOpen, setTargetOpen] = useState(false);
  const [targetPortfolioId, setTargetPortfolioId] = useState<string | null>(null);
  const [targetValue, setTargetValue] = useState("");
  const [targetSubmitting, setTargetSubmitting] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addPortfolioId, setAddPortfolioId] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({ symbol: "", assetClass: "th_stock" as AssetClass });
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return watchHoldings(user.uid, setHoldings);
  }, [user]);

  function holdingsFor(portfolioId: string) {
    return holdings.filter((h) => (h.portfolioId ?? defaultPortfolioId) === portfolioId);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreateSubmitting(true);
    try {
      await createPortfolio(createName.trim());
      setCreateName("");
      setCreateOpen(false);
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    if (holdingsFor(id).length > 0) {
      setError("ลบพอร์ตนี้ไม่ได้ ยังมีสินทรัพย์อยู่ ย้ายหรือลบสินทรัพย์ทั้งหมดก่อน");
      return;
    }
    const result = await removePortfolio(id);
    if (!result.ok) setError(result.reason ?? "ลบไม่สำเร็จ");
  }

  function openTarget(portfolioId: string, current?: number) {
    setTargetPortfolioId(portfolioId);
    setTargetValue(current ? String(current) : "");
    setTargetOpen(true);
  }

  async function handleTargetSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !targetPortfolioId) return;
    setTargetSubmitting(true);
    try {
      const amount = parseFloat(targetValue) || 0;
      await updatePortfolio(user.uid, targetPortfolioId, { targetAmount: amount });
      setTargetOpen(false);
    } finally {
      setTargetSubmitting(false);
    }
  }

  function openAdd(portfolioId: string) {
    setAddPortfolioId(portfolioId);
    setAddForm({ symbol: "", assetClass: "th_stock" });
    setAddError(null);
    setAddOpen(true);
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !addPortfolioId) return;
    setAddError(null);
    setAddSubmitting(true);
    try {
      const symbol = addForm.symbol.toUpperCase();
      const conflictPortfolioId = findSymbolPortfolioConflict(
        holdings,
        symbol,
        addPortfolioId,
        defaultPortfolioId
      );
      if (conflictPortfolioId) {
        const name = portfolios.find((p) => p.id === conflictPortfolioId)?.name ?? "พอร์ตอื่น";
        setAddError(`${symbol} อยู่ในพอร์ต "${name}" อยู่แล้ว ต้องลบออกจากพอร์ตนั้นก่อนถึงจะเพิ่มที่นี่ได้`);
        return;
      }
      // If this symbol already exists (e.g. it was just removed from another
      // portfolio), reassign that holding instead of creating a blank
      // duplicate — it keeps its quantity/cost basis intact.
      const existing = holdings.find((h) => h.symbol.toUpperCase() === symbol);
      if (existing) {
        await updateHolding(user.uid, existing.id, { portfolioId: addPortfolioId });
      } else {
        await addHolding(user.uid, {
          symbol,
          name: symbol,
          assetClass: addForm.assetClass,
          quantity: 0,
          avgCost: 0,
          currentPrice: 0,
          portfolioId: addPortfolioId,
        });
      }
      setAddOpen(false);
    } finally {
      setAddSubmitting(false);
    }
  }

  async function handleRemoveFromPortfolio(holdingId: string) {
    if (!user) return;
    await updateHolding(user.uid, holdingId, { portfolioId: UNASSIGNED_PORTFOLIO_ID });
  }

  const unassigned = holdings.filter((h) => h.portfolioId === UNASSIGNED_PORTFOLIO_ID);

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="flex justify-between items-start mb-4 mt-1">
        <div className="text-[26px] font-extrabold tracking-tight">แยกพอร์ต</div>
        <button
          onClick={() => setCreateOpen(true)}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "var(--accent)" }}
        >
          <Icon name="add" style={{ fontSize: 22, color: "#04120c" }} />
        </button>
      </div>

      <div className="text-[11px] mb-3" style={{ color: "var(--muted)" }}>
        แตะชื่อพอร์ตเพื่อสลับพอร์ตที่ใช้งานอยู่ · แตะไอคอนลูกศรเพื่อเพิ่ม/ลบสินทรัพย์และตั้งเป้าหมาย
      </div>

      {error && (
        <div
          className="text-xs rounded-[10px] px-3 py-2 mb-3"
          style={{ background: "var(--down)22", color: "var(--down)" }}
        >
          {error}
        </div>
      )}

      {unassigned.length > 0 && (
        <Card className="!p-3.5 mb-3">
          <div className="text-xs font-bold mb-2" style={{ color: "var(--muted)" }}>
            สินทรัพย์ที่เอาออกจากพอร์ตแล้ว ยังไม่ได้ใส่พอร์ตใหม่
          </div>
          <div className="flex flex-col gap-2">
            {unassigned.map((h) => (
              <div key={h.id} className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-[9px] flex items-center justify-center flex-none overflow-hidden"
                  style={{ background: "var(--surface2)" }}
                >
                  <AssetIcon symbol={h.symbol} assetClass={h.assetClass} iconUrl={h.iconUrl} size={15} />
                </div>
                <div className="flex-1 min-w-0 text-xs font-semibold truncate">{h.symbol}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  {formatMoney(h.quantity * h.currentPrice)}
                </div>
              </div>
            ))}
          </div>
          <div className="text-[11px] mt-2" style={{ color: "var(--muted)" }}>
            เปิด &quot;+ เพิ่มสินทรัพย์ในพอร์ตนี้&quot; ที่พอร์ตที่ต้องการ แล้วเลือกจากรายการนี้เพื่อใส่กลับเข้าไป
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-2.5">
        {portfolios.map((p) => {
          const active = p.id === currentPortfolioId;
          const expanded = expandedId === p.id;
          const assets = holdingsFor(p.id);
          const value = computePortfolioSummary(assets).totalValue;
          const pct = p.targetAmount && p.targetAmount > 0 ? Math.min(100, (value / p.targetAmount) * 100) : null;

          return (
            <Card key={p.id} className="!p-3.5">
              <div className="flex items-center gap-3">
                <button
                  className="flex-1 flex items-center gap-3 text-left min-w-0"
                  onClick={() => setCurrentPortfolioId(p.id)}
                >
                  <div
                    className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-none"
                    style={{ background: active ? "var(--accent-soft)" : "var(--surface2)" }}
                  >
                    <Icon
                      name="donut_small"
                      style={{ fontSize: 19, color: active ? "var(--accent)" : "var(--muted)" }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate flex items-center gap-1.5">
                      {p.name}
                      {active && (
                        <span
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ background: "var(--up)22", color: "var(--up)" }}
                        >
                          กำลังใช้
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] truncate" style={{ color: "var(--muted)" }}>
                      {assets.length} สินทรัพย์ · {formatMoney(value)}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => openTarget(p.id, p.targetAmount)}
                  className="flex-none"
                  style={{ color: "var(--muted)" }}
                >
                  <Icon name="flag" style={{ fontSize: 18 }} />
                </button>
                <button
                  onClick={() => setExpandedId(expanded ? null : p.id)}
                  className="flex-none"
                  style={{ color: "var(--muted)" }}
                >
                  <Icon name={expanded ? "expand_less" : "expand_more"} style={{ fontSize: 20 }} />
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="flex-none"
                  style={{ color: "var(--muted)" }}
                >
                  <Icon name="close" style={{ fontSize: 18 }} />
                </button>
              </div>

              {pct !== null && (
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] mb-1" style={{ color: "var(--muted)" }}>
                    <span>เป้าหมาย {formatMoney(p.targetAmount ?? 0)}</span>
                    <span style={{ color: "var(--accent)" }}>{pct.toFixed(0)}%</span>
                  </div>
                  <div
                    className="h-2 rounded-[6px] overflow-hidden"
                    style={{ background: "var(--surface2)" }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: "var(--accent)",
                        borderRadius: 6,
                      }}
                    />
                  </div>
                </div>
              )}

              {expanded && (
                <div className="mt-3.5 pt-3.5" style={{ borderTop: "var(--card-border)" }}>
                  {assets.length === 0 && (
                    <div className="text-xs text-center py-3" style={{ color: "var(--muted)" }}>
                      ยังไม่มีสินทรัพย์ในพอร์ตนี้
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    {assets.map((h) => (
                      <div key={h.id} className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-[9px] flex items-center justify-center flex-none overflow-hidden"
                          style={{ background: "var(--surface2)" }}
                        >
                          <AssetIcon symbol={h.symbol} assetClass={h.assetClass} iconUrl={h.iconUrl} size={15} />
                        </div>
                        <div className="flex-1 min-w-0 text-xs font-semibold truncate">{h.symbol}</div>
                        <div className="text-xs" style={{ color: "var(--muted)" }}>
                          {formatMoney(h.quantity * h.currentPrice)}
                        </div>
                        <button
                          onClick={() => handleRemoveFromPortfolio(h.id)}
                          className="flex-none"
                          style={{ color: "var(--muted)" }}
                          title="เอาออกจากพอร์ต"
                        >
                          <Icon name="remove_circle_outline" style={{ fontSize: 16 }} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => openAdd(p.id)}
                    className="w-full mt-3 rounded-[10px] py-2 text-xs font-bold"
                    style={{ background: "var(--surface2)", color: "var(--accent)" }}
                  >
                    + เพิ่มสินทรัพย์ในพอร์ตนี้
                  </button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="สร้างพอร์ตใหม่">
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <FormInput
            label="ชื่อพอร์ต"
            required
            placeholder="เช่น พอร์ตเกษียณ"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
          />
          <SubmitButton disabled={createSubmitting}>
            {createSubmitting ? "กำลังบันทึก..." : "สร้างพอร์ต"}
          </SubmitButton>
        </form>
      </Modal>

      <Modal open={targetOpen} onClose={() => setTargetOpen(false)} title="ตั้งเป้าหมายพอร์ต">
        <form onSubmit={handleTargetSubmit} className="flex flex-col gap-3">
          <FormInput
            label="เป้าหมาย (บาท)"
            type="number"
            step="any"
            placeholder="เช่น 1000000"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
          />
          <div className="text-[11px]" style={{ color: "var(--muted)" }}>
            เว้นว่างหรือใส่ 0 เพื่อไม่แสดงหลอดความคืบหน้า
          </div>
          <SubmitButton disabled={targetSubmitting}>
            {targetSubmitting ? "กำลังบันทึก..." : "บันทึกเป้าหมาย"}
          </SubmitButton>
        </form>
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="เพิ่มสินทรัพย์ในพอร์ต">
        <form onSubmit={handleAddSubmit} className="flex flex-col gap-3">
          <UnassignedPicker
            holdings={unassigned}
            onPick={(h) => {
              setAddForm({ symbol: h.symbol, assetClass: h.assetClass });
              setAddError(null);
            }}
          />

          <FormSelect
            label="ประเภท"
            value={addForm.assetClass}
            onChange={(e) => setAddForm({ ...addForm, assetClass: e.target.value as AssetClass })}
          >
            {ASSET_CLASSES.map((c) => (
              <option key={c} value={c}>
                {ASSET_CLASS_LABEL[c]}
              </option>
            ))}
          </FormSelect>
          <FormInput
            label="Ticker"
            required
            placeholder="AAPL"
            value={addForm.symbol}
            onChange={(e) => setAddForm({ ...addForm, symbol: e.target.value })}
          />
          {addError && (
            <div
              className="text-xs rounded-[10px] px-3 py-2"
              style={{ background: "var(--down)22", color: "var(--down)" }}
            >
              {addError}
            </div>
          )}
          <SubmitButton disabled={addSubmitting}>
            {addSubmitting ? "กำลังบันทึก..." : "+ เพิ่มสินทรัพย์"}
          </SubmitButton>
        </form>
      </Modal>
    </div>
  );
}
