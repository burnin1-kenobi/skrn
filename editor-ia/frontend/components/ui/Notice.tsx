export function Notice({ tone = "danger", children }: { tone?: "danger" | "warn"; children: React.ReactNode }) {
  const color = tone === "danger" ? "border-danger/40 bg-danger/10 text-danger" : "border-warn/40 bg-warn/10 text-warn";
  return (
    <div role="alert" className={`rounded-md border px-3 py-2 text-sm ${color}`}>
      {children}
    </div>
  );
}
