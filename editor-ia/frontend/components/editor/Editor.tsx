"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Collapsible } from "@/components/ui/Collapsible";
import { Icon, OPERATION_ICONS } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
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
import { PRESET_GROUPS, type Preset } from "@/lib/presets";
import { Filmstrip } from "./Filmstrip";
import { Histogram } from "./Histogram";
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
  const [tab, setTab] = useState<"edit" | "versions">("edit");
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

  const applyPreset = (preset: Preset) => {
    const base = apply() ?? steps;
    history.push([...base, ...preset.steps.map((st) => ({ ...st, params: { ...st.params } }))]);
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

  // Agrupa os parâmetros da ferramenta em seções (ex.: Luz, Cor)
  const paramGroups = tool
    ? tool.params.reduce<{ name: string; params: typeof tool.params }[]>((acc, p) => {
        const name = p.group ?? "Ajustes";
        const g = acc.find((x) => x.name === name);
        if (g) g.params.push(p);
        else acc.push({ name, params: [p] });
        return acc;
      }, [])
    : [];
  const iconBtn = "flex h-9 w-9 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-panel-2 hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent";

  return (
    <div className="flex h-dvh min-h-0 flex-col gap-3 p-3">
      {/* Barra superior */}
      <header className="card flex h-14 shrink-0 items-center gap-2 px-3">
        <Link href="/" className="flex items-center gap-2 rounded-xl pr-2 hover:bg-panel-2" title="Voltar para a galeria">
          <Logo compact />
          <Icon name="back" size={16} className="text-ink-faint" />
        </Link>
        <span className="mx-1 h-6 w-px bg-line" />
        <nav aria-label="Ferramentas" className="flex items-center gap-1">
          {catalog?.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => selectTool(o.id)}
              title={`${o.name} — ${o.description}`}
              aria-label={o.name}
              aria-pressed={o.id === toolId}
              className={`relative flex h-10 items-center gap-2 rounded-xl px-3 text-sm transition-colors ${
                o.id === toolId ? "bg-accent/15 text-ink" : "text-ink-soft hover:bg-panel-2 hover:text-ink"
              }`}
            >
              <Icon name={OPERATION_ICONS[o.id] ?? "sparkle"} size={17} />
              <span className="hidden xl:inline">{o.name}</span>
              {o.id === toolId && <span className="bg-brand absolute inset-x-3 -bottom-[9px] h-0.5 rounded-full" />}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className={iconBtn} onClick={undo} disabled={!history.canUndo} title="Desfazer (Ctrl+Z)" aria-label="Desfazer">
            <Icon name="undo" />
          </button>
          <button type="button" className={iconBtn} onClick={redo} disabled={!history.canRedo} title="Refazer (Ctrl+Y)" aria-label="Refazer">
            <Icon name="redo" />
          </button>
          <span className="mx-1 h-6 w-px bg-line" />
          <button
            type="button"
            className={`${iconBtn} ${compare === "split" ? "!bg-accent/15 !text-ink" : ""}`}
            disabled={!splitAllowed}
            onClick={() => setCompare((c) => (c === "split" ? "off" : "split"))}
            title={splitAllowed ? "Antes | Depois" : "Comparação lado a lado indisponível com recorte ou giro"}
            aria-label="Antes e depois"
            aria-pressed={compare === "split"}
          >
            <Icon name="compare" />
          </button>
          <button
            type="button"
            className={iconBtn}
            onPointerDown={() => setCompare("hold")}
            onPointerUp={() => setCompare("off")}
            onPointerLeave={() => setCompare((c) => (c === "hold" ? "off" : c))}
            title="Segure para ver o original (ou segure a tecla \)"
            aria-label="Ver original"
          >
            <Icon name="eye" />
          </button>
          <Button variant="primary" className="ml-2 !rounded-full !px-5" onClick={save} disabled={saving || (!steps.length && !hasPending)}>
            {saving ? "Salvando…" : "Salvar versão"}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* Presets e histórico */}
        <aside className="card scroll-thin hidden w-60 shrink-0 flex-col overflow-y-auto px-4 py-3 lg:flex">
          <div className="flex items-center justify-between pb-1 pt-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Icon name="sparkle" size={16} className="text-accent" /> Presets
            </h2>
          </div>
          {PRESET_GROUPS.map((g, gi) => (
            <Collapsible key={g.name} title={g.name} defaultOpen={gi === 0}>
              <ul className="space-y-0.5">
                {g.presets.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => applyPreset(p)} className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-ink-soft hover:bg-panel-2 hover:text-ink">
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            </Collapsible>
          ))}

          <div className="mt-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Icon name="history" size={16} className="text-accent" /> Edições aplicadas
            </h2>
            {steps.length > 0 && (
              <button type="button" className="text-xs text-ink-faint hover:text-ink" onClick={() => history.push([])}>
                Limpar
              </button>
            )}
          </div>
          {steps.length === 0 ? (
            <p className="mt-2 text-xs text-ink-faint">Nada aplicado. A imagem está igual ao original.</p>
          ) : (
            <ol className="mt-2 space-y-1">
              {steps.map((s, i) => {
                const op = byId.get(s.op);
                const changed = op ? op.params.filter((p) => s.params[p.id] !== undefined && s.params[p.id] !== p.default).length : 0;
                return (
                  <li key={i} className="group flex items-center gap-2 rounded-lg bg-panel-2 px-2 py-1.5 text-xs">
                    <Icon name={OPERATION_ICONS[s.op] ?? "sparkle"} size={14} className="shrink-0 text-ink-faint" />
                    <span className="min-w-0 flex-1 truncate">
                      {op?.name ?? s.op}
                      <span className="text-ink-faint">
                        {s.op !== "crop" && changed ? ` · ${changed}` : ""}
                        {s.region ? " · área" : ""}
                      </span>
                    </span>
                    <button type="button" className="text-ink-faint opacity-60 hover:text-danger group-hover:opacity-100" onClick={() => removeStep(i)} aria-label={`Remover edição ${i + 1}`}>
                      <Icon name="x" size={14} />
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </aside>

        {/* Imagem + faixa de fotos */}
        <section className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="card relative min-h-0 flex-1 overflow-hidden">
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
            {error && (
              <div className="absolute inset-x-3 top-3">
                <Notice>{error}</Notice>
              </div>
            )}
            <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-full border border-line bg-panel/90 px-1 py-0.5 text-xs backdrop-blur">
              <button type="button" className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-panel-3" onClick={() => viewport.current?.zoomOut()} aria-label="Diminuir zoom">
                <Icon name="minus" size={14} />
              </button>
              <button type="button" className="w-12 font-mono tabular-nums text-ink-soft hover:text-ink" onClick={() => viewport.current?.actualSize()} title="Pixel a pixel da prévia">
                {Math.round(zoom * 100)}%
              </button>
              <button type="button" className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-panel-3" onClick={() => viewport.current?.zoomIn()} aria-label="Aumentar zoom">
                <Icon name="plus" size={14} />
              </button>
              <button type="button" className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-panel-3" onClick={() => viewport.current?.fit()} aria-label="Ajustar à tela" title="Ajustar à tela">
                <Icon name="fit" size={14} />
              </button>
            </div>
            <p className="pointer-events-none absolute bottom-4 left-4 hidden text-[11px] text-ink-faint 2xl:block">
              Roda: zoom · Arrastar: mover · Espaço+arrastar ao selecionar · Ctrl+Z/Y · segure \ para o original
            </p>
          </div>
          <div className="card shrink-0">
            <Filmstrip currentId={imageId} onError={setError} />
          </div>
        </section>

        {/* Painel de ajustes */}
        <aside className="card flex w-80 shrink-0 flex-col overflow-hidden">
          <div className="p-3 pb-0">
            <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-panel-2 p-1 text-sm">
              {(
                [
                  ["edit", "Editar"],
                  ["versions", `Versões${image?.versions.length ? ` (${image.versions.length})` : ""}`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`rounded-lg py-1.5 font-medium transition-colors ${tab === id ? "bg-brand text-white shadow" : "text-ink-soft hover:text-ink"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {tab === "versions" ? (
              <VersionsPanel versions={image?.versions ?? []} activeId={parentId} onOpen={openVersion} onDelete={deleteVersion} />
            ) : (
              <>
                <Histogram src={preview?.url ?? null} />
                {image && (
                  <p className="mt-1.5 flex justify-between text-[11px] text-ink-faint">
                    <span className="truncate pr-2">{image.original_name}</span>
                    <span>{image.width}×{image.height}</span>
                  </p>
                )}

                {tool && (
                  <div className="mt-4">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                        <Icon name={OPERATION_ICONS[tool.id] ?? "sparkle"} size={18} />
                      </span>
                      <div>
                        <h2 className="text-sm font-semibold">{tool.name}</h2>
                        <p className="text-xs leading-snug text-ink-faint">{tool.description}</p>
                      </div>
                    </div>

                    {tool.ui === "crop" ? (
                      <div className="mt-4 space-y-3">
                        <div className="grid grid-cols-3 gap-1.5">
                          {CROP_ASPECTS.map((a) => (
                            <button
                              key={a.label}
                              type="button"
                              onClick={() => {
                                setCropAspect(a.value);
                                setCrop(null);
                              }}
                              className={`rounded-lg border px-1 py-1.5 text-xs ${cropAspect === a.value ? "border-accent bg-accent/15" : "border-line text-ink-soft hover:border-ink-faint"}`}
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-ink-soft">{crop ? "Arraste de novo para refazer a área." : "Arraste sobre a imagem para marcar a área que fica."}</p>
                      </div>
                    ) : (
                      <div className="mt-2">
                        {paramGroups.map((g) => (
                          <Collapsible key={g.name} title={g.name}>
                            <div className="space-y-1">
                              {g.params.map((p) => (
                                <ParamControl key={p.id} spec={p} value={draft[p.id] ?? p.default} onChange={(v) => setDraft((d) => ({ ...d, [p.id]: v }))} />
                              ))}
                            </div>
                          </Collapsible>
                        ))}
                      </div>
                    )}

                    {tool.supports_region && (
                      <div className="mt-3 rounded-2xl border border-line bg-panel-2/60 p-3">
                        <label className="flex cursor-pointer items-center justify-between text-sm">
                          <span>Aplicar só numa área</span>
                          <input type="checkbox" checked={regionOn} onChange={(e) => setRegionOn(e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
                        </label>
                        {regionOn && (
                          <div className="mt-2 space-y-2 text-xs">
                            <div className="grid grid-cols-2 gap-1">
                              {(["ellipse", "rect"] as const).map((sh) => (
                                <button key={sh} type="button" onClick={() => setRegionShape(sh)} className={`rounded-lg border py-1 ${regionShape === sh ? "border-accent bg-accent/15" : "border-line text-ink-soft"}`}>
                                  {sh === "ellipse" ? "Elipse" : "Retângulo"}
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
                  </div>
                )}
              </>
            )}
          </div>

          {tab === "edit" && tool && (
            <div className="flex gap-2 border-t border-line p-3">
              <Button variant="primary" className="flex-1" onClick={apply} disabled={!hasPending}>
                Aplicar
              </Button>
              <Button onClick={() => resetDraft(tool)} disabled={!hasPending && !region && !crop}>
                Descartar
              </Button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
