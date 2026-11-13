"use client";

import type { ParamSpec } from "@/lib/api";

function decimals(step?: number) {
  if (!step || step >= 1) return 0;
  return Math.min(3, Math.ceil(-Math.log10(step)));
}

export function ParamControl({
  spec,
  value,
  onChange,
}: {
  spec: ParamSpec;
  value: number | boolean | string;
  onChange: (value: number | boolean | string) => void;
}) {
  const id = `param-${spec.id}`;

  if (spec.type === "bool") {
    return (
      <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3 py-1 text-sm">
        <span>{spec.label}</span>
        <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
      </label>
    );
  }

  if (spec.type === "choice") {
    return (
      <div className="py-1">
        <p className="mb-1.5 text-sm">{spec.label}</p>
        <div role="radiogroup" aria-label={spec.label} className="grid grid-cols-4 gap-1">
          {spec.options?.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={value === o.value}
              onClick={() => onChange(o.value)}
              className={`rounded-md border px-1 py-1 text-xs ${
                value === o.value ? "border-accent bg-accent/15 text-ink" : "border-line text-ink-soft hover:border-ink-faint"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const num = Number(value);
  const changed = num !== spec.default;
  return (
    <div className="py-1">
      <div className="mb-0.5 flex items-baseline justify-between gap-2 text-sm">
        <label htmlFor={id} title={spec.help}>
          {spec.label}
        </label>
        <button
          type="button"
          onClick={() => onChange(spec.default)}
          title="Voltar ao padrão"
          className={`font-mono text-xs tabular-nums ${changed ? "text-accent hover:underline" : "text-ink-faint"}`}
        >
          {num > 0 && spec.min !== undefined && spec.min < 0 ? "+" : ""}
          {num.toFixed(decimals(spec.step))}
        </button>
      </div>
      <input
        id={id}
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step ?? (spec.type === "int" ? 1 : 0.01)}
        value={num}
        onChange={(e) => onChange(spec.type === "int" ? parseInt(e.target.value, 10) : parseFloat(e.target.value))}
        onDoubleClick={() => onChange(spec.default)}
        className="w-full"
      />
      {spec.help && <p className="text-[11px] leading-tight text-ink-faint">{spec.help}</p>}
    </div>
  );
}
