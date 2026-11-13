"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { api, type ImageItem } from "@/lib/api";

type Item = { key: string; name: string; progress: number; error?: string };

const ACCEPT = "image/jpeg,image/png,image/webp";

export function UploadDropzone({ onUploaded }: { onUploaded: (image: ImageItem) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<Item[]>([]);

  const update = (key: string, patch: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function handle(files: FileList | null) {
    if (!files?.length) return;
    const queue = Array.from(files).map((file) => ({ file, key: crypto.randomUUID() }));
    setItems((list) => [...queue.map(({ file, key }) => ({ key, name: file.name, progress: 0 })), ...list]);
    // Um envio por vez: mais previsível num computador local
    for (const { file, key } of queue) {
      try {
        const image = await api.upload(file, (p) => update(key, { progress: p }));
        update(key, { progress: 1 });
        onUploaded(image);
        setTimeout(() => setItems((list) => list.filter((i) => i.key !== key)), 1200);
      } catch (err) {
        update(key, { error: err instanceof Error ? err.message : "Falha no envio" });
      }
    }
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Enviar imagens"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handle(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
          dragging ? "border-accent bg-accent/10" : "border-line bg-panel/60 hover:border-accent/50"
        }`}
      >
        <span className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-panel-3 text-accent">
          <Icon name="upload" size={24} />
        </span>
        <p className="text-xl font-semibold">Arraste e solte suas fotos</p>
        <p className="text-sm text-ink-soft">JPG, PNG ou WEBP · até 30 MB · os arquivos ficam só no seu computador</p>
        <span className="bg-brand mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent-strong/30">
          <Icon name="image" size={16} /> Escolher arquivos
        </span>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          data-testid="file-input"
          onChange={(e) => {
            handle(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {items.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {items.map((i) => (
            <li key={i.key} className="rounded-xl border border-line bg-panel px-3 py-2 text-xs">
              <div className="flex justify-between gap-3">
                <span className="truncate">{i.name}</span>
                <span className={i.error ? "text-danger" : "text-ink-soft"}>
                  {i.error ?? (i.progress >= 1 ? "Pronto" : `${Math.round(i.progress * 100)}%`)}
                </span>
              </div>
              {!i.error && (
                <div className="mt-1.5 h-1 overflow-hidden rounded bg-panel-2">
                  <div className="h-full bg-accent transition-all" style={{ width: `${i.progress * 100}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
