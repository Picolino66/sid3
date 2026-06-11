import { HttpErrorResponse } from '@angular/common/http';

export function toApiErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const response = error.error as { message?: string | string[] } | null;
    const message = response?.message;

    if (Array.isArray(message)) {
      return message.join(', ');
    }

    return message ?? error.message;
  }

  return 'Unexpected error';
}
