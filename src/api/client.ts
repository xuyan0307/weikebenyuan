const TOKEN_KEY = 'ck_token';

export const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export interface ApiError {
  status: number;
  message: string;
  data?: any;
}

async function request<T>(method: string, path: string, body?: any, params?: Record<string, any>): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let url = `${BASE_URL}${path}`;
  if (params) {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') usp.append(k, String(v));
    });
    const qs = usp.toString();
    if (qs) url += `?${qs}`;
  }

  const resp = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data: any = null;
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    data = await resp.json().catch(() => null);
  } else {
    data = await resp.text().catch(() => null);
  }

  if (!resp.ok) {
    const message = (data && data.error) || `请求失败 (${resp.status})`;
    if (resp.status === 401) {
      setToken(null);
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    const err: ApiError = { status: resp.status, message, data };
    throw err;
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, params?: Record<string, any>) => request<T>('GET', path, undefined, params),
  post: <T>(path: string, body?: any) => request<T>('POST', path, body),
  put: <T>(path: string, body?: any) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: any) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export interface Paged<T> { total: number; page: number; pageSize: number; data: T[]; }
