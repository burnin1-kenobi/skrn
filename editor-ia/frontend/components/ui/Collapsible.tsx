"use client";

import { useState } from "react";
import { Icon } from "./Icon";

export function Collapsible({ title, defaultOpen = true, children, aside }: { title: string; defaultOpen?: boolean; children: React.ReactNode; aside?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line/70 last:border-b-0">
      <div className="flex items-center gap-2 py-3">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex flex-1 items-center justify-between text-left text-sm font-medium">
          {title}
          <Icon name="chevron" size={16} className={`text-ink-faint transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {aside}
      </div>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}
