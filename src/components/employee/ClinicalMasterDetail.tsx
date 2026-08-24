"use client";

import { Children, useEffect, useMemo, useState, type ReactNode } from "react";
import styles from "./ClinicalMasterDetail.module.css";

type Tone = "accent" | "info" | "ok" | "warn" | "danger" | "neutral";

export type MasterDetailItem = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  tone?: Tone;
  badges?: Array<{ label: string; tone: Tone }>;
};

export function ClinicalMasterDetail({
  items,
  children,
  searchPlaceholder,
  emptyLabel,
}: {
  items: MasterDetailItem[];
  children: ReactNode;
  searchPlaceholder: string;
  emptyLabel: string;
}) {
  const panels = Children.toArray(children);
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0]?.id ?? "");
    }
  }, [items, selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.title, item.subtitle, item.meta, ...(item.badges?.map((badge) => badge.label) ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(q),
    );
  }, [items, query]);

  const selectedIndex = Math.max(0, items.findIndex((item) => item.id === selectedId));
  const selectedPanel = panels[selectedIndex] ?? null;

  function moveSelection(direction: -1 | 1) {
    if (filtered.length === 0) return;
    const current = filtered.findIndex((item) => item.id === selectedId);
    const base = current >= 0 ? current : 0;
    const next = (base + direction + filtered.length) % filtered.length;
    setSelectedId(filtered[next].id);
  }

  return (
    <section className={styles.workspace}>
      <div className={`${styles.master} glass`}>
        <div className={styles.searchWrap}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
            <path d="m20 20-3.7-3.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveSelection(1);
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                moveSelection(-1);
              }
            }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
          <span className={`${styles.resultCount} num`}>{filtered.length}</span>
        </div>

        <div className={styles.list} role="listbox" aria-label={searchPlaceholder}>
          {filtered.length === 0 ? (
            <div className={styles.empty}>{emptyLabel}</div>
          ) : (
            filtered.map((item) => {
              const selected = item.id === selectedId;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={styles.item}
                  data-selected={selected}
                  data-tone={item.tone ?? "neutral"}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className={styles.itemRail} aria-hidden />
                  <span className={styles.itemBody}>
                    <span className={styles.itemTop}>
                      <strong>{item.title}</strong>
                      {item.meta && <small className="num">{item.meta}</small>}
                    </span>
                    {item.subtitle && <span className={styles.subtitle}>{item.subtitle}</span>}
                    {item.badges && item.badges.length > 0 && (
                      <span className={styles.badges}>
                        {item.badges.map((badge, index) => (
                          <span key={`${badge.label}-${index}`} data-tone={badge.tone}>
                            {badge.label}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <svg className={styles.chevron} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className={`${styles.detail} glass-strong`}>
        {selectedPanel ? (
          <div key={selectedId} className={styles.detailMotion}>
            {selectedPanel}
          </div>
        ) : (
          <div className={styles.empty}>{emptyLabel}</div>
        )}
      </div>
    </section>
  );
}
