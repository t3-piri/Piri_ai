import React, { useEffect, useRef } from 'react';
import { useTheme } from '@/components/theme-provider';

export default function TubesCursor({ children }: { children?: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<any>(null);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const randomColors = (count: number) => {
    return new Array(count)
      .fill(0)
      .map(() => "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'));
  };

  useEffect(() => {
    const initTimer = setTimeout(() => {
      import('https://cdn.jsdelivr.net/npm/threejs-components@0.0.19/build/cursors/tubes1.min.js' as any)
        .then((module: any) => {
          const Tubes = module.default;
          if (canvasRef.current) {
            const isLight = !isDark;
            const app = Tubes(canvasRef.current, {
              tubes: {
                colors: isLight ? ["#2a3a9c", "#5a2ea6", "#b91c3a"] : ["#5e72e4", "#8965e0", "#f5365c"],
                lights: {
                  intensity: isLight ? 110 : 200,
                  colors: isLight ? ["#0284c7", "#9333ea", "#ca8a04", "#0891b2"] : ["#21d4fd", "#b721ff", "#f4d03f", "#11cdef"]
                }
              }
            });
            appRef.current = app;
            // Light temada renderer'ı açık yap — siyah temizlemeyi kaldır
            try {
              if (isLight) {
                const r = (app as any).renderer || (app as any)._renderer || (app as any).tubes?.renderer || (app as any).app?.renderer;
                if (r?.setClearColor) {
                  r.setClearColor(0xeef2f7, 1);
                  // transparent değil, açık gri-mavi
                }
                const s = (app as any).scene || (app as any)._scene || (app as any).tubes?.scene;
                if (s) {
                  // @ts-ignore - three Color may not be imported, set to null to keep transparent
                  if (s.background) s.background = null;
                }
                if (canvasRef.current) {
                  canvasRef.current.style.background = "#eef2f7";
                  canvasRef.current.style.opacity = "1";
                }
              } else {
                if (canvasRef.current) canvasRef.current.style.background = "transparent";
              }
            } catch {}
          }
        })
        .catch((err: any) => console.error("Failed to load TubesCursor module:", err));
    }, 100);

    return () => {
      clearTimeout(initTimer);
      if (appRef.current && typeof appRef.current.dispose === 'function') {
        try { appRef.current.dispose(); } catch {}
        appRef.current = null;
      }
    };
  }, [isDark]);

  const handleClick = () => {
    if (appRef.current) {
      const newTubeColors = randomColors(3);
      const newLightColors = randomColors(4);
      appRef.current.tubes.setColors(newTubeColors);
      appRef.current.tubes.setLightsColors(newLightColors);
    }
  };

  const bgClass = isDark ? "bg-black" : "bg-[#f1f5f9]";
  const canvasFilter = isDark ? "none" : "invert(1) brightness(1.08) contrast(0.92) saturate(0.85)";
  // açık temada canvas'ı açmak için invert + parlaklık — threejs siyah zemin açık griye döner, tüpler koyu lacivert/kırmızı kalır
  const handleClickCapture = () => {
    if (appRef.current) {
      const newTubeColors = randomColors(3);
      const newLightColors = randomColors(4);
      appRef.current.tubes.setColors(newTubeColors);
      appRef.current.tubes.setLightsColors(newLightColors);
    }
  };

  if (children) {
    return (
      <div onClick={handleClick} className={`fixed inset-0 -z-10 overflow-hidden ${bgClass} cursor-pointer`}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" style={{ display: 'block', filter: canvasFilter }} />
        <div className="relative z-10 w-full h-full pointer-events-none">
          <div className="pointer-events-auto w-full h-full">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div onClick={handleClickCapture} className={`fixed inset-0 -z-10 overflow-hidden ${bgClass} cursor-pointer`}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" style={{ filter: canvasFilter }} />
      {/* açık temada ek açık overlay — tüplerin arasında açık zemin hissi */}
      {!isDark && <div className="absolute inset-0 bg-[#f1f5f9]/35 pointer-events-none" />}
    </div>
  );
}
