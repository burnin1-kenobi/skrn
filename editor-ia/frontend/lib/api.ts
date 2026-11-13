// Cliente da API do backend (FastAPI). Todas as chamadas passam por aqui.

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export type ParamSpec = {
  id: string;
  label: string;
  type: "float" | "int" | "bool" | "choice";
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  help?: string;
  group?: string;
};

export type OperationInfo = {
  id: string;
  name: string;
  category: string;
  description: string;
  supports_region: boolean;
  geometric: boolean;
  ui: string | null;
  engine: { kind: "classic" | "ai"; version: string; requires_gpu: boolean };
  params: ParamSpec[];
};

export type Region = {
  shape: "rect" | "ellipse";
  x: number;
  y: number;
  w: number;
  h: number;
  feather: number;
  invert: boolean;
};

export type ParamValues = Record<string, number | boolean | string>;

export type Step = { op: string; params: ParamValues; region?: Region };

export type ImageItem = {
  id: string;
  original_name: string;
  format: string;
  mime_type: string;
  width: number;
  height: number;
  has_alpha: boolean;
  size_bytes: number;
  created_at: string;
  version_count: number;
};

export type Version = {
  id: string;
  image_id: string;
  parent_id: string | null;
  operations: Step[];
  status: "pending" | "processing" | "completed" | "failed";
  error: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
  updated_at: string;
};

export type ImageDetail = ImageItem & { versions: Version[] };

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  let message = `Erro ${res.status}`;
  try {
    const body = await res.json();
    if (typeof body.detail === "string") message = body.detail;
    else if (Array.isArray(body.detail) && body.detail[0]?.msg) message = body.detail[0].msg;
  } catch {
    /* resposta sem JSON */
  }
  return new ApiError(message, res.status);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("Não foi possível falar com o servidor. Ele está rodando?", 0);
  }
  if (!res.ok) throw await errorFrom(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const json = (body: unknown, signal?: AbortSignal): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal,
});

export const api = {
  health: () => request<{ status: string; max_upload_mb: number }>("/api/health"),
  operations: () => request<OperationInfo[]>("/api/operations"),
  listImages: () => request<ImageItem[]>("/api/images"),
  getImage: (id: string) => request<ImageDetail>(`/api/images/${id}`),
  deleteImage: (id: string) => request<void>(`/api/images/${id}`, { method: "DELETE" }),
  getVersion: (id: string) => request<Version>(`/api/versions/${id}`),
  deleteVersion: (id: string) => request<void>(`/api/versions/${id}`, { method: "DELETE" }),
  saveVersion: (imageId: string, operations: Step[], parentId?: string | null) =>
    request<Version>(`/api/images/${imageId}/versions`, json({ operations, parent_id: parentId ?? null })),

  thumbnailUrl: (id: string) => `${API_URL}/api/images/${id}/thumbnail`,
  originalUrl: (id: string) => `${API_URL}/api/images/${id}/original`,
  versionThumbnailUrl: (id: string) => `${API_URL}/api/versions/${id}/thumbnail`,
  exportUrl: (id: string, format: "jpeg" | "png" | "webp", quality: number, maxSide?: number) => {
    const q = new URLSearchParams({ format, quality: String(quality) });
    if (maxSide) q.set("max_side", String(maxSide));
    return `${API_URL}/api/versions/${id}/export?${q}`;
  },

  /** Renderiza a prévia e devolve um blob de imagem com suas dimensões. */
  async preview(imageId: string, operations: Step[], signal?: AbortSignal) {
    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/images/${imageId}/preview`, json({ operations }, signal));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      throw new ApiError("Não foi possível falar com o servidor. Ele está rodando?", 0);
    }
    if (!res.ok) throw await errorFrom(res);
    return {
      blob: await res.blob(),
      width: Number(res.headers.get("X-Image-Width")),
      height: Number(res.headers.get("X-Image-Height")),
    };
  },

  /** Upload com progresso (fetch ainda não informa progresso de envio). */
  upload(file: File, onProgress?: (fraction: number) => void): Promise<ImageItem> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_URL}/api/images`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        let body: { detail?: unknown } & Partial<ImageItem> = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* sem corpo */
        }
        if (xhr.status === 201) resolve(body as ImageItem);
        else reject(new ApiError(typeof body.detail === "string" ? body.detail : `Erro ${xhr.status}`, xhr.status));
      };
      xhr.onerror = () => reject(new ApiError("Não foi possível falar com o servidor. Ele está rodando?", 0));
      const form = new FormData();
      form.append("file", file);
      xhr.send(form);
    });
  },
};

export function defaultParams(op: OperationInfo): ParamValues {
  return Object.fromEntries(op.params.map((p) => [p.id, p.default]));
}

export function isDefault(op: OperationInfo, values: ParamValues): boolean {
  return op.params.every((p) => values[p.id] === p.default);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
