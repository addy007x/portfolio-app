"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(email, password);
      router.replace("/dashboard");
    } catch {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <div className="w-full max-w-sm">
        <div className="text-2xl font-extrabold mb-1">เข้าสู่ระบบ</div>
        <div className="text-sm mb-6" style={{ color: "var(--muted)" }}>
          ติดตามพอร์ตการลงทุนของคุณ
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="อีเมล"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-[14px] px-4 py-3 text-sm outline-none"
            style={{ background: "var(--surface2)", color: "var(--text)" }}
          />
          <input
            type="password"
            required
            placeholder="รหัสผ่าน"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-[14px] px-4 py-3 text-sm outline-none"
            style={{ background: "var(--surface2)", color: "var(--text)" }}
          />
          {error && (
            <div className="text-sm" style={{ color: "var(--down)" }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-[14px] py-3 font-bold text-center mt-2"
            style={{ background: "var(--accent)", color: "#04120c" }}
          >
            {busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
        <div className="text-sm mt-5 text-center" style={{ color: "var(--muted)" }}>
          ยังไม่มีบัญชี?{" "}
          <Link href="/signup" style={{ color: "var(--accent)" }}>
            สมัครสมาชิก
          </Link>
        </div>
      </div>
    </div>
  );
}
