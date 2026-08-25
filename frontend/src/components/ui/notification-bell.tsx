import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Inbox, FileWarning, Repeat2, CheckCheck, ServerCrash, HelpCircle, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlowCard } from "@/components/ui/glow-card";
import { useNotifications, type NotificationKind } from "@/context/NotificationContext";
import { useLanguage } from "@/context/LanguageContext";

const KIND_ICON: Record<NotificationKind, typeof Inbox> = {
  question: Inbox,
  frequent: Repeat2,
  source: FileWarning,
  error: ServerCrash,
  ambiguous: HelpCircle,
  flag: Flag,
};

const KIND_TONE: Record<NotificationKind, string> = {
  question: "text-amber-500 bg-amber-500/10",
  frequent: "text-violet-500 bg-violet-500/10",
  source: "text-red-500 bg-red-500/10",
  error: "text-orange-500 bg-orange-500/10",
  ambiguous: "text-blue-500 bg-blue-500/10",
  flag: "text-rose-500 bg-rose-500/10",
};

export function NotificationBell() {
  const { notifications, unreadCount, isRead, markRead, markAllRead } = useNotifications();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("notif.title")}
        className={cn(
          "relative w-9 h-9 grid place-items-center rounded-full border transition-colors",
          "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-white/10",
          "text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-white/5"
        )}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <>
            <motion.span
              className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-gradient-to-br from-rose-500 to-red-600 text-white text-[10px] font-bold grid place-items-center shadow"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </motion.span>
            <span className="absolute -top-0.5 -right-0.5 w-[17px] h-[17px] rounded-full bg-red-500/50 animate-ping" />
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-[340px] z-50"
          >
          <GlowCard glowColor="purple" className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#18181b] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-white/[0.06]">
              <span className="text-sm font-semibold text-zinc-900 dark:text-white">{t("notif.title")}</span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[11px] text-zinc-500 hover:text-violet-500 flex items-center gap-1 transition-colors"
                >
                  <CheckCheck size={12} /> {t("notif.markAll")}
                </button>
              )}
            </div>

            <div className="max-h-[380px] overflow-y-auto">
              {notifications.length === 0 && (
                <p className="px-4 py-8 text-center text-xs text-zinc-400">{t("notif.empty")}</p>
              )}
              {notifications.map((n) => {
                const Icon = KIND_ICON[n.kind];
                const read = isRead(n.id);
                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      markRead(n.id);
                      setOpen(false);
                      navigate(n.href);
                    }}
                    className={cn(
                      "w-full text-left px-4 py-3 flex gap-3 border-b border-zinc-50 dark:border-white/[0.04] last:border-0 transition-colors",
                      read ? "opacity-55" : "bg-violet-500/[0.04]",
                      "hover:bg-zinc-50 dark:hover:bg-white/[0.05]"
                    )}
                  >
                    <span className={cn("w-7 h-7 rounded-lg grid place-items-center shrink-0 mt-0.5", KIND_TONE[n.kind])}>
                      <Icon size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-white truncate">{n.title}</span>
                        {!read && <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />}
                      </span>
                      <span className="block text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 line-clamp-2">
                        {n.detail}
                      </span>
                      <span className="block text-[10px] text-zinc-400 mt-1">{n.timestamp}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </GlowCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default NotificationBell;
