"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { api, type ImageItem } from "@/lib/api";

/** Faixa com as outras fotos da galeria, para trocar de imagem sem sair do editor. */
export function Filmstrip({ currentId, onError }: { currentId: string; onError: (msg: string) => void }) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    api.listImages().then(setImages).catch(() => undefined);
  }, []);

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const image = await api.upload(file);
      router.push(`/editor/${image.id}`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Falha no envio");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="scroll-thin flex gap-2.5 overflow-x-auto p-2.5">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={uploading}
        className="flex h-16 w-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-line text-ink-soft hover:border-accent/60 hover:text-ink disabled:opacity-50"
        aria-label="Enviar outra foto"
        title="Enviar outra foto"
      >
        {uploading ? <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> : <Icon name="plus" />}
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => upload(e.target.files)} />
      {images.map((img) => (
        <Link
          key={img.id}
          href={`/editor/${img.id}`}
          title={img.original_name}
          className={`checker h-16 w-24 shrink-0 overflow-hidden rounded-xl ring-2 transition ${img.id === currentId ? "ring-accent" : "ring-transparent opacity-70 hover:opacity-100"}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- miniatura privada da API local */}
          <img src={api.thumbnailUrl(img.id)} alt={img.original_name} className="h-full w-full object-cover" loading="lazy" />
        </Link>
      ))}
    </div>
  );
}
