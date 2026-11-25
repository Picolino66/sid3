import { Injectable, signal } from '@angular/core';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface ToastNotification {
  id: string;
  type: NotificationType;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  readonly notifications = signal<ToastNotification[]>([]);

  show(message: string, type: NotificationType = 'info', durationMs = 4000): void {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const notification: ToastNotification = { id, type, message };

    this.notifications.update((list) => [...list, notification]);

    if (durationMs > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, durationMs);
    }
  }

  success(message: string, durationMs = 4000): void {
    this.show(message, 'success', durationMs);
  }

  error(message: string, durationMs = 7000): void {
    this.show(message, 'error', durationMs);
  }

  warning(message: string, durationMs = 5000): void {
    this.show(message, 'warning', durationMs);
  }

  info(message: string, durationMs = 4000): void {
    this.show(message, 'info', durationMs);
  }

  dismiss(id: string): void {
    this.notifications.update((list) => list.filter((n) => n.id !== id));
  }
}
