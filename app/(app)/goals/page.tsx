"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { watchGoals, addGoal, updateGoal, deleteGoal } from "@/lib/firestore";
import type { Goal } from "@/lib/types";
import { Card, Icon } from "@/components/Card";
import { Modal, FormInput, SubmitButton } from "@/components/Modal";
import { formatBaht } from "@/lib/format";

export default function GoalsPage() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    targetAmount: "",
    currentAmount: "",
    targetDate: "",
  });

  useEffect(() => {
    if (!user) return;
    return watchGoals(user.uid, setGoals);
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    await addGoal(user.uid, {
      name: form.name,
      targetAmount: parseFloat(form.targetAmount) || 0,
      currentAmount: parseFloat(form.currentAmount) || 0,
      targetDate: form.targetDate || undefined,
      icon: "flag",
    });
    setForm({ name: "", targetAmount: "", currentAmount: "", targetDate: "" });
    setOpen(false);
  }

  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="flex justify-between items-start mb-4 mt-1">
        <div className="text-[26px] font-extrabold tracking-tight">เป้าหมาย</div>
        <button
          onClick={() => setOpen(true)}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "var(--accent)" }}
        >
          <Icon name="add" style={{ fontSize: 22, color: "#04120c" }} />
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        {goals.length === 0 && (
          <div className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
            ยังไม่มีเป้าหมาย กดปุ่ม + เพื่อสร้างเป้าหมายใหม่
          </div>
        )}
        {goals.map((g) => {
          const pct = g.targetAmount > 0 ? Math.min(100, (g.currentAmount / g.targetAmount) * 100) : 0;
          return (
            <Card key={g.id}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-sm font-bold">{g.name}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
                    {formatBaht(g.currentAmount)} / {formatBaht(g.targetAmount)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-extrabold" style={{ color: "var(--accent)" }}>
                    {pct.toFixed(0)}%
                  </div>
                  <button
                    onClick={() => user && deleteGoal(user.uid, g.id)}
                    style={{ color: "var(--muted)" }}
                  >
                    <Icon name="close" style={{ fontSize: 18 }} />
                  </button>
                </div>
              </div>
              <div
                className="h-2 rounded-[6px] mt-3.5 overflow-hidden"
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
              <button
                className="text-xs mt-3 font-semibold"
                style={{ color: "var(--accent)" }}
                onClick={() => {
                  const amt = prompt("เพิ่มเงินสะสมเข้าเป้าหมาย (บาท):");
                  if (amt && user) {
                    const val = parseFloat(amt);
                    if (!Number.isNaN(val)) {
                      updateGoal(user.uid, g.id, { currentAmount: g.currentAmount + val });
                    }
                  }
                }}
              >
                + เพิ่มเงินสะสม
              </button>
            </Card>
          );
        })}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="สร้างเป้าหมายใหม่">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <FormInput
            label="ชื่อเป้าหมาย"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <FormInput
            label="เป้าหมาย (บาท)"
            type="number"
            step="any"
            required
            value={form.targetAmount}
            onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
          />
          <FormInput
            label="เงินสะสมปัจจุบัน (บาท)"
            type="number"
            step="any"
            value={form.currentAmount}
            onChange={(e) => setForm({ ...form, currentAmount: e.target.value })}
          />
          <FormInput
            label="วันที่คาดว่าจะถึงเป้าหมาย (ไม่บังคับ)"
            type="date"
            value={form.targetDate}
            onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
          />
          <SubmitButton>สร้างเป้าหมาย</SubmitButton>
        </form>
      </Modal>
    </div>
  );
}
