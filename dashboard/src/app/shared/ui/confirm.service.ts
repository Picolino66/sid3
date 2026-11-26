import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message: string;
  /** Rótulo do botão de confirmação: nomeia a ação ("Excluir arquivo"), nunca "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/** Confirmação com o visual do painel (substitui window.confirm). Renderizada pelo ConfirmHostComponent no shell. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly pending = signal<PendingConfirm | null>(null);

  ask(options: ConfirmOptions): Promise<boolean> {
    this.pending()?.resolve(false);
    return new Promise<boolean>((resolve) => {
      this.pending.set({ tone: 'danger', cancelLabel: 'Cancelar', ...options, resolve });
    });
  }

  settle(confirmed: boolean): void {
    const current = this.pending();
    this.pending.set(null);
    current?.resolve(confirmed);
  }
}
