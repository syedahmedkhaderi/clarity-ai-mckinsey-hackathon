export const API_BASE = "/api";

export interface ApiErrorItem {
  file?: string;
  where?: string;
  message: string;
}

/**
 * A failed request, already turned into a sentence a teacher can read. The
 * backend sends either {detail: {code, message, errors}} for errors it chose
 * to explain, or a plain string, or a validation list from FastAPI itself.
 */
export class ApiError extends Error {
  readonly code: string | null;
  readonly status: number;
  readonly errors: ApiErrorItem[];

  constructor(message: string, code: string | null, status: number, errors: ApiErrorItem[] = []) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.errors = errors;
  }
}

function fromDetail(detail: unknown, status: number): ApiError {
  const fallback = `Something went wrong (status ${status}).`;
  if (typeof detail === "string") return new ApiError(detail, null, status);
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: unknown } | undefined;
    return new ApiError(typeof first?.msg === "string" ? first.msg : fallback, null, status);
  }
  if (detail && typeof detail === "object") {
    const d = detail as { code?: unknown; message?: unknown; errors?: unknown };
    return new ApiError(
      typeof d.message === "string" ? d.message : fallback,
      typeof d.code === "string" ? d.code : null,
      status,
      Array.isArray(d.errors) ? (d.errors as ApiErrorItem[]) : [],
    );
  }
  return new ApiError(fallback, null, status);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Could not reach the server. Check that it is running.", "NETWORK", 0);
  }
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  if (!res.ok) {
    throw fromDetail((parsed as { detail?: unknown } | null)?.detail, res.status);
  }
  return parsed as T;
}

export const get = <T>(path: string) => request<T>("GET", path);
export const post = <T>(path: string, body: unknown) => request<T>("POST", path, body);
export const put = <T>(path: string, body: unknown) => request<T>("PUT", path, body);
export const del = <T>(path: string) => request<T>("DELETE", path);
