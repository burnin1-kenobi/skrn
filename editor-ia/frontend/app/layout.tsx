import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Editor IA",
  description: "Editor de fotos local com motores de edição plugáveis",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="flex h-full min-h-0 flex-col">{children}</body>
    </html>
  );
}
