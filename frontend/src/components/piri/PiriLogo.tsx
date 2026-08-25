import { Compass } from "lucide-react";

export function PiriLogo({ light = true }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-xl bg-[#dc2626] grid place-items-center shadow-[0_4px_12px_rgba(220,38,38,0.35)] shrink-0">
        <Compass size={18} className="text-white" strokeWidth={2} />
      </div>
      <div className="leading-none">
        <div className={`font-extrabold tracking-[-0.02em] text-[20px] ${light ? "text-white" : "text-[#0e2442]"}`}>
          PİRİ
        </div>
        <div className={`text-[10px] tracking-[0.14em] font-semibold -mt-0.5 ${light ? "text-[#8bb0d6]" : "text-[#5a7aa5]"}`}>
          YARIŞMACI DESTEK ASİSTANI
        </div>
      </div>
    </div>
  );
}
