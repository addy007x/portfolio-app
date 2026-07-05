"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  watchHoldings,
  addHolding,
  updateHolding,
  deleteHolding,
  computePortfolioSummary,
} from "@/lib/firestore";
import type { Holding, AssetClass } from "@/lib/types";
import { ASSET_CLASS_LABEL, ASSET_CLASS_COLOR } from "@/lib/types";
import { Card, Icon } from "@/components/Card";
import { AssetIcon } from "@/components/AssetIcon";
import { Modal, FormInput, FormSelect, SubmitButton } from "@/components/Modal";
import { formatPct } from "@/lib/format";
import { useCurrencyDisplay } from "@/lib/currencyDisplay";

const ASSET_CLASSES: AssetClass[] = [
  "th_stock",
  "foreign_stock",
  "etf",
  "crypto",
  "cash",
];

export default function PortfolioPage() {
  const { user } = useAuth();
  const { formatMoney } = useCurrencyDisplay();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    symbol: "",
    assetClass: "th_stock" as AssetClass,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    return watchHoldings(user.uid, setHoldings);
  }, [user]);

  const summary = computePortfolioSummary(holdings);

  function openAdd() {
    setEditingId(null);
    setForm({ symbol: "", assetClass: "th_stock" });
    setOpen(true);
  }

  function openEdit(h: Holding) {
    setEditingId(h.id);
    setForm({ symbol: h.symbol, assetClass: h.assetClass });
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      if (editingId) {
        await updateHolding(user.uid, editingId, { assetClass: form.assetClass });
      } else {
        const symbol = form.symbol.toUpperCase();
        await addHolding(user.uid, {
          symbol,
          name: symbol,
          assetClass: form.assetClass,
          quantity: 0,
          avgCost: 0,
          currentPrice: 0,
        });
      }
      setForm({ symbol: "", assetClass: "th_stock" });
      setEditingId(null);
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="flex justify-between items-start mb-4 mt-1">
        <div className="text-[26px] font-extrabold tracking-tight">Portfolio</div>
        <button
          onClick={openAdd}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "var(--accent)" }}
        >
          <Icon name="add" style={{ fontSize: 22, color: "#04120c" }} />
        </button>
      </div>

      <Card>
        <div className="text-[13px]" style={{ color: "var(--muted)" }}>
          มูลค่ารวม
        </div>
        <div className="text-2xl font-extrabold mt-1">{formatMoney(summary.totalValue)}</div>
        <div
          className="text-sm font-bold mt-0.5"
          style={{ color: summary.pnl >= 0 ? "var(--up)" : "var(--down)" }}
        >
          {formatPct(summary.pnlPct)}
        </div>
      </Card>

      <div className="flex flex-col gap-2.5 mt-3">
        {holdings.length === 0 && (
          <div className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
            ยังไม่มีสินทรัพย์ในพอร์ต กดปุ่ม + เพื่อเพิ่มรายการแรก
          </div>
        )}
        {holdings.map((h) => {
          const value = h.quantity * h.currentPrice;
          const pnl = value - h.quantity * h.avgCost;
          return (
            <Card key={h.id} className="!p-3.5">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-none overflow-hidden"
                  style={{ background: `${ASSET_CLASS_COLOR[h.assetClass]}22` }}
                >
                  <AssetIcon symbol={h.symbol} assetClass={h.assetClass} iconUrl={h.iconUrl} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate flex items-center gap-1.5">
                    {h.symbol}
                    {h.livePrice && (
                      <span
                        className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: "var(--up)22", color: "var(--up)" }}
                      >
                        สด
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] truncate" style={{ color: "var(--muted)" }}>
                    {ASSET_CLASS_LABEL[h.assetClass]} · {h.quantity} หน่วย
                  </div>
                </div>
                <div className="text-right flex-none">
                  <div className="text-sm font-bold">{formatMoney(value)}</div>
                  <div
                    className="text-[11px]"
                    style={{ color: pnl >= 0 ? "var(--up)" : "var(--down)" }}
                  >
                    {formatMoney(pnl)}
                  </div>
                </div>
                <button
                  onClick={() => openEdit(h)}
                  className="flex-none ml-1"
                  style={{ color: "var(--muted)" }}
                >
                  <Icon name="edit" style={{ fontSize: 18 }} />
                </button>
                <button
                  onClick={() => user && deleteHolding(user.uid, h.id)}
                  className="flex-none ml-1"
                  style={{ color: "var(--muted)" }}
                >
                  <Icon name="close" style={{ fontSize: 18 }} />
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? "แก้ไขสินทรัพย์" : "เพิ่มสินทรัพย์ใหม่"}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="text-[11px] -mt-1" style={{ color: "var(--muted)" }}>
            {editingId
              ? "แก้ไขประเภทได้ หากตอนแรกเลือกผิด (เช่น หุ้นต่างประเทศถูกเลือกเป็นหุ้นไทย)"
              : "เพิ่มชื่อสินทรัพย์ก่อน แล้วไปบันทึกจำนวน/ต้นทุนที่หน้า Transaction"}
          </div>

          <FormSelect
            label="ประเภท"
            value={form.assetClass}
            onChange={(e) =>
              setForm({ ...form, assetClass: e.target.value as AssetClass })
            }
          >
            {ASSET_CLASSES.map((c) => (
              <option key={c} value={c}>
                {ASSET_CLASS_LABEL[c]}
              </option>
            ))}
          </FormSelect>

          <div>
            <FormInput
              label="Ticker"
              required
              disabled={!!editingId}
              placeholder="AAPL"
              value={form.symbol}
              onChange={(e) => setForm({ ...form, symbol: e.target.value })}
            />
            {!editingId && (
              <div className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
                เช่น AAPL, BTC, PTT
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-[14px] py-3 font-bold text-center mt-2"
              style={{ background: "var(--surface2)", color: "var(--text)" }}
            >
              ยกเลิก
            </button>
            <SubmitButton disabled={submitting}>
              {submitting
                ? "กำลังบันทึก..."
                : editingId
                  ? "บันทึกการแก้ไข"
                  : "+ เพิ่มสินทรัพย์"}
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
