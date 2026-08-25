"use client";

import { useEffect, useRef, useState } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * Counts to a value once the figure is on screen.
 *
 * Every headline figure in this system is a count of something a person has to
 * act on, so the number itself is the content: it resolves quickly, never
 * loops, and starts only when the reader can actually see it. The accessible
 * name is always the final value — assistive technology never reads the ticks.
 */
export function CountUp({
  value,
  duration = 820,
  suffix = "",
  className = "",
}: {
  value: number;
  duration?: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const frame = useRef<number | null>(null);
  const started = useRef(false);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduced = typeof matchMedia === "function" && matchMedia(REDUCED).matches;
    if (reduced || value === 0 || typeof IntersectionObserver === "undefined") {
      setDisplay(value);
      return;
    }

    setDisplay(0);
    started.current = false;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || started.current) return;
      started.current = true;
      observer.disconnect();

      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        // Same decelerating shape as the CSS entrance curve.
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(Math.round(value * eased));
        if (progress < 1) frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    });

    observer.observe(node);
    return () => {
      observer.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={`num ${className}`} aria-label={`${value}${suffix}`}>
      {display.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}
