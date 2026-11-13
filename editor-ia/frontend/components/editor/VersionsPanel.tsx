"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { api, formatDate, type Version } from "@/lib/api";

const STATUS: Record<Version["status"], { label: string; cls: string }> = {
  pending: { label: "Na fila", cls: "text-warn" },
  processing: { label: "Processando", cls: "text-warn" },
  completed: { label: "Pronta", cls: "text-ok" },
  failed: { label: "Falhou", cls: "text-danger" },
};

type Format = "jpeg" | "png" | "webp";

export function VersionsPanel({
  versions,
  activeId,
  onOpen,
  onDelete,
}: {
  versions: Version[];
  activeId: string | null;
  onOpen: (v: Version) => void;
  onDelete: (v: Version) => void;
}) {
  const [format, setFormat] = useState<Format>("jpeg");
  const [quality, setQuality] = useState(92);
  const [maxSide, setMaxSide] = useState(0);

  if (!versions.length) {
    return <p className="text-xs text-ink-faint">Nenhuma versão salva. Edite e clique em “Salvar versão”.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5 text-xs">
        <label className="col-span-1">
          <span className="mb-0.5 block text-ink-faint">Formato</span>
          <select value={format} onChange={(e) => setFormat(e.target.value as Format)} className="w-full rounded-lg border border-line bg-panel-2 px-1.5 py-1">
            <option value="jpeg">JPG</option>
            <option value="png">PNG</option>
            <option value="webp">WEBP</option>
          </select>
        </label>
        <label>
          <span className="mb-0.5 block text-ink-faint">Qualidade</span>
          <select value={quality} disabled={format === "png"} onChange={(e) => setQuality(Number(e.target.value))} className="w-full rounded-lg border border-line bg-panel-2 px-1.5 py-1 disabled:opacity-50">
            {[100, 95, 92, 85, 75].map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-0.5 block text-ink-faint">Tamanho</span>
          <select value={maxSide} onChange={(e) => setMaxSide(Number(e.target.value))} className="w-full rounded-lg border border-line bg-panel-2 px-1.5 py-1">
            <option value={0}>Original</option>
            <option value={4096}>4096 px</option>
            <option value={2048}>2048 px</option>
            <option value={1080}>1080 px</option>
          </select>
        </label>
      </div>

      <ul className="space-y-2">
        {versions.map((v, i) => {
          const s = STATUS[v.status];
          const ready = v.status === "completed";
          return (
            <li key={v.id} className={`rounded-xl border p-2.5 ${v.id === activeId ? "border-accent/60 bg-accent/5" : "border-line"}`}>
              <div className="flex gap-2">
                <div className="checker h-14 w-14 shrink-0 overflow-hidden rounded">
                  {ready && (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura privada da API local
                    <img src={api.versionThumbnailUrl(v.id)} alt="" className="h-full w-full object-contain" />
                  )}
                </div>
                <div className="min-w-0 flex-1 text-xs">
                  <p className="font-medium">Versão {versions.length - i}</p>
                  <p className={s.cls}>
                    {s.label}
                    {ready && v.width ? <span className="text-ink-faint"> · {v.width}×{v.height}</span> : null}
                  </p>
                  <p className="text-ink-faint">{formatDate(v.created_at)} · {v.operations.length} edição(ões)</p>
                </div>
              </div>
              {v.error && <p className="mt-1 text-[11px] text-danger">{v.error}</p>}
              <div className="mt-2 flex gap-1">
                <Button className="flex-1 !py-1 text-xs" onClick={() => onOpen(v)} title="Carrega as edições desta versão para continuar editando">
                  Abrir
                </Button>
                <a
                  href={ready ? api.exportUrl(v.id, format, quality, maxSide || undefined) : undefined}
                  aria-disabled={!ready}
                  className={`inline-flex flex-1 items-center justify-center rounded-lg px-2 py-1 text-xs font-medium ${
                    ready ? "bg-brand text-white hover:brightness-110" : "pointer-events-none bg-panel-2 text-ink-faint"
                  }`}
                >
                  Exportar
                </a>
                <Button variant="ghost" className="!px-2 !py-1 text-xs" disabled={!ready && v.status !== "failed"} onClick={() => onDelete(v)} aria-label="Apagar versão">
                  ✕
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
