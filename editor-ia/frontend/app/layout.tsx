import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Editor IA",
  description: "Editor de fotos local com motores de edição plugáveis",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="flex min-h-full flex-col">
        <header className="flex h-12 shrink-0 items-center gap-6 border-b border-line bg-panel px-4">
          <Link href="/" className="text-sm font-semibold tracking-wide">
            Editor<span className="text-accent"> IA</span>
          </Link>
          <nav className="flex gap-4 text-sm text-ink-soft">
            <Link href="/" className="hover:text-ink">
              Galeria
            </Link>
          </nav>
          <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-faint">
            Protótipo local · Fase 1
          </span>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
