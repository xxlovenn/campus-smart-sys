import { routing } from '@/i18n/routing';
import { clearToken, emitAuthLogout } from './auth-storage';

export function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL || '/api';
}

function joinUrl(base: string, path: string) {
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export class ApiError extends Error {
  status: number;
  payload: string;

  constructor(message: string, status: number, payload: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

let unauthorizedRedirecting = false;

function handleUnauthorized() {
  if (typeof window === 'undefined') return;
  clearToken();
  emitAuthLogout('session_expired');
  if (unauthorizedRedirecting) return;
  unauthorizedRedirecting = true;

  const firstSegment = window.location.pathname.split('/').filter(Boolean)[0] ?? '';
  const locale = routing.locales.includes(firstSegment as (typeof routing.locales)[number])
    ? firstSegment
    : routing.defaultLocale;
  const loginPath = `/${locale}`;
  if (window.location.pathname !== loginPath) {
    window.location.replace(loginPath);
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const headers = new Headers(opts.headers);
  if (!headers.has('Content-Type') && opts.body) {
    headers.set('Content-Type', 'application/json');
  }
  const hasAuthToken = Boolean(opts.token);
  if (hasAuthToken) headers.set('Authorization', `Bearer ${opts.token}`);
  const res = await fetch(joinUrl(getApiBase(), path), { ...opts, headers });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 && hasAuthToken) {
      handleUnauthorized();
    }
    throw new ApiError(text || res.statusText, res.status, text);
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}
