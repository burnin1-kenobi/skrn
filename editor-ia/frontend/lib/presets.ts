import type { Step } from "./api";

// Presets são só combinações das operações existentes: o backend valida
// cada passo como qualquer outra edição. Ao aplicar, viram passos normais
// no histórico (dá para desfazer ou remover).

export type Preset = { id: string; name: string; steps: Step[] };
export type PresetGroup = { name: string; presets: Preset[] };

const adjust = (params: Record<string, number>): Step => ({ op: "adjust", params });

export const PRESET_GROUPS: PresetGroup[] = [
  {
    name: "Universal",
    presets: [
      { id: "auto-leve", name: "Realce leve", steps: [adjust({ contrast: 0.12, vibrance: 0.25, shadows: 0.15 }), { op: "sharpen", params: { amount: 0.4 } }] },
      { id: "vivido", name: "Vívido", steps: [adjust({ contrast: 0.25, saturation: 0.2, vibrance: 0.35 })] },
      { id: "retrato", name: "Retrato suave", steps: [adjust({ exposure: 0.15, contrast: -0.08, highlights: -0.2, temperature: 0.1 }), { op: "smooth", params: { strength: 0.25, radius: 0.3, preserve_edges: 0.7 } }] },
      { id: "por-do-sol", name: "Pôr do sol", steps: [adjust({ temperature: 0.45, tint: 0.1, saturation: 0.15, highlights: -0.25 })] },
      { id: "inverno", name: "Inverno", steps: [adjust({ temperature: -0.4, exposure: 0.15, saturation: -0.2, contrast: 0.08 })] },
      { id: "dramatico", name: "Dramático", steps: [adjust({ contrast: 0.45, highlights: -0.35, shadows: -0.15, vibrance: 0.2 }), { op: "sharpen", params: { amount: 0.6 } }] },
      { id: "desbotado", name: "Desbotado", steps: [adjust({ contrast: -0.3, shadows: 0.3, saturation: -0.25, brightness: 0.08 })] },
    ],
  },
  {
    name: "Preto e branco",
    presets: [
      { id: "pb", name: "Clássico", steps: [adjust({ saturation: -1, contrast: 0.15 })] },
      { id: "pb-contraste", name: "Alto contraste", steps: [adjust({ saturation: -1, contrast: 0.5, shadows: -0.2 }), { op: "sharpen", params: { amount: 0.5 } }] },
      { id: "pb-suave", name: "Suave", steps: [adjust({ saturation: -1, contrast: -0.2, shadows: 0.25 })] },
    ],
  },
  {
    name: "Correções",
    presets: [
      { id: "clarear-sombras", name: "Clarear sombras", steps: [adjust({ shadows: 0.5, highlights: -0.1 })] },
      { id: "recuperar-ceu", name: "Recuperar céu", steps: [adjust({ highlights: -0.6, vibrance: 0.15 })] },
      { id: "reduzir-ruido", name: "Reduzir ruído", steps: [{ op: "smooth", params: { strength: 0.5, radius: 0.2, preserve_edges: 0.6 } }] },
      { id: "nitidez", name: "Mais nitidez", steps: [{ op: "sharpen", params: { amount: 1.0, radius: 0.12 } }] },
    ],
  },
];
