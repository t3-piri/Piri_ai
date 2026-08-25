import { useState } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "framer-motion";
import { Eye, EyeOff, Loader2, ShieldCheck, ArrowRight } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { ApiError } from "@/lib/api";

/** Kenar boyunca dolasan isik huzmesi. Dort kenar ayni bilesenden, farkli
 *  yon/gecikme ile uretilir. Huzme, durdugu kenarin dik eksenindeki konumu
 *  boyunca kayar (ust kenar soldan saga, sag kenar yukaridan asagiya ...). */
const BEAMS = {
  top: {
    className: "absolute top-0 left-0 h-[2px] w-[50%] bg-gradient-to-r from-transparent via-violet-400 to-transparent",
    axis: "left",
  },
  right: {
    className: "absolute top-0 right-0 w-[2px] h-[50%] bg-gradient-to-b from-transparent via-violet-400 to-transparent",
    axis: "top",
  },
  bottom: {
    className: "absolute bottom-0 right-0 h-[2px] w-[50%] bg-gradient-to-r from-transparent via-violet-400 to-transparent",
    axis: "right",
  },
  left: {
    className: "absolute bottom-0 left-0 w-[2px] h-[50%] bg-gradient-to-b from-transparent via-violet-400 to-transparent",
    axis: "bottom",
  },
} as const;

function TravelingBeam({ edge, delay }: { edge: keyof typeof BEAMS; delay: number }) {
  const { className, axis } = BEAMS[edge];

  return (
    <motion.div
      className={className}
      initial={{ filter: "blur(2px)", opacity: 0.4 }}
      animate={{
        [axis]: ["-50%", "100%"],
        opacity: [0.25, 0.7, 0.25],
        filter: ["blur(1px)", "blur(2.5px)", "blur(1px)"],
      }}
      transition={{
        [axis]: { duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 1, delay },
        opacity: { duration: 1.2, repeat: Infinity, repeatType: "mirror", delay },
        filter: { duration: 1.5, repeat: Infinity, repeatType: "mirror", delay },
      }}
    />
  );
}

