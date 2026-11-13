"use client";

import { useEffect, useState } from "react";

type Bins = { r: number[]; g: number[]; b: number[]; l: number[] };

const BINS = 64;

/** Calcula o histograma no navegador, a partir da prévia já carregada. */
function compute(src: string): Promise<Bins> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 256 / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return reject(new Error("sem canvas"));
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      const bins: Bins = { r: Array(BINS).fill(0), g: Array(BINS).fill(0), b: Array(BINS).fill(0), l: Array(BINS).fill(0) };
      const k = BINS / 256;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 8) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        bins.r[(r * k) | 0]++;
        bins.g[(g * k) | 0]++;
        bins.b[(b * k) | 0]++;
        bins.l[((0.2126 * r + 0.7152 * g + 0.0722 * b) * k) | 0]++;
      }
      resolve(bins);
    };
    img.onerror = () => reject(new Error("imagem"));
    img.src = src;
  });
}

function area(values: number[], max: number) {
  const step = 100 / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(2)},${(40 - (Math.sqrt(v / max) * 38)).toFixed(2)}`);
  return `M0,40 L${pts.join(" L")} L100,40 Z`;
}

export function Histogram({ src }: { src: string | null }) {
  const [bins, setBins] = useState<Bins | null>(null);

  useEffect(() => {
    if (!src) return;
    let alive = true;
    compute(src).then((b) => alive && setBins(b)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [src]);

  if (!bins) return <div className="h-20 rounded-xl bg-panel-2" />;
  // Ignora as pontas (preto/branco puros) para escala não achatar o resto
  const max = Math.max(1, ...[bins.r, bins.g, bins.b].flatMap((c) => c.slice(1, -1)));
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-20 w-full rounded-xl bg-panel-2" role="img" aria-label="Histograma da imagem">
      <g style={{ mixBlendMode: "screen" }}>
        <path d={area(bins.r, max)} fill="rgb(255 80 110 / 0.55)" />
        <path d={area(bins.g, max)} fill="rgb(80 220 140 / 0.5)" />
        <path d={area(bins.b, max)} fill="rgb(90 130 255 / 0.6)" />
      </g>
      <path d={area(bins.l, max)} fill="none" stroke="rgb(255 255 255 / 0.5)" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
