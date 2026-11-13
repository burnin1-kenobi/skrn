import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-brand text-white shadow-lg shadow-accent-strong/25 hover:brightness-110 disabled:bg-none disabled:bg-panel-2 disabled:text-ink-faint disabled:shadow-none",
  secondary: "border border-line bg-panel-2 text-ink hover:bg-panel-3 disabled:text-ink-faint",
  ghost: "text-ink-soft hover:bg-panel-2 hover:text-ink disabled:text-ink-faint disabled:hover:bg-transparent",
  danger: "border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-50",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
