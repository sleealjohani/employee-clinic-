"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

/**
 * Reveals its children once, when they first enter the viewport.
 *
 * Deliberately one-way: content that has arrived stays arrived, so scrolling
 * back up a record never replays. Anything already on screen at mount is shown
 * immediately, so the first paint is never blank.
 */
export function Reveal({
  children,
  delay = 0,
  shift = 14,
  as: Tag = "div",
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  shift?: number;
  as?: ElementType;
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setRevealed(true);
        observer.disconnect();
      },
      // Start a little before the element is fully in view so it is settled by
      // the time the reader's eye arrives.
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`reveal ${className}`}
      data-revealed={revealed || undefined}
      style={{ "--reveal-delay": `${delay}ms`, "--reveal-shift": `${shift}px` } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}
