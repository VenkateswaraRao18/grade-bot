export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseErrorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail.map((d: { msg?: string }) => d.msg).join(", ");
    }
    // Structured validation errors (e.g. bulk-submission mapping checks):
    // { detail: { errors: { category: ["value", ...] } } }
    if (body.detail && typeof body.detail === "object" && body.detail.errors) {
      return Object.entries(body.detail.errors as Record<string, string[]>)
        .map(([category, values]) => `${category.replace(/_/g, " ")}: ${values.join(", ")}`)
        .join(" | ");
    }
  } catch {
    // response wasn't JSON
  }
  return res.statusText || "Request failed";
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      ...(headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorDetail(res));
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** For endpoints returning binary content (audio, etc.) rather than JSON. */
export async function apiFetchBlob(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<Blob> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      ...(headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorDetail(res));
  }
  return res.blob();
}

export function apiFetchJson<T>(
  path: string,
  body: unknown,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  return apiFetch<T>(path, {
    ...options,
    method: options.method ?? "POST",
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    body: JSON.stringify(body),
  });
}
