"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { watchHoldings } from "@/lib/firestore";
import { usePortfolios } from "@/lib/portfolioContext";
import type { Holding } from "@/lib/types";
import { Card, Icon } from "@/components/Card";
import { Modal, FormInput, SubmitButton } from "@/components/Modal";

export default function PortfoliosPage() {
  const { user } = useAuth();
  const { portfolios, currentPortfolioId, defaultPortfolioId, setCurrentPortfolioId, createPortfolio, removePortfolio } =
    usePortfolios();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return watchHoldings(user.uid, setHoldings);
  }, [user]);

  function countFor(portfolioId: string) {
    return holdings.filter((h) => (h.portfolioId ?? defaultPortfolioId) === portfolioId).length;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await createPortfolio(name.trim());
      setName("");
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    if (countFor(id) > 0) {
      setError("ลบพอร์ตนี้ไม่ได้ ยังมีสินทรัพย์อยู่ ย้ายหรือลบสินทรัพย์ทั้งหมดก่อน");
      return;
    }
    const result = await removePortfolio(id);
    if (!result.ok) setError(result.reason ?? "ลบไม่สำเร็จ");
  }

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="flex justify-between items-start mb-4 mt-1">
        <div className="text-[26px] font-extrabold tracking-tight">แยกพอร์ต</div>
        <button
          onClick={() => setOpen(true)}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "var(--accent)" }}
        >
          <Icon name="add" style={{ fontSize: 22, color: "#04120c" }} />
        </button>
      </div>

      <div className="text-[11px] mb-3" style={{ color: "var(--muted)" }}>
        แตะเพื่อสลับพอร์ตที่ใช้งานอยู่ — Dashboard, Portfolio และ Transaction จะแสดงเฉพาะพอร์ตที่เลือก
      </div>

      {error && (
        <div
          className="text-xs rounded-[10px] px-3 py-2 mb-3"
          style={{ background: "var(--down)22", color: "var(--down)" }}
        >
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {portfolios.map((p) => {
          const active = p.id === currentPortfolioId;
          const count = countFor(p.id);
          return (
            <Card key={p.id} className="!p-3.5">
              <div className="flex items-center gap-3">
                <button
                  className="flex-1 flex items-center gap-3 text-left"
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
                      {count} สินทรัพย์
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
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

      <Modal open={open} onClose={() => setOpen(false)} title="สร้างพอร์ตใหม่">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <FormInput
            label="ชื่อพอร์ต"
            required
            placeholder="เช่น พอร์ตเกษียณ"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <SubmitButton disabled={submitting}>
            {submitting ? "กำลังบันทึก..." : "สร้างพอร์ต"}
          </SubmitButton>
        </form>
      </Modal>
    </div>
  );
}
