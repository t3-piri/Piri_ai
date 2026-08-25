import React, { useState } from "react";
import { cn } from "@/lib/utils";

export function Dock({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-2xl border px-2 py-2 shadow",
        "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-white/10",
        className
      )}
    >
      {children}
    </div>
  );
}

export function DockItem({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      className={cn(
        "relative flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-xl cursor-pointer transition-all duration-200",
        "hover:scale-110 hover:-translate-y-0.5",
        className
      )}
    >
      {children}
      {hover && <div className="absolute -inset-1 -z-10 rounded-xl bg-zinc-100 dark:bg-white/10" />}
    </div>
  );
}

export function DockIcon({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("h-5 w-5", className)}>{children}</div>;
}

export function DockLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-zinc-900 dark:bg-white px-2.5 py-1 text-xs font-medium text-white dark:text-zinc-900 shadow opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
      {children}
    </div>
  );
}
