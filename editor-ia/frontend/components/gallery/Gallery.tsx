"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
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

  const recent = images?.slice(0, 6) ?? [];

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-panel/80 px-4 py-5 backdrop-blur md:flex">
        <Logo />
        <p className="mb-2 mt-8 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Espaço de trabalho</p>
        <nav className="space-y-1 text-sm">
          <span className="flex items-center gap-3 rounded-xl bg-accent/15 px-3 py-2 text-ink">
            <Icon name="grid" size={17} /> Minhas imagens
          </span>
        </nav>
        {recent.length > 0 && (
          <>
            <p className="mb-2 mt-8 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Recentes</p>
            <ul className="space-y-0.5 text-sm">
              {recent.map((i) => (
                <li key={i.id}>
                  <Link href={`/editor/${i.id}`} className="flex items-center gap-3 rounded-xl px-3 py-1.5 text-ink-soft hover:bg-panel-2 hover:text-ink">
                    <Icon name="image" size={16} className="shrink-0" />
                    <span className="truncate">{i.original_name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-auto rounded-2xl border border-line bg-panel-2 p-3 text-xs text-ink-soft">
          <p className="flex items-center gap-2 font-medium text-ink">
            <Icon name="shield" size={15} className="text-accent" /> 100% local
          </p>
          <p className="mt-1 leading-relaxed">As fotos ficam só neste computador. Protótipo da Fase 1, sem login.</p>
        </div>
      </aside>

      <main className="scroll-thin min-w-0 flex-1 overflow-y-auto">
        <header className="flex items-center justify-between border-b border-line px-6 py-4 md:px-10">
          <div className="md:hidden">
            <Logo />
          </div>
          <h1 className="hidden text-lg font-semibold md:block">Nova edição</h1>
          {images && <span className="text-xs text-ink-faint">{images.length} imagem(ns)</span>}
        </header>

        <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10">
          <UploadDropzone onUploaded={(img) => setImages((list) => [img, ...(list ?? [])])} />

          {error && (
            <div className="mt-6 flex items-center gap-3">
              <Notice>{error}</Notice>
              <Button onClick={load}>Tentar de novo</Button>
            </div>
          )}

          <h2 className="mb-4 mt-10 text-base font-semibold">Suas imagens</h2>
          {images && images.length === 0 && !error && (
            <p className="rounded-2xl border border-line bg-panel/60 py-10 text-center text-sm text-ink-faint">Nenhuma imagem ainda. Envie a primeira acima.</p>
          )}

          {images && images.length > 0 && (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {images.map((image) => (
                <li key={image.id} className="group card overflow-hidden transition-colors hover:border-accent/50">
                  <Link href={`/editor/${image.id}`} className="checker relative block aspect-[4/3] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element -- imagem privada servida pela API local */}
                    <img src={api.thumbnailUrl(image.id)} alt={image.original_name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" loading="lazy" />
                    <span className="absolute inset-x-0 bottom-0 flex translate-y-2 items-center justify-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent pb-3 pt-8 text-xs font-medium opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                      <Icon name="sliders" size={14} /> Abrir no editor
                    </span>
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
                    <Button variant="ghost" className="!rounded-lg !px-2 !py-1.5" aria-label={`Apagar ${image.original_name}`} onClick={() => remove(image)}>
                      <Icon name="trash" size={16} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
