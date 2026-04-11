'use client';

import { useLocale } from 'next-intl';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from '@/navigation';
import { AUTH_LOGOUT_EVENT, AUTH_TOKEN_STORAGE_KEY, getToken } from './auth-storage';

type UseAuthGuardResult = {
  token: string | null;
  ready: boolean;
};

export function useAuthGuard(): UseAuthGuardResult {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setToken(getToken());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!token && pathname !== '/') {
      router.replace('/', { locale });
    }
  }, [ready, token, pathname, router, locale]);

  useEffect(() => {
    function onAuthLogout() {
      setToken(null);
      if (pathname !== '/') {
        router.replace('/', { locale });
      }
    }

    function onStorage(event: StorageEvent) {
      if (event.storageArea !== localStorage) return;
      if (event.key !== AUTH_TOKEN_STORAGE_KEY) return;
      if (!event.newValue) {
        setToken(null);
        if (pathname !== '/') {
          router.replace('/', { locale });
        }
        return;
      }
      setToken(event.newValue);
    }

    window.addEventListener(AUTH_LOGOUT_EVENT, onAuthLogout);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(AUTH_LOGOUT_EVENT, onAuthLogout);
      window.removeEventListener('storage', onStorage);
    };
  }, [pathname, router, locale]);

  return { token, ready };
}

