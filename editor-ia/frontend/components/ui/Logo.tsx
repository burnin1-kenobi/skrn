import { Icon } from "./Icon";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="bg-brand flex h-8 w-8 items-center justify-center rounded-xl text-white shadow-lg shadow-accent-strong/30">
        <Icon name="logo" size={17} strokeWidth={1.9} />
      </span>
      {!compact && (
        <span className="text-[15px] font-semibold tracking-tight">
          editor<span className="text-accent">.ia</span>
        </span>
      )}
    </span>
  );
}
