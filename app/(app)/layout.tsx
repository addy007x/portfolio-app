"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--bg)", color: "var(--muted)" }}
      >
        กำลังโหลด...
      </div>
    );
  }

  return (
    <div
      className="min-h-screen mx-auto flex flex-col"
      style={{ background: "var(--bg)", maxWidth: 480 }}
    >
      <div className="flex-1 overflow-y-auto px-4 pt-4" style={{ paddingBottom: 96 }}>
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
