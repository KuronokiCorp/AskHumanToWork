import { useEffect, useRef, useState, type ReactNode } from 'react';

/** The mockup is authored at this width and scaled down to fit. */
const DESIGN_WIDTH = 896;

/**
 * Renders children at a fixed design width and scales them to the available
 * space, so the mockup's internal proportions never reflow — a browser chrome
 * that re-wraps at small sizes stops reading as a screenshot.
 *
 * The wrapper's height is set from the scaled inner height; without that the
 * transform would leave the original, taller footprint behind and push the
 * page down.
 */
export default function ScaledDashboard({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = outer.current;
    if (!el) return;

    const measure = () => {
      const next = Math.min(1, el.clientWidth / DESIGN_WIDTH);
      setScale(next);
      if (inner.current) setHeight(inner.current.offsetHeight * next);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} style={{ height }} className="overflow-hidden">
      <div
        ref={inner}
        style={{ width: DESIGN_WIDTH, transform: `scale(${scale})`, transformOrigin: 'top left' }}
      >
        {children}
      </div>
    </div>
  );
}
