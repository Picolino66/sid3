import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_KEY = 'sid3.theme';

/** Tema do painel: segue o sistema por padrão ou fica fixo em claro/escuro (salvo no navegador). */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(readStoredMode());

  constructor() {
    this.apply(this.mode());
  }

  set(mode: ThemeMode): void {
    this.mode.set(mode);
    this.apply(mode);
    try {
      if (mode === 'system') {
        localStorage.removeItem(THEME_KEY);
      } else {
        localStorage.setItem(THEME_KEY, mode);
      }
    } catch {
      /* armazenamento indisponível: vale só nesta sessão */
    }
  }

  /** Alterna claro ⇄ escuro a partir do tema efetivo atual. */
  toggle(): void {
    this.set(this.isDark() ? 'light' : 'dark');
  }

  isDark(): boolean {
    const mode = this.mode();
    if (mode !== 'system') return mode === 'dark';
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  }

  private apply(mode: ThemeMode): void {
    const root = document.documentElement;
    if (mode === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', mode);
    }
  }
}

function readStoredMode(): ThemeMode {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}
