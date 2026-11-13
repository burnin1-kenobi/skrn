"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

export type Rect = { x: number; y: number; w: number; h: number };
export type DrawMode = null | "region" | "crop";
export type CompareMode = "off" | "split" | "hold";

export type ViewportHandle = { zoomIn: () => void; zoomOut: () => void; fit: () => void; actualSize: () => void };

type Props = {
  src: string | null;
  compareSrc: string | null;
  compareMode: CompareMode;
  width: number;
  height: number;
  drawMode: DrawMode;
  /** Retângulo a desenhar por cima (região ou recorte), em coordenadas 0..1 */
  overlay: (Rect & { shape: "rect" | "ellipse" }) | null;
  /** Proporção (largura/altura em pixels) imposta ao desenhar o recorte */
  aspect: number | null;
  loading: boolean;
  onDraw: (rect: Rect) => void;
  onZoomChange?: (zoom: number) => void;
};

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 32;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const Viewport = forwardRef<ViewportHandle, Props>(function Viewport(
  { src, compareSrc, compareMode, width, height, drawMode, overlay, aspect, loading, onDraw, onZoomChange },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // `scale` = pixels de tela por pixel da imagem; null = ajustar à tela
  const [view, setView] = useState<{ scale: number | null; panX: number; panY: number }>({ scale: null, panX: 0, panY: 0 });
  const [draft, setDraft] = useState<Rect | null>(null);
  const [split, setSplit] = useState(0.5);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const drag = useRef<
    | { kind: "pan"; startX: number; startY: number; panX: number; panY: number }
    | { kind: "draw"; x0: number; y0: number }
    | { kind: "split" }
    | null
  >(null);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Quando o tamanho da imagem muda (ex.: recorte aplicado), volta a ajustar à tela
  useEffect(() => {
    setView({ scale: null, panX: 0, panY: 0 });
  }, [width, height]);

  const fitScale = width && height && size.w && size.h ? Math.min((size.w - 48) / width, (size.h - 48) / height) : 1;
  const scale = view.scale ?? fitScale;
  const boxW = width * scale;
  const boxH = height * scale;
  const left = (size.w - boxW) / 2 + view.panX;
  const top = (size.h - boxH) / 2 + view.panY;

  useEffect(() => {
    onZoomChange?.(scale);
  }, [scale, onZoomChange]);

  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      setView((v) => {
        const current = v.scale ?? fitScale;
        const next = clamp(current * factor, Math.min(MIN_ZOOM, fitScale), MAX_ZOOM);
        const l = (size.w - width * current) / 2 + v.panX;
        const t = (size.h - height * current) / 2 + v.panY;
        const u = (cx - l) / current;
        const w = (cy - t) / current;
        return {
          scale: next,
          panX: cx - u * next - (size.w - width * next) / 2,
          panY: cy - w * next - (size.h - height * next) / 2,
        };
      });
    },
    [fitScale, size.w, size.h, width, height],
  );

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => zoomAt(1.25, size.w / 2, size.h / 2),
      zoomOut: () => zoomAt(1 / 1.25, size.w / 2, size.h / 2),
      fit: () => setView({ scale: null, panX: 0, panY: 0 }),
      actualSize: () => setView({ scale: 1, panX: 0, panY: 0 }),
    }),
    [zoomAt, size.w, size.h],
  );

  // Roda do mouse = zoom no ponto do cursor (listener nativo para poder impedir a rolagem da página)
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Segurar a barra de espaço = mover a imagem mesmo com uma ferramenta de seleção ativa
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && (t as HTMLInputElement).type !== "range";
    const down = (e: KeyboardEvent) => e.code === "Space" && !isTyping(e.target) && (e.preventDefault(), setSpaceHeld(true));
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpaceHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const toImage = (clientX: number, clientY: number) => {
    const r = container.current!.getBoundingClientRect();
    return { x: clamp((clientX - r.left - left) / boxW, 0, 1), y: clamp((clientY - r.top - top) / boxH, 0, 1) };
  };

  const rectFrom = (x0: number, y0: number, x1: number, y1: number): Rect => {
    let w = Math.abs(x1 - x0);
    let h = Math.abs(y1 - y0);
    if (aspect) {
      // Mantém a proporção em pixels: (w*width)/(h*height) = aspect
      const hFromW = (w * width) / (height * aspect);
      if (hFromW > h) h = hFromW;
      else w = (h * height * aspect) / width;
      const maxW = x1 >= x0 ? 1 - x0 : x0;
      const maxH = y1 >= y0 ? 1 - y0 : y0;
      const k = Math.min(1, maxW / w || 1, maxH / h || 1);
      w *= k;
      h *= k;
    }
    const x = x1 >= x0 ? x0 : x0 - w;
    const y = y1 >= y0 ? y0 : y0 - h;
    return { x: clamp(x, 0, 1), y: clamp(y, 0, 1), w: Math.min(w, 1 - clamp(x, 0, 1)), h: Math.min(h, 1 - clamp(y, 0, 1)) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    const panning = !drawMode || spaceHeld || e.button === 1;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (panning) {
      drag.current = { kind: "pan", startX: e.clientX, startY: e.clientY, panX: view.panX, panY: view.panY };
    } else {
      const p = toImage(e.clientX, e.clientY);
      drag.current = { kind: "draw", x0: p.x, y0: p.y };
      setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "pan") {
      setView((v) => ({ scale: v.scale ?? fitScale, panX: d.panX + e.clientX - d.startX, panY: d.panY + e.clientY - d.startY }));
    } else if (d.kind === "draw") {
      const p = toImage(e.clientX, e.clientY);
      setDraft(rectFrom(d.x0, d.y0, p.x, p.y));
    } else if (d.kind === "split") {
      const r = container.current!.getBoundingClientRect();
      setSplit(clamp((e.clientX - r.left - left) / boxW, 0, 1));
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "draw" && draft) {
      // Ignora cliques sem arrastar (menos de ~1% da imagem)
      if (draft.w * boxW > 6 && draft.h * boxH > 6) onDraw(draft);
      setDraft(null);
    }
  };

  const shown = draft ? { ...draft, shape: overlay?.shape ?? "rect" } : overlay;
  const cursor = drag.current?.kind === "pan" ? "grabbing" : drawMode && !spaceHeld ? "crosshair" : "grab";
  const showCompare = compareSrc && compareMode !== "off";

  return (
    <div
      ref={container}
      className="relative h-full w-full touch-none select-none overflow-hidden bg-canvas"
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="viewport"
    >
      {src && width > 0 && (
        <div className="checker absolute shadow-2xl shadow-black/50" style={{ left, top, width: boxW, height: boxH }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- prévia gerada localmente (blob) */}
          <img src={compareMode === "hold" && compareSrc ? compareSrc : src} alt="Prévia da edição" draggable={false} className="absolute inset-0 h-full w-full" style={{ imageRendering: scale > 2 ? "pixelated" : "auto" }} />

          {showCompare && compareMode === "split" && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- prévia do original */}
              <img
                src={compareSrc}
                alt="Original"
                draggable={false}
                className="absolute inset-0 h-full w-full"
                style={{ clipPath: `inset(0 ${(1 - split) * 100}% 0 0)` }}
              />
              <div className="absolute inset-y-0 w-px bg-white/90" style={{ left: `${split * 100}%` }} />
              <button
                type="button"
                aria-label="Arrastar para comparar"
                className="absolute top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-white text-xs font-bold text-black shadow"
                style={{ left: `${split * 100}%` }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  container.current?.setPointerCapture(e.pointerId);
                  drag.current = { kind: "split" };
                }}
              >
                ⇆
              </button>
              <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px]">Antes</span>
              <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px]">Depois</span>
            </>
          )}
          {compareMode === "hold" && (
            <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px]">Original</span>
          )}

          {shown && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
              {drawMode === "crop" && (
                <path
                  fillRule="evenodd"
                  fill="rgba(0,0,0,0.55)"
                  d={`M0 0H1V1H0Z M${shown.x} ${shown.y}H${shown.x + shown.w}V${shown.y + shown.h}H${shown.x}Z`}
                />
              )}
              {shown.shape === "ellipse" ? (
                <ellipse
                  cx={shown.x + shown.w / 2}
                  cy={shown.y + shown.h / 2}
                  rx={shown.w / 2}
                  ry={shown.h / 2}
                  fill="none"
                  stroke="white"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  vectorEffect="non-scaling-stroke"
                />
              ) : (
                <rect x={shown.x} y={shown.y} width={shown.w} height={shown.h} fill="none" stroke="white" strokeWidth={1.5} strokeDasharray={drawMode === "crop" ? undefined : "5 4"} vectorEffect="non-scaling-stroke" />
              )}
            </svg>
          )}
        </div>
      )}

      {loading && (
        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-2.5 py-1 text-xs text-ink-soft">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Processando…
        </div>
      )}
    </div>
  );
});
