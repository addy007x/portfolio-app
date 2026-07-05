"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function SignupPage() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signUp(name, email, password);
      router.replace("/dashboard");
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (code === "auth/email-already-in-use") {
        setError("อีเมลนี้ถูกใช้งานแล้ว");
      } else if (code === "auth/weak-password") {
        setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      } else {
        setError("สมัครสมาชิกไม่สำเร็จ กรุณาลองอีกครั้ง");
      }
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
        <div className="text-2xl font-extrabold mb-1">สมัครสมาชิก</div>
        <div className="text-sm mb-6" style={{ color: "var(--muted)" }}>
          เริ่มติดตามพอร์ตการลงทุนฟรี
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            required
            placeholder="ชื่อ"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-[14px] px-4 py-3 text-sm outline-none"
            style={{ background: "var(--surface2)", color: "var(--text)" }}
          />
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
            minLength={6}
            placeholder="รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)"
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
            {busy ? "กำลังสมัคร..." : "สมัครสมาชิก"}
          </button>
        </form>
        <div className="text-sm mt-5 text-center" style={{ color: "var(--muted)" }}>
          มีบัญชีอยู่แล้ว?{" "}
          <Link href="/login" style={{ color: "var(--accent)" }}>
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    </div>
  );
}
