import { InjectionToken } from '@angular/core';

export const SID3_API_BASE_URL = new InjectionToken<string>('SID3_API_BASE_URL', {
  providedIn: 'root',
  factory: () => 'http://localhost:3000/api/v1'
});
