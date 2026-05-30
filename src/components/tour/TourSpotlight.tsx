import { useEffect, useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { TourState } from "@/hooks/use-tour";
import { TOURS } from "@/lib/tours";
import type { TourId } from "@/lib/tours";

interface Props extends TourState {
  tourId: TourId;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8; // spotlight padding around the target element
const HEADER_H = 56; // approx sticky header height to avoid
const NAV_H = 64; // approx bottom nav height to avoid

export default function TourSpotlight({ tourId, step, total, anchor, next, prev, skip, finish }: Props) {
  const { t } = useTranslation();
  const def = TOURS[tourId];
  const currentStep = def.steps[step];
  const isLast = step === total - 1;

  const [rect, setRect] = useState<Rect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  const updateRect = useCallback(() => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [anchor]);

  // Scroll target into view accounting for sticky header + bottom nav.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const viewH = window.innerHeight;
    const inView = r.top >= HEADER_H && r.bottom <= viewH - NAV_H;
    if (!inView) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    // Compute rect after a brief delay to let scroll settle.
    const id = setTimeout(updateRect, 350);
    return () => clearTimeout(id);
  }, [anchor, updateRect]);

  // Keep rect in sync with scroll / resize.
  useEffect(() => {
    updateRect();
    const onUpdate = () => {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(updateRect);
    };
    window.addEventListener("scroll", onUpdate, { passive: true, capture: true });
    window.addEventListener("resize", onUpdate, { passive: true });
    const ro = new ResizeObserver(onUpdate);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("scroll", onUpdate, { capture: true });
      window.removeEventListener("resize", onUpdate);
      ro.disconnect();
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [updateRect]);

  // Esc = skip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") skip(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [skip]);

  // Focus trap: keep focus inside the tooltip.
  useEffect(() => {
    tooltipRef.current?.focus();
  }, [step]);

  if (!rect) return null;

  const spotTop = rect.top - PAD;
  const spotLeft = rect.left - PAD;
  const spotW = rect.width + PAD * 2;
  const spotH = rect.height + PAD * 2;

  // Decide tooltip placement.
  const placement = currentStep.placement ?? "auto";
  const spaceBelow = window.innerHeight - (rect.bottom + PAD) - NAV_H;
  const spaceAbove = rect.top - PAD - HEADER_H;
  const showBelow = placement === "bottom" || (placement === "auto" && spaceBelow >= 160) || spaceAbove < 160;

  return createPortal(
    <div
      className="fixed inset-0 z-[200]"
      aria-modal="true"
      role="dialog"
      aria-label={t(currentStep.titleKey)}
    >
      {/* Dark overlay with cutout via clip-path polygons */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ display: "block" }}
      >
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={spotLeft}
              y={spotTop}
              width={spotW}
              height={spotH}
              rx={10}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.55)"
          mask="url(#tour-mask)"
        />
      </svg>

      {/* Highlight border around target */}
      <div
        className="absolute rounded-[10px] ring-2 ring-primary pointer-events-none"
        style={{ top: spotTop, left: spotLeft, width: spotW, height: spotH }}
      />

      {/* Click-through blocker on backdrop (skip on backdrop tap) */}
      <div className="absolute inset-0" onClick={skip} aria-hidden />

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        tabIndex={-1}
        className="absolute outline-none bg-card border border-border rounded-2xl shadow-soft p-4 mx-3"
        style={(() => {
          const tooltipW = Math.min(window.innerWidth - 24, 340);
          const rawLeft = spotLeft;
          const left = Math.max(12, Math.min(rawLeft, window.innerWidth - tooltipW - 12));
          return {
            left,
            width: tooltipW,
            ...(showBelow
              ? { top: spotTop + spotH + 10 }
              : { bottom: window.innerHeight - spotTop + 10 }),
          };
        })()}
        onClick={(e) => e.stopPropagation()}
        aria-live="polite"
      >
        {/* Step dots */}
        <div className="flex items-center gap-1.5 mb-3">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? "w-4 bg-primary" : "w-1.5 bg-border"}`}
            />
          ))}
        </div>

        <p className="font-semibold text-sm text-foreground mb-1">{t(currentStep.titleKey)}</p>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4 whitespace-pre-line">{t(currentStep.bodyKey)}</p>

        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={skip} className="text-muted-foreground">
            {t("tour.common.skip")}
          </Button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={prev}>
                {t("tour.common.prev")}
              </Button>
            )}
            <Button type="button" size="sm" onClick={isLast ? finish : next}>
              {isLast ? t("tour.common.finish") : t("tour.common.next")}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
