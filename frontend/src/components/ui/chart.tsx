import * as React from "react";
import * as RechartsPrimitive from "recharts";
import { cn } from "@/lib/utils";

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
    color?: string;
  };
};

type ChartContextProps = { config: ChartConfig };
const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const ctx = React.useContext(ChartContext);
  if (!ctx) throw new Error("useChart must be used within a <ChartContainer />");
  return ctx;
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: ChartConfig;
    children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
  }
>(({ className, children, config, ...props }, ref) => {
  return (
    <ChartContext.Provider value={{ config }}>
      <div
        ref={ref}
        className={cn(
          "flex justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-zinc-500 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-zinc-200 dark:[&_.recharts-curve.recharts-tooltip-cursor]:stroke-white/10 [&_.recharts-layer]:outline-none [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
          className
        )}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
});
ChartContainer.displayName = "ChartContainer";

const ChartTooltip = RechartsPrimitive.Tooltip;

type TooltipPayloadItem = {
  name?: React.ReactNode;
  dataKey?: string | number;
  value?: number | string;
  color?: string;
  payload?: { fill?: string; [key: string]: unknown };
};

type ChartTooltipContentProps = React.ComponentProps<"div"> & {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: React.ReactNode;
  hideLabel?: boolean;
  hideIndicator?: boolean;
  nameKey?: string;
  labelKey?: string;
  formatter?: (
    value: number | string,
    name: React.ReactNode,
    item: TooltipPayloadItem,
    index: number,
    payload: unknown
  ) => React.ReactNode;
};

const ChartTooltipContent = React.forwardRef<HTMLDivElement, ChartTooltipContentProps>(
  ({ active, payload, className, hideLabel = false, hideIndicator = false, label, nameKey, labelKey, formatter }, ref) => {
    const { config } = useChart();

    if (!active || !payload?.length) return null;

    const resolveLabel = (key: string) => config[key]?.label ?? key;

    return (
      <div
        ref={ref}
        className={cn(
          "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#18181b] px-2.5 py-1.5 text-xs shadow-xl",
          className
        )}
      >
        {!hideLabel && label != null && (
          <div className="font-medium text-zinc-900 dark:text-white">
            {labelKey ? resolveLabel(labelKey) : String(label)}
          </div>
        )}
        <div className="grid gap-1.5">
          {payload.map((item, index) => {
            const key = String(nameKey || item.name || item.dataKey || "value");
            const itemConfig = config[key];
            const color = item.payload?.fill || item.color;
            return (
              <div key={index} className="flex w-full items-center gap-2">
                {!hideIndicator && (
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
                )}
                <div className="flex flex-1 justify-between items-center leading-none gap-3">
                  {formatter && item.value !== undefined ? (
                    formatter(item.value, item.name, item, index, item.payload)
                  ) : (
                    <>
                      <span className="text-zinc-500">{itemConfig?.label ?? item.name}</span>
                      {item.value !== undefined && (
                        <span className="font-mono font-medium tabular-nums text-zinc-900 dark:text-white">
                          {typeof item.value === "number" ? item.value.toLocaleString("tr-TR") : String(item.value)}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);
ChartTooltipContent.displayName = "ChartTooltipContent";

const ChartLegend = RechartsPrimitive.Legend;

type LegendPayloadItem = { value?: React.ReactNode; dataKey?: string | number; color?: string };

type ChartLegendContentProps = React.ComponentProps<"div"> & {
  payload?: LegendPayloadItem[];
  verticalAlign?: "top" | "bottom";
  nameKey?: string;
};

const ChartLegendContent = React.forwardRef<HTMLDivElement, ChartLegendContentProps>(
  ({ className, payload, verticalAlign = "bottom", nameKey }, ref) => {
    const { config } = useChart();
    if (!payload?.length) return null;

    return (
      <div
        ref={ref}
        className={cn("flex flex-wrap items-center justify-center gap-4", verticalAlign === "top" ? "pb-3" : "pt-3", className)}
      >
        {payload.map((item, i) => {
          const key = String(nameKey || item.dataKey || item.value || "value");
          const itemConfig = config[key];
          return (
            <div key={i} className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
              {itemConfig?.label ?? item.value}
            </div>
          );
        })}
      </div>
    );
  }
);
ChartLegendContent.displayName = "ChartLegendContent";

export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent };
