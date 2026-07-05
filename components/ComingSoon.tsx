import { Icon } from "@/components/Card";

export function ComingSoon({ title, icon }: { title: string; icon: string }) {
  return (
    <div style={{ animation: "scin 0.3s ease both" }}>
      <div className="text-[26px] font-extrabold tracking-tight mb-4 mt-1">{title}</div>
      <div
        className="flex flex-col items-center justify-center gap-3 py-16 text-center"
        style={{ color: "var(--muted)" }}
      >
        <Icon name={icon} style={{ fontSize: 40 }} />
        <div className="text-sm">ฟีเจอร์นี้กำลังพัฒนา เร็ว ๆ นี้</div>
      </div>
    </div>
  );
}
