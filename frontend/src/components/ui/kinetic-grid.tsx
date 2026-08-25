"use client";
import { useEffect, useRef } from "react";
import { useTheme } from "@/components/theme-provider";

type Ripple = { x: number; y: number; t: number };

export default function KineticGrid({ children }: { children?: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = window.innerWidth;
    let h = window.innerHeight;
    let raf = 0;
    let mouseX = w * 0.5;
    let mouseY = h * 0.5;
    let targetX = mouseX;
    let targetY = mouseY;
    let hasMouse = false;
    const ripples: Ripple[] = [];
    let start = performance.now();

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: MouseEvent) => {
      hasMouse = true;
      targetX = e.clientX;
      targetY = e.clientY;
    };
    const onTouch = (e: TouchEvent) => {
      if (e.touches[0]) {
        hasMouse = true;
        targetX = e.touches[0].clientX;
        targetY = e.touches[0].clientY;
      }
    };
    const onClick = (e: MouseEvent) => {
      ripples.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (ripples.length > 6) ripples.shift();
    };
    const onTouchClick = (e: TouchEvent) => {
      if (e.touches[0]) {
        ripples.push({ x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() });
        if (ripples.length > 6) ripples.shift();
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("click", onClick);
    window.addEventListener("touchstart", onTouchClick, { passive: true } as any);

    // grid params
    const gap = 28;
    const dotR = isDark ? 1.45 : 1.35;
    const warpRadius = 170;
    const warpStrength = 22;
    const rippleSpeed = 360; // px/s
    const rippleBand = 28;

    const draw = () => {
      const now = performance.now();
      const elapsed = (now - start) / 1000;

      // ease mouse
      mouseX += (targetX - mouseX) * 0.12;
      mouseY += (targetY - mouseY) * 0.12;

      // background — Piri palette: lacivert header, açık gri-mavi body
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = isDark ? "#0a1930" : "#eef2f7";
      ctx.fillRect(0, 0, w, h);

      // header band (top 88px navy) + hero (next ~200px) to match screenshot depth
      const headerH = 64;
      const heroH = 220;
      const headerGrad = ctx.createLinearGradient(0, 0, 0, headerH + heroH);
      if (isDark) {
        headerGrad.addColorStop(0, "rgba(10,30,58,0.98)");
        headerGrad.addColorStop(0.35, "rgba(15,36,66,0.9)");
        headerGrad.addColorStop(1, "rgba(10,30,58,0)");
      } else {
        headerGrad.addColorStop(0, "#0e2442");
        headerGrad.addColorStop(0.5, "#132f56");
        headerGrad.addColorStop(1, "rgba(14,36,66,0)");
      }
      ctx.fillStyle = headerGrad;
      ctx.fillRect(0, 0, w, headerH + heroH);

      // subtle stars in header
      if (Math.random() < 0.5) { /* keep canvas clean, stars via CSS */ }

      // vignette
      const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.95);
      if (isDark) {
        vg.addColorStop(0, "rgba(255,255,255,0.015)");
        vg.addColorStop(1, "rgba(0,0,0,0.35)");
      } else {
        vg.addColorStop(0, "rgba(255,255,255,0)");
        vg.addColorStop(1, "rgba(15,36,66,0.04)");
      }
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);

      // clean old ripples
      for (let i = ripples.length - 1; i >= 0; i--) {
        const age = (now - ripples[i].t) / 1000;
        if (age * rippleSpeed > 420) ripples.splice(i, 1);
      }

      // draw dots
      const cols = Math.ceil(w / gap) + 1;
      const rows = Math.ceil(h / gap) + 1;
      // offset to center
      const offX = (w % gap) / 2;
      const offY = (h % gap) / 2;

      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const bx = gx * gap + offX;
          const by = gy * gap + offY;

          let ox = 0;
          let oy = 0;
          let extraAlpha = 0;
          let scale = 1;

          if (hasMouse) {
            const dx = mouseX - bx;
            const dy = mouseY - by;
            const d = Math.hypot(dx, dy);
            if (d < warpRadius && d > 0.1) {
              const k = Math.pow(1 - d / warpRadius, 1.6);
              const pull = k * warpStrength;
              ox += (dx / d) * pull;
              oy += (dy / d) * pull;
              extraAlpha += k * 0.42;
              scale += k * 0.35;
            }
          }

          // ripple influence
          for (const rp of ripples) {
            const rdx = bx - rp.x;
            const rdy = by - rp.y;
            const d = Math.hypot(rdx, rdy);
            const age = (now - rp.t) / 1000;
            const rad = age * rippleSpeed;
            const dist = Math.abs(d - rad);
            if (dist < rippleBand && d > 0.1) {
              const k = (1 - dist / rippleBand) * Math.max(0, 1 - age * 0.9);
              // push outward along radial direction
              ox += (rdx / d) * k * 18;
              oy += (rdy / d) * k * 18;
              extraAlpha += k * 0.5;
              scale += k * 0.45;
            }
            // inner fade for dots inside ripple
            if (d < rad - rippleBand) {
              extraAlpha += 0.06 * (1 - age * 0.7);
            }
          }

          // idle subtle wave
          const wave = Math.sin(bx * 0.008 + elapsed * 0.7) * 0.3 + Math.cos(by * 0.008 - elapsed * 0.5) * 0.3;
          // apply tiny idle jitter
          ox += wave * 0.4;
          oy += wave * 0.4;

          const x = bx + ox;
          const y = by + oy;

          // Piri: lacivert nokta + kırmızı accent
          const baseA = isDark ? 0.14 : 0.11;
          // header bölgesinde nokta daha silik
          const inHeader = by < 280;
          const headerFade = inHeader ? 0.45 : 1;
          const a = Math.min(0.9, (baseA + extraAlpha) * headerFade);

          let r = 30, g = 58, b = 95; // #1e3a5f
          if (isDark) { r = 180; g = 200; b = 230; }

          if (hasMouse) {
            const dx = mouseX - bx;
            const dy = mouseY - by;
            const d = Math.hypot(dx, dy);
            if (d < warpRadius * 0.6) {
              const k = (1 - d / (warpRadius * 0.6));
              if (isDark) {
                r = Math.round(180 + k * 75);
                g = Math.round(200 - k * 40);
                b = Math.round(230 - k * 20);
              } else {
                // lacivert → kırmızıya doğru
                r = Math.round(30 + k * 190); // -> 220
                g = Math.round(58 - k * 35); // -> 23
                b = Math.round(95 - k * 55); // -> 40
              }
            }
          }

          ctx.beginPath();
          const rr = dotR * scale;
          ctx.arc(x, y, rr, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
          ctx.fill();

          // glow kaldırıldı — keskin nokta, bulanık halo yok
          // if (extraAlpha > 0.22) { ... } kaldırıldı
        }
      }

      // center hint ring on click? already via ripple

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("click", onClick);
      window.removeEventListener("touchstart", onTouchClick);
    };
  }, [isDark]);

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 block" />
      {children && <div className="relative z-10">{children}</div>}
    </div>
  );
}
