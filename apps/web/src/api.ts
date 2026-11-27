import type { Asset, AssetKind } from "@mj-ia/shared";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body instanceof FormData || body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Erreur ${res.status}`);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
  upload: (campaignId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ url: string }>("POST", `/campaigns/${campaignId}/uploads`, form);
  },
  /** Envoi d'un fichier dans la bibliothèque de la campagne. */
  uploadAsset: (campaignId: string, kind: AssetKind, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Asset>("POST", `/campaigns/${campaignId}/assets?kind=${kind}`, form);
  },
};
