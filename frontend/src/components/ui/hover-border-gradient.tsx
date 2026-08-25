import React, { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  containerClassName?: string;
  className?: string;
  as?: React.ElementType;
} & React.ButtonHTMLAttributes<HTMLButtonElement> &
  React.HTMLAttributes<HTMLDivElement>;

export function HoverBorderGradient({
  children,
  containerClassName,
  className,
  as: Tag = "button",
  ...props
}: Props) {
  const [hovered, setHovered] = useState(false);
  const [direction] = useState<"TOP" | "LEFT" | "BOTTOM" | "RIGHT">("TOP");

  return (
    <div
      className={cn(
        "relative p-[1px] rounded-full overflow-hidden group",
        containerClassName
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* animated border gradient */}
      <div
        className={cn(
          "absolute inset-0 rounded-full transition-opacity duration-300",
          hovered ? "opacity-100" : "opacity-70"
        )}
        style={{
          background:
            "conic-gradient(from 0deg at 50% 50%, #ff4d6d 0deg, #7c3aed 60deg, #06b6d4 120deg, #22c55e 180deg, #f59e0b 240deg, #ef4444 300deg, #ff4d6d 360deg)",
          filter: "saturate(1.1)",
        }}
      >
        <div className={cn("absolute inset-0 rounded-full animate-spin", hovered ? "opacity-100" : "opacity-60")} style={{ animationDuration: "2.2s" }} />
      </div>
      {/* moving highlight */}
      <div
        className="absolute inset-0 rounded-full opacity-60"
        style={{
          background: `radial-gradient(400px circle at ${direction === "TOP" ? "50% 0%" : direction === "BOTTOM" ? "50% 100%" : direction === "LEFT" ? "0% 50%" : "100% 50%"}, rgba(255,255,255,0.9), transparent 40%)`,
        }}
      />
      <Tag
        className={cn(
          "relative flex items-center justify-center rounded-full bg-white dark:bg-zinc-950 px-5 py-2.5 text-sm font-medium backdrop-blur",
          "border border-transparent",
          className
        )}
        {...(props as any)}
      >
        {children}
      </Tag>
    </div>
  );
}

export default HoverBorderGradient;
