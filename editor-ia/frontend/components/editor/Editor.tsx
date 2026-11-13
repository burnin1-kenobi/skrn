"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { useHistory } from "@/hooks/useHistory";
import {
  api,
  defaultParams,
  isDefault,
  type ImageDetail,
  type OperationInfo,
  type ParamValues,
  type Region,
  type Step,
  type Version,
} from "@/lib/api";
import { ParamControl } from "./ParamControl";
import { VersionsPanel } from "./VersionsPanel";
import { Viewport, type CompareMode, type Rect, type ViewportHandle } from "./Viewport";

type Preview = { url: string; width: number; height: number };

const CROP_ASPECTS: { label: string; value: number | null | "original" }[] = [
  { label: "Livre", value: null },
  { label: "Original", value: "original" },
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "3:2", value: 3 / 2 },
  { label: "16:9", value: 16 / 9 },
];

function useObjectUrl() {
  const current = useRef<string | null>(null);
  useEffect(() => () => {
    if (current.current) URL.revokeObjectURL(current.current);
  }, []);
  return useCallback((blob: Blob) => {
    if (current.current) URL.revokeObjectURL(current.current);
    current.current = URL.createObjectURL(blob);
    return current.current;
  }, []);
}

export function Editor({ imageId }: { imageId: string }) {
  const [catalog, setCatalog] = useState<OperationInfo[] | null>(null);
  const [image, setImage] = useState<ImageDetail | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const history = useHistory<Step[]>([]);
  const steps = history.value;
  const [parentId, setParentId] = useState<string | null>(null);

  const [toolId, setToolId] = useState<string | null>("adjust");
  const [draft, setDraft] = useState<ParamValues>({});
  const [regionOn, setRegionOn] = useState(false);
  const [region, setRegion] = useState<Region | null>(null);
  const [regionShape, setRegionShape] = useState<Region["shape"]>("ellipse");
  const [regionFeather, setRegionFeather] = useState(0.35);
  const [regionInvert, setRegionInvert] = useState(false);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [cropAspect, setCropAspect] = useState<number | null | "original">(null);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [original, setOriginal] = useState<string | null>(null);
  const [compare, setCompare] = useState<CompareMode>("off");
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const viewport = useRef<ViewportHandle>(null);
  const previewUrl = useObjectUrl();
  const originalUrl = useObjectUrl();

  const tool = catalog?.find((o) => o.id === toolId) ?? null;
  const byId = useMemo(() => new Map(catalog?.map((o) => [o.id, o]) ?? []), [catalog]);

  // Carga inicial -----------------------------------------------------------
  const reloadImage = useCallback(async () => {
    const detail = await api.getImage(imageId);
    setImage(detail);
    return detail;
  }, [imageId]);

  useEffect(() => {
    let alive = true;
    Promise.all([api.operations(), api.getImage(imageId), api.preview(imageId, [])])
      .then(([ops, detail, orig]) => {
        if (!alive) return;
        setImage(detail);
        setCatalog(ops);
        const adjust = ops.find((o) => o.id === "adjust");
        if (adjust) setDraft(defaultParams(adjust));
        setOriginal(originalUrl(orig.blob));
      })
      .catch((err) => alive && setFatal(err instanceof Error ? err.message : "Erro ao abrir a imagem"));
    return () => {
      alive = false;
    };
  }, [imageId, originalUrl]);

  // Passo em edição (ainda não aplicado) -----------------------------------
  const draftStep: Step | null = useMemo(() => {
    if (!tool || tool.ui === "crop") return null;
    if (isDefault(tool, draft)) return null;
    if (tool.supports_region && regionOn) {
      if (!region) return null;
      return { op: tool.id, params: draft, region };
    }
    return { op: tool.id, params: draft };
  }, [tool, draft, regionOn, region]);

  // Com o recorte ativo mostramos a imagem sem cortar, com o retângulo por cima
  const previewSteps = useMemo(() => (draftStep ? [...steps, draftStep] : steps), [steps, draftStep]);
  const previewKey = JSON.stringify(previewSteps);

  useEffect(() => {
    if (!catalog) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.preview(imageId, JSON.parse(previewKey), ctrl.signal);
        setPreview({ url: previewUrl(res.blob), width: res.width, height: res.height });
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Erro na prévia");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [catalog, imageId, previewKey, previewUrl]);

  // Ações -------------------------------------------------------------------
  const resetDraft = useCallback((op: OperationInfo | null) => {
    setDraft(op ? defaultParams(op) : {});
    setRegion(null);
    setCrop(null);
  }, []);

  const pendingStep = useCallback((): Step | null => {
    if (tool?.ui === "crop") return crop ? { op: "crop", params: { ...crop } } : null;
    return draftStep;
  }, [tool, crop, draftStep]);

  const apply = useCallback(() => {
    const step = pendingStep();
    if (!step) return null;
    const next = [...steps, step];
    history.push(next);
    resetDraft(tool);
    return next;
  }, [pendingStep, steps, history, resetDraft, tool]);

  const selectTool = (id: string) => {
    if (id === toolId) return;
    apply(); // não perde ajustes feitos e ainda não aplicados
    const op = byId.get(id) ?? null;
    setToolId(id);
    resetDraft(op);
    setRegionOn(false);
  };

  const removeStep = (index: number) => history.push(steps.filter((_, i) => i !== index));

  const undo = useCallback(() => {
    resetDraft(tool);
    history.undo();
  }, [history, resetDraft, tool]);
  const redo = useCallback(() => {
    resetDraft(tool);
    history.redo();
  }, [history, resetDraft, tool]);

  const save = async () => {
    const all = apply() ?? steps;
    if (!all.length) return;
    setSaving(true);
    setError(null);
    try {
      const version = await api.saveVersion(imageId, all, parentId);
      setParentId(version.id);
      setImage((img) => (img ? { ...img, versions: [version, ...img.versions] } : img));
      let current = version;
      while (current.status === "pending" || current.status === "processing") {
        await new Promise((r) => setTimeout(r, 600));
        current = await api.getVersion(version.id);
      }
      await reloadImage();
      if (current.status === "failed") setError(current.error ?? "Falha ao salvar a versão");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const openVersion = (v: Version) => {
    resetDraft(tool);
    history.push(v.operations);
    setParentId(v.id);
  };

  const deleteVersion = async (v: Version) => {
    if (!window.confirm("Apagar esta versão? O original e as outras versões continuam.")) return;
    try {
      await api.deleteVersion(v.id);
      if (parentId === v.id) setParentId(null);
      await reloadImage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao apagar a versão");
    }
  };

  const onDraw = (rect: Rect) => {
    if (tool?.ui === "crop") setCrop(rect);
    else setRegion({ ...rect, shape: regionShape, feather: regionFeather, invert: regionInvert });
  };

  // Mantém a região sincronizada com as opções de forma/suavização
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derivado das opções de região
    setRegion((r) => (r ? { ...r, shape: regionShape, feather: regionFeather, invert: regionInvert } : r));
  }, [regionShape, regionFeather, regionInvert]);

  // Atalhos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
        apply();
      } else if (e.key === "\\" && !mod) {
        setCompare((c) => (c === "hold" ? c : "hold"));
      }
    };
    const onKeyUp = (e: KeyboardEvent) => e.key === "\\" && setCompare((c) => (c === "hold" ? "off" : c));
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [undo, redo, apply]);

  // Derivados para o visualizador ------------------------------------------
  const geometricInStack = steps.some((s) => byId.get(s.op)?.geometric);
  const splitAllowed = !geometricInStack && !(draftStep && byId.get(draftStep.op)?.geometric);
  const drawMode = tool?.ui === "crop" ? "crop" : tool?.supports_region && regionOn ? "region" : null;
  const aspect =
    cropAspect === "original" ? (preview ? preview.width / preview.height : null) : cropAspect;
  const overlay =
    drawMode === "crop" && crop
      ? { ...crop, shape: "rect" as const }
      : drawMode === "region" && region
        ? { ...region }
        : null;
  const hasPending = Boolean(pendingStep());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- desliga a divisão quando a geometria muda
    if (!splitAllowed && compare === "split") setCompare("off");
  }, [splitAllowed, compare]);

  if (fatal) {
    return (
      <main className="mx-auto max-w-lg space-y-3 px-4 py-16">
        <Notice>{fatal}</Notice>
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Voltar para a galeria
        </Link>
      </main>
    );
  }

  const categories = catalog ? Array.from(new Set(catalog.map((o) => o.category))) : [];

  return (
    // Altura fixa da janela (menos o cabeçalho de 3rem): cada coluna rola por conta própria
    <div className="flex h-[calc(100dvh-3rem)] min-h-0 overflow-hidden">
      {/* Ferramentas */}
      <aside className="flex w-52 shrink-0 flex-col gap-4 overflow-y-auto border-r border-line bg-panel p-3">
        <Link href="/" className="text-xs text-ink-soft hover:text-ink">
          ← Galeria
        </Link>
        {image && (
          <div className="text-xs">
            <p className="truncate font-medium" title={image.original_name}>
              {image.original_name}
            </p>
            <p className="text-ink-faint">
              {image.width}×{image.height} · {image.format}
            </p>
          </div>
        )}
        {categories.map((cat) => (
          <div key={cat}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{cat}</p>
            <div className="space-y-0.5">
              {catalog!
                .filter((o) => o.category === cat)
                .map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => selectTool(o.id)}
                    title={o.description}
                    className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${
                      o.id === toolId ? "bg-accent/15 text-ink" : "text-ink-soft hover:bg-panel-2 hover:text-ink"
                    }`}
                  >
                    {o.name}
                  </button>
                ))}
            </div>
          </div>
        ))}
        <div className="mt-auto space-y-1 text-[11px] leading-snug text-ink-faint">
          <p>Roda do mouse: zoom</p>
          <p>Arrastar: mover · Espaço + arrastar ao selecionar</p>
          <p>Ctrl+Z / Ctrl+Y: desfazer / refazer</p>
          <p>Segure \ para ver o original</p>
        </div>
      </aside>

      {/* Área central */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
          <Button variant="ghost" onClick={undo} disabled={!history.canUndo} title="Desfazer (Ctrl+Z)">
            ↶ Desfazer
          </Button>
          <Button variant="ghost" onClick={redo} disabled={!history.canRedo} title="Refazer (Ctrl+Y)">
            ↷ Refazer
          </Button>
          <span className="mx-2 h-5 w-px bg-line" />
          <Button variant="ghost" onClick={() => viewport.current?.zoomOut()} aria-label="Diminuir zoom">
            −
          </Button>
          <span className="w-12 text-center font-mono text-xs tabular-nums text-ink-soft">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" onClick={() => viewport.current?.zoomIn()} aria-label="Aumentar zoom">
            +
          </Button>
          <Button variant="ghost" onClick={() => viewport.current?.fit()}>
            Ajustar
          </Button>
          <Button variant="ghost" onClick={() => viewport.current?.actualSize()} title="Pixel a pixel da prévia">
            100%
          </Button>
          <span className="mx-2 h-5 w-px bg-line" />
          <Button
            variant="ghost"
            className={compare === "split" ? "!bg-accent/15 !text-ink" : ""}
            disabled={!splitAllowed}
            title={splitAllowed ? "Comparar antes e depois lado a lado" : "Indisponível com recorte ou giro aplicados"}
            onClick={() => setCompare((c) => (c === "split" ? "off" : "split"))}
          >
            Antes | Depois
          </Button>
          <Button
            variant="ghost"
            onPointerDown={() => setCompare("hold")}
            onPointerUp={() => setCompare("off")}
            onPointerLeave={() => setCompare((c) => (c === "hold" ? "off" : c))}
            title="Segure para ver o original"
          >
            Ver original
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="primary" onClick={save} disabled={saving || (!steps.length && !hasPending)}>
              {saving ? "Salvando…" : "Salvar versão"}
            </Button>
          </div>
        </div>
        {error && (
          <div className="border-b border-line p-2">
            <Notice>{error}</Notice>
          </div>
        )}
        <div className="min-h-0 flex-1">
          <Viewport
            ref={viewport}
            src={preview?.url ?? null}
            compareSrc={original}
            compareMode={compare === "split" && !splitAllowed ? "off" : compare}
            width={preview?.width ?? 0}
            height={preview?.height ?? 0}
            drawMode={drawMode}
            overlay={overlay}
            aspect={aspect}
            loading={loading || !preview}
            onDraw={onDraw}
            onZoomChange={setZoom}
          />
        </div>
      </section>

      {/* Painel da direita */}
      <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-line bg-panel">
        {tool && (
          <section className="border-b border-line p-4">
            <h2 className="text-sm font-semibold">{tool.name}</h2>
            <p className="mb-3 text-xs text-ink-faint">{tool.description}</p>

            {tool.ui === "crop" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-1">
                  {CROP_ASPECTS.map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      onClick={() => {
                        setCropAspect(a.value);
                        setCrop(null);
                      }}
                      className={`rounded-md border px-1 py-1 text-xs ${
                        cropAspect === a.value ? "border-accent bg-accent/15" : "border-line text-ink-soft hover:border-ink-faint"
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-ink-soft">
                  {crop ? "Arraste de novo para refazer a área." : "Arraste sobre a imagem para marcar a área que fica."}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {tool.params.map((p) => (
                  <ParamControl key={p.id} spec={p} value={draft[p.id] ?? p.default} onChange={(v) => setDraft((d) => ({ ...d, [p.id]: v }))} />
                ))}
              </div>
            )}

            {tool.supports_region && (
              <div className="mt-4 rounded-lg border border-line p-3">
                <label className="flex cursor-pointer items-center justify-between text-sm">
                  <span>Aplicar só numa área</span>
                  <input type="checkbox" checked={regionOn} onChange={(e) => setRegionOn(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
                </label>
                {regionOn && (
                  <div className="mt-2 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-1">
                      {(["ellipse", "rect"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setRegionShape(s)}
                          className={`rounded-md border py-1 ${regionShape === s ? "border-accent bg-accent/15" : "border-line text-ink-soft"}`}
                        >
                          {s === "ellipse" ? "Elipse" : "Retângulo"}
                        </button>
                      ))}
                    </div>
                    <ParamControl
                      spec={{ id: "feather", label: "Suavizar borda", type: "float", default: 0.35, min: 0, max: 1, step: 0.01 }}
                      value={regionFeather}
                      onChange={(v) => setRegionFeather(Number(v))}
                    />
                    <label className="flex items-center justify-between">
                      <span>Inverter (tudo menos a área)</span>
                      <input type="checkbox" checked={regionInvert} onChange={(e) => setRegionInvert(e.target.checked)} className="accent-[var(--color-accent)]" />
                    </label>
                    <p className="text-ink-soft">{region ? "Arraste de novo para mudar a área." : "Arraste sobre a imagem para marcar a área."}</p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <Button variant="primary" className="flex-1" onClick={apply} disabled={!hasPending}>
                Aplicar
              </Button>
              <Button onClick={() => resetDraft(tool)} disabled={!hasPending && !region && !crop}>
                Descartar
              </Button>
            </div>
          </section>
        )}

        <section className="border-b border-line p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Edições aplicadas</h2>
            {steps.length > 0 && (
              <button type="button" className="text-xs text-ink-soft hover:text-ink" onClick={() => history.push([])}>
                Limpar tudo
              </button>
            )}
          </div>
          {steps.length === 0 ? (
            <p className="text-xs text-ink-faint">Nada aplicado ainda. A imagem está igual ao original.</p>
          ) : (
            <ol className="space-y-1">
              {steps.map((s, i) => {
                const op = byId.get(s.op);
                const changed = op ? op.params.filter((p) => s.params[p.id] !== undefined && s.params[p.id] !== p.default).length : 0;
                return (
                  <li key={i} className="flex items-center justify-between rounded-md bg-panel-2 px-2 py-1 text-xs">
                    <span>
                      <span className="text-ink-faint">{i + 1}.</span> {op?.name ?? s.op}
                      <span className="text-ink-faint">
                        {s.op !== "crop" && changed ? ` · ${changed} ajuste(s)` : ""}
                        {s.region ? " · em área" : ""}
                      </span>
                    </span>
                    <button type="button" className="text-ink-faint hover:text-danger" onClick={() => removeStep(i)} aria-label={`Remover edição ${i + 1}`}>
                      ✕
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Versões salvas</h2>
          <VersionsPanel versions={image?.versions ?? []} activeId={parentId} onOpen={openVersion} onDelete={deleteVersion} />
        </section>
      </aside>
    </div>
  );
}
