const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...options, headers });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.", 0);
  }

  if (res.status === 401) {
    authToken = null;
    let detail = "Oturum sona erdi, tekrar giriş yapın.";
    try {
      const body = await res.json();
      detail = body?.detail || detail;
    } catch {
      /* body may be empty */
    }
    onUnauthorized?.();
    throw new ApiError(detail, 401);
  }

  if (!res.ok) {
    let detail = `Sunucu hatası (${res.status}).`;
    try {
      const body = await res.json();
      detail = body?.detail || detail;
    } catch {
      /* body may be empty/non-JSON */
    }
    throw new ApiError(detail, res.status);
  }

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export function apiGet(path: string) {
  return request(path);
}

export function apiPost(path: string, body?: unknown, options?: { signal?: AbortSignal }) {
  return request(path, {
    method: "POST",
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    signal: options?.signal,
  });
}
