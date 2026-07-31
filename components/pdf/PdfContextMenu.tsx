"use client";
// components/pdf/PdfContextMenu.tsx
// Right-click context menu for the PDF viewer.
// Appears at pointer position, closes on outside click or Escape.

import React, { useEffect, useRef } from "react";

export interface PdfContextMenuItem {
  label: string;
  icon: string;
  onClick: () => void;
  /** Visual separator rendered ABOVE this item. */
  separator?: boolean;
  /** Dims and disables the item. */
  disabled?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: PdfContextMenuItem[];
  onClose: () => void;
}

export default function PdfContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  // Keep the menu within the viewport.
  const menuW = 200;
  const menuH = items.length * 36 + 12;
  const safeX = Math.min(x, window.innerWidth  - menuW - 8);
  const safeY = Math.min(y, window.innerHeight - menuH - 8);

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: safeX,
        top:  safeY,
        zIndex: 9999,
        width: menuW,
        background: "#0d1b2a",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)",
        padding: "5px 0",
        userSelect: "none",
      }}
    >
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {item.separator && (
            <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "4px 0" }} />
          )}
          <button
            disabled={item.disabled}
            onClick={() => { if (!item.disabled) { item.onClick(); onClose(); } }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              width: "100%",
              padding: "7px 14px",
              background: "transparent",
              border: "none",
              cursor: item.disabled ? "not-allowed" : "pointer",
              color: item.disabled ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.80)",
              fontSize: 12,
              textAlign: "left",
              transition: "background 120ms",
              borderRadius: 6,
            }}
            onMouseEnter={e => { if (!item.disabled) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
            {item.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
