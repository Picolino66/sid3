import { InjectionToken } from '@angular/core';

declare global {
  interface Window {
    __SID3_RUNTIME_CONFIG__?: {
      apiBaseUrl?: string;
    };
  }
}

export const SID3_API_BASE_URL = new InjectionToken<string>('SID3_API_BASE_URL', {
  providedIn: 'root',
  factory: () => {
    const runtimeValue = window.__SID3_RUNTIME_CONFIG__?.apiBaseUrl?.trim();
    return normalizeApiBaseUrl(runtimeValue || 'http://localhost:3000/api/v1');
  }
});

function normalizeApiBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}
