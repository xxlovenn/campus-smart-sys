const KEY = 'campus_smart_token';
const AUTH_LOGOUT_REASON_KEY = 'campus_smart_auth_logout_reason';
export const AUTH_LOGOUT_EVENT = 'campus_smart:auth-logout';
export const AUTH_TOKEN_STORAGE_KEY = KEY;

export type AuthLogoutReason = 'session_expired';

function isBrowser() {
  return typeof window !== 'undefined';
}

export function getToken(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(KEY);
}

export function setToken(t: string) {
  if (!isBrowser()) return;
  const normalized = t.trim();
  if (!normalized) {
    localStorage.removeItem(KEY);
    return;
  }
  localStorage.setItem(KEY, normalized);
}

export function clearToken() {
  if (!isBrowser()) return;
  localStorage.removeItem(KEY);
}

export function hasToken() {
  return Boolean(getToken());
}

export function emitAuthLogout(reason: AuthLogoutReason = 'session_expired') {
  if (!isBrowser()) return;
  try {
    sessionStorage.setItem(AUTH_LOGOUT_REASON_KEY, reason);
  } catch {
    // ignore storage write failures and still dispatch event
  }
  window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT, { detail: { reason } }));
}

export function consumeAuthLogoutReason(): AuthLogoutReason | null {
  if (!isBrowser()) return null;
  try {
    const reason = sessionStorage.getItem(AUTH_LOGOUT_REASON_KEY) as AuthLogoutReason | null;
    if (reason) sessionStorage.removeItem(AUTH_LOGOUT_REASON_KEY);
    return reason;
  } catch {
    return null;
  }
}