export function Component({ onSuccess }: { onSuccess?: () => void }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { login } = useAuth();
  const { t } = useLanguage();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<"user" | "pass" | null>(null);

  // 3B egilme: fare kart merkezine gore olculur, donus aciklarina cevrilir.
  // Genis bir giris araligi (±500px) tepkiyi yumusatir - ayni piksel hareketi
  // daha kucuk bir aciya karsilik gelir. Yay (spring) fizigi, fare karttan
  // ayrildiginda sifira ani bir sicrama yerine yumusak bir donus saglar.
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateXRaw = useTransform(mouseY, [-500, 500], [8, -8]);
  const rotateYRaw = useTransform(mouseX, [-500, 500], [-8, 8]);
  const springConfig = { stiffness: 120, damping: 18, mass: 0.6 };
  const rotateX = useSpring(rotateXRaw, springConfig);
  const rotateY = useSpring(rotateYRaw, springConfig);

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left - rect.width / 2);
    mouseY.set(e.clientY - rect.top - rect.height / 2);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), pass, remember);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("login.genericError"));
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (active: boolean) =>
    "w-full h-10 rounded-xl px-3.5 text-sm outline-none transition-all duration-300 " +
    (isDark
      ? `bg-white/[0.06] border placeholder:text-zinc-500 text-white ${active ? "border-violet-500/60 bg-white/[0.09]" : "border-white/10"}`
      : `bg-zinc-50 border placeholder:text-zinc-400 text-zinc-900 ${active ? "border-violet-400 bg-white" : "border-zinc-200"}`);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="w-full max-w-[380px] relative"
      style={{ perspective: 1500 }}
    >
      {/* arka plan parlamalari */}
      <motion.div
        className="absolute -inset-16 -z-10 rounded-full bg-violet-500/20 blur-[80px] pointer-events-none"
        animate={{ opacity: [0.25, 0.5, 0.25], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: 7, repeat: Infinity, repeatType: "mirror" }}
      />
      <motion.div
        className="absolute -inset-10 -z-10 rounded-full bg-indigo-500/15 blur-[60px] pointer-events-none"
        animate={{ opacity: [0.4, 0.2, 0.4], scale: [1.05, 0.95, 1.05] }}
        transition={{ duration: 5, repeat: Infinity, repeatType: "mirror", delay: 1 }}
      />

      <motion.div
        className="relative group"
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* nefes alan kenar parlamasi */}
        <motion.div
          className="absolute -inset-[1px] rounded-[21px] pointer-events-none"
          animate={{
            boxShadow: [
              "0 0 12px 2px rgba(124,58,237,0.10)",
              "0 0 22px 6px rgba(124,58,237,0.22)",
              "0 0 12px 2px rgba(124,58,237,0.10)",
            ],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", repeatType: "mirror" }}
        />

        {/* kenarlarda dolasan isik huzmeleri */}
        <div className="absolute -inset-[1px] rounded-[21px] overflow-hidden pointer-events-none">
          <TravelingBeam edge="top" delay={0} />
          <TravelingBeam edge="right" delay={0.6} />
          <TravelingBeam edge="bottom" delay={1.2} />
          <TravelingBeam edge="left" delay={1.8} />
        </div>

        <div
          className={
            "w-full rounded-[20px] overflow-hidden relative " +
            (isDark
              ? "bg-[#1a1a1d] border border-white/[0.06] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_20px_60px_rgba(0,0,0,0.5)]"
              : "bg-white border border-zinc-200 shadow-[0_20px_60px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.8)]")
          }
          style={{ fontFamily: "Inter, system-ui, sans-serif" }}
        >
          {/* ince ic desen */}
          <div
            className="absolute inset-0 opacity-[0.025] pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(135deg, currentColor 0.5px, transparent 0.5px), linear-gradient(45deg, currentColor 0.5px, transparent 0.5px)",
              backgroundSize: "28px 28px",
            }}
          />
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />

          <div className="p-7 pb-6 relative">
            <div className="flex items-center gap-2 mb-6">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", duration: 0.7 }}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white relative overflow-hidden"
              >
                <ShieldCheck size={16} />
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
              </motion.div>
              <span className={"text-[13px] font-semibold tracking-widest uppercase " + (isDark ? "text-zinc-400" : "text-zinc-500")}>
                {t("login.badge")}
              </span>
              <span className="ml-auto text-[11px] px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                {t("login.safe")}
              </span>
            </div>

            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className={"text-[22px] font-semibold leading-none tracking-tight " + (isDark ? "text-white" : "text-zinc-900")}
            >
              {t("login.title")}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="text-[13px] mt-2 leading-5 text-zinc-500"
            >
              {t("login.subtitle")}
            </motion.p>

            <form onSubmit={submit} className="mt-6 space-y-3.5">
              <motion.div whileHover={{ scale: 1.01 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
                <label className={"text-[12px] font-medium " + (isDark ? "text-zinc-300" : "text-zinc-700")}>
                  {t("login.username")}
                </label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocused("user")}
                  onBlur={() => setFocused(null)}
                  placeholder={t("login.usernamePlaceholder")}
                  type="text"
                  autoComplete="username"
                  required
                  className={"mt-1.5 " + inputClass(focused === "user")}
                />
              </motion.div>

              <motion.div whileHover={{ scale: 1.01 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
                <label className={"text-[12px] font-medium " + (isDark ? "text-zinc-300" : "text-zinc-700")}>
                  {t("login.password")}
                </label>
                <div className="relative mt-1.5">
                  <input
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    onFocus={() => setFocused("pass")}
                    onBlur={() => setFocused(null)}
                    placeholder="••••••••"
                    type={show ? "text" : "password"}
                    required
                    className={inputClass(focused === "pass") + " pr-10"}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className={
                      "absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-lg transition-colors " +
                      (isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-900")
                    }
                  >
                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </motion.div>

              <label className="flex items-center gap-2 pt-1 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-300 dark:border-white/15 bg-white dark:bg-white/10 accent-violet-600"
                />
                <span className={"text-xs " + (isDark ? "text-zinc-400" : "text-zinc-600")}>{t("login.remember")}</span>
              </label>

              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-xs text-red-500 -mt-1"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <motion.button
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                type="submit"
                disabled={loading}
                className="w-full relative group/button mt-1 disabled:opacity-70"
              >
                <div className="absolute inset-0 bg-violet-500/25 rounded-xl blur-lg opacity-0 group-hover/button:opacity-100 transition-opacity duration-300" />
                <div className="relative overflow-hidden h-10 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex items-center justify-center gap-2 text-sm font-medium">
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/25 to-white/0"
                    animate={{ x: ["-100%", "100%"] }}
                    transition={{ duration: 1.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 1 }}
                    style={{ opacity: loading ? 1 : 0, transition: "opacity 0.3s ease" }}
                  />
                  <AnimatePresence mode="wait">
                    {loading ? (
                      <motion.span
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2"
                      >
                        <Loader2 size={16} className="animate-spin" />
                        {t("login.submitting")}
                      </motion.span>
                    ) : (
                      <motion.span
                        key="idle"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-1.5"
                      >
                        {t("login.submit")}
                        <ArrowRight size={14} className="group-hover/button:translate-x-1 transition-transform duration-300" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </motion.button>

              <p className={"text-center text-[11px] mt-2 " + (isDark ? "text-zinc-600" : "text-zinc-400")}>
                {t("login.footer")}
              </p>
            </form>
          </div>

          <div
            className={
              "px-7 py-3 flex items-center justify-center gap-1.5 text-[11px] border-t " +
              (isDark ? "bg-white/[0.02] border-white/5 text-zinc-500" : "bg-zinc-50 border-zinc-100 text-zinc-500")
            }
          >
            <ShieldCheck size={12} /> {t("login.secure")}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default Component;
