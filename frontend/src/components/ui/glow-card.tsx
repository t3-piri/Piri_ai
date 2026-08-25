import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type GlowColor = "blue" | "purple" | "green" | "red" | "orange" | "cyan";

const GLOW_HUES: Record<GlowColor, { base: number; spread: number }> = {
  blue: { base: 220, spread: 200 },
  purple: { base: 280, spread: 300 },
  green: { base: 140, spread: 200 },
  red: { base: 0, spread: 200 },
  orange: { base: 30, spread: 200 },
  cyan: { base: 190, spread: 200 },
};

// Isaretci konumu tum kartlar icin ortak: her kart ayri bir dinleyici
// kurmak yerine kok elemandaki CSS degiskenlerini okur.
let pointerListenerCount = 0;
let detachPointerListener: (() => void) | null = null;

function attachPointerTracking() {
  pointerListenerCount += 1;
  if (detachPointerListener) return;

  const sync = (e: PointerEvent) => {
    const root = document.documentElement;
    root.style.setProperty("--glow-x", e.clientX.toFixed(2));
    root.style.setProperty("--glow-xp", (e.clientX / window.innerWidth).toFixed(3));
    root.style.setProperty("--glow-y", e.clientY.toFixed(2));
    root.style.setProperty("--glow-yp", (e.clientY / window.innerHeight).toFixed(3));
  };

  document.addEventListener("pointermove", sync, { passive: true });
  detachPointerListener = () => document.removeEventListener("pointermove", sync);
}

function releasePointerTracking() {
  pointerListenerCount -= 1;
  if (pointerListenerCount <= 0) {
    pointerListenerCount = 0;
    detachPointerListener?.();
    detachPointerListener = null;
  }
}

export function GlowCard({
  children,
  className,
  glowColor = "purple",
  style,
}: {
  children: ReactNode;
  className?: string;
  glowColor?: GlowColor;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    attachPointerTracking();
    return releasePointerTracking;
  }, []);

  const { base, spread } = GLOW_HUES[glowColor];

  const vars = {
    "--base": base,
    "--spread": spread,
    "--border-size": "1px",
    "--spotlight-size": "420px",
    "--hue": "calc(var(--base) + (var(--glow-xp, 0.5) * var(--spread)))",
  } as CSSProperties;

  return (
    <div
      ref={ref}
      data-glow
      style={{ ...vars, ...style }}
      className={cn("relative rounded-xl", className)}
    >
      {children}
    </div>
  );
}

/** Kart kenarindaki isaretci-takipli parlamayi ureten global stil. Bir kez
 *  monte edilir; her GlowCard yalnizca kendi renk degiskenlerini tasir. */
export function GlowCardStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
[data-glow] { position: relative; }
[data-glow]::before,
[data-glow]::after {
  pointer-events: none;
  content: "";
  position: absolute;
  inset: calc(var(--border-size) * -1);
  border: var(--border-size) solid transparent;
  border-radius: inherit;
  background-attachment: fixed;
  background-size: calc(100% + (2 * var(--border-size))) calc(100% + (2 * var(--border-size)));
  background-repeat: no-repeat;
  background-position: 50% 50%;
  -webkit-mask: linear-gradient(transparent, transparent), linear-gradient(white, white);
  mask: linear-gradient(transparent, transparent), linear-gradient(white, white);
  -webkit-mask-clip: padding-box, border-box;
  mask-clip: padding-box, border-box;
  -webkit-mask-composite: xor;
  mask-composite: intersect;
  opacity: 0;
  transition: opacity 260ms ease;
}
[data-glow]::before {
  background-image: radial-gradient(
    calc(var(--spotlight-size) * 0.75) calc(var(--spotlight-size) * 0.75) at
    calc(var(--glow-x, 0) * 1px) calc(var(--glow-y, 0) * 1px),
    hsl(var(--hue, 280) 90% 62% / 0.9), transparent 100%
  );
  filter: brightness(1.4);
}
[data-glow]::after {
  background-image: radial-gradient(
    calc(var(--spotlight-size) * 0.4) calc(var(--spotlight-size) * 0.4) at
    calc(var(--glow-x, 0) * 1px) calc(var(--glow-y, 0) * 1px),
    hsl(0 0% 100% / 0.55), transparent 100%
  );
}
[data-glow]::before { opacity: 0.85; }
[data-glow]:hover::before { opacity: 1; }
[data-glow]:hover::after { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  [data-glow]::before, [data-glow]::after { transition: none; }
}
`,
      }}
    />
  );
}

export default GlowCard;
