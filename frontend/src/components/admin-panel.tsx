import { useState } from "react";
import { BorderBeam } from "@/components/ui/border-beam";
import { useTheme } from "@/components/theme-provider";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { Search, Plus, Trash2, Edit3, Users, BarChart3, Settings, Activity } from "lucide-react";

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <BorderBeam
      size="line"
      colorVariant="colorful"
      duration={3.1}
      borderRadius={20}
      theme={isDark ? "dark" : "light"}
      className="w-full max-w-[520px]"
    >
      <div
        className="w-full h-[42px] rounded-[20px] overflow-hidden relative flex items-center gap-2.5 px-3.5"
        style={{
          background: isDark ? "#1d1d1d" : "#ffffff",
          boxShadow: isDark
            ? "inset 0 0 0 1px rgba(44,47,54,0.52), inset 0 0 50px 0 rgba(255,255,255,0.02)"
            : "inset 0 0 0 1px rgba(0,0,0,0.08), 0 2px 10px rgba(0,0,0,0.05)",
        }}
      >
        <Search size={18} className={isDark ? "text-white/40" : "text-zinc-400"} />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ara... kullanıcı, ürün, sipariş"
          className={
            "flex-1 bg-transparent outline-none text-sm placeholder:text-zinc-500 " +
            (isDark ? "text-white" : "text-zinc-900")
          }
        />
        {value && (
          <button
            onClick={() => onChange("")}
            className="text-xs px-2 py-1 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
          >
            Temizle
          </button>
        )}
      </div>
    </BorderBeam>
  );
}

const MOCK = [
  { id: 1, name: "Elif Yılmaz", role: "Admin", status: "Aktif", last: "2 dk önce" },
  { id: 2, name: "Can Demir", role: "Editör", status: "Aktif", last: "1 saat önce" },
  { id: 3, name: "Ayşe Kaya", role: "Üye", status: "Beklemede", last: "3 gün önce" },
  { id: 4, name: "Mehmet Öz", role: "Üye", status: "Aktif", last: "5 dk önce" },
];

export function AdminPanel() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(MOCK);

  const filtered = rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="w-full max-w-[980px] mx-auto flex flex-col gap-5">
      {/* search + actions - orijinal SearchBar yapısı korunuyor */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
        <SearchBar value={q} onChange={setQ} />
        <div className="flex gap-2">
          <HoverBorderGradient containerClassName="rounded-full" className="bg-violet-600 text-white dark:bg-violet-600 dark:text-white px-4 py-2 gap-2">
            <Plus size={16} /> Yeni ekle
          </HoverBorderGradient>
          <HoverBorderGradient containerClassName="rounded-full" className="bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-100 px-4 py-2">
            Dışa aktar
          </HoverBorderGradient>
        </div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Toplam kullanıcı", value: "1,284", icon: Users, delta: "+12%" },
          { label: "Aktif oturum", value: "342", icon: Activity, delta: "+5%" },
          { label: "Ciro", value: "₺89.4k", icon: BarChart3, delta: "+8%" },
          { label: "Bekleyen", value: "23", icon: Settings, delta: "-2%" },
        ].map((s) => (
          <div
            key={s.label}
            className={
              "rounded-2xl p-4 border " +
              (isDark ? "bg-zinc-900 border-white/10" : "bg-white border-zinc-200 shadow-sm")
            }
          >
            <div className="flex items-center justify-between">
              <s.icon size={16} className={isDark ? "text-zinc-400" : "text-zinc-500"} />
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/20">
                {s.delta}
              </span>
            </div>
            <div className={"text-xl font-semibold mt-3 " + (isDark ? "text-white" : "text-zinc-900")}>{s.value}</div>
            <div className="text-xs text-zinc-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div
        className={
          "rounded-2xl overflow-hidden border " +
          (isDark ? "bg-zinc-900 border-white/10" : "bg-white border-zinc-200 shadow-sm")
        }
      >
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className={isDark ? "bg-white/[0.04] text-zinc-400" : "bg-zinc-50 text-zinc-500"}>
              <tr className="text-left text-xs">
                <th className="px-4 py-3 font-medium">Kullanıcı</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Durum</th>
                <th className="px-4 py-3 font-medium">Son işlem</th>
                <th className="px-4 py-3 font-medium text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody className={"divide-y " + (isDark ? "divide-white/5" : "divide-zinc-100")}>
              {filtered.map((r) => (
                <tr key={r.id} className={isDark ? "hover:bg-white/[0.03]" : "hover:bg-zinc-50"}>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 grid place-items-center text-white text-xs font-semibold">
                        {r.name.split(" ").map((w) => w[0]).join("")}
                      </div>
                      <span className={isDark ? "text-white font-medium" : "text-zinc-900 font-medium"}>{r.name}</span>
                    </div>
                  </td>
                  <td className={"px-4 py-3.5 " + (isDark ? "text-zinc-300" : "text-zinc-600")}>{r.role}</td>
                  <td className="px-4 py-3.5">
                    <span
                      className={
                        "text-xs px-2 py-1 rounded-full border font-medium " +
                        (r.status === "Aktif"
                          ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/20"
                          : "bg-amber-500/15 text-amber-600 border-amber-500/20")
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-zinc-500 text-xs">{r.last}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex justify-end gap-1">
                      <button className="w-7 h-7 grid place-items-center rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500">
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}
                        className="w-7 h-7 grid place-items-center rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-zinc-500 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-zinc-500">
                    Sonuç bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
