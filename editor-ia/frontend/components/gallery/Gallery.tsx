"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { UploadDropzone } from "@/components/upload/UploadDropzone";
import { api, formatBytes, formatDate, type ImageItem } from "@/lib/api";

export function Gallery() {
  const [images, setImages] = useState<ImageItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setImages(await api.listImages());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar a galeria");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial vinda da API
    load();
  }, [load]);

  async function remove(image: ImageItem) {
    const extra = image.version_count ? ` e as ${image.version_count} versão(ões) editada(s)` : "";
    if (!window.confirm(`Apagar "${image.original_name}"${extra}? Isso não pode ser desfeito.`)) return;
    try {
      await api.deleteImage(image.id);
      setImages((list) => list?.filter((i) => i.id !== image.id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao apagar");
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Galeria</h1>
          <p className="text-sm text-ink-soft">Envie uma foto e abra no editor. O original nunca é alterado.</p>
        </div>
        {images && <span className="text-xs text-ink-faint">{images.length} imagem(ns)</span>}
      </div>

      <UploadDropzone onUploaded={(img) => setImages((list) => [img, ...(list ?? [])])} />

      {error && (
        <div className="mt-6 flex items-center gap-3">
          <Notice>{error}</Notice>
          <Button onClick={load}>Tentar de novo</Button>
        </div>
      )}

      {images && images.length === 0 && !error && (
        <p className="mt-10 text-center text-sm text-ink-faint">Nenhuma imagem ainda.</p>
      )}

      {images && images.length > 0 && (
        <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image) => (
            <li key={image.id} className="group overflow-hidden rounded-xl border border-line bg-panel">
              <Link href={`/editor/${image.id}`} className="block aspect-[4/3] overflow-hidden checker">
                {/* eslint-disable-next-line @next/next/no-img-element -- imagem privada servida pela API local */}
                <img
                  src={api.thumbnailUrl(image.id)}
                  alt={image.original_name}
                  className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
                  loading="lazy"
                />
              </Link>
              <div className="flex items-start justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={image.original_name}>
                    {image.original_name}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {image.width}×{image.height} · {formatBytes(image.size_bytes)}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {formatDate(image.created_at)}
                    {image.version_count > 0 && ` · ${image.version_count} versão(ões)`}
                  </p>
                </div>
                <Button variant="ghost" className="!px-2" aria-label={`Apagar ${image.original_name}`} onClick={() => remove(image)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
