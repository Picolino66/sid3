import { Component, input } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { IconComponent } from './icon.component';

/**
 * Mensagem de validação inline de um campo. Aparece depois que o usuário sai do campo ou tenta enviar.
 * Usa detecção de mudança padrão de propósito: precisa refletir touched/status do controle a cada interação.
 */
@Component({
  selector: 'sid3-field-error',
  imports: [IconComponent],
  template: `
    @if (message(); as text) {
      <span class="field__error" [id]="id()" role="alert"><sid3-icon name="alert" size="sm" />{{ text }}</span>
    }
  `,
  styles: [':host { display: contents; }']
})
export class FieldErrorComponent {
  readonly control = input.required<AbstractControl>();
  readonly messages = input<Record<string, string>>({});
  readonly id = input<string | null>(null);

  protected message(): string | null {
    const control = this.control();
    if (!control.errors || !(control.touched || control.dirty)) {
      return null;
    }
    const key = Object.keys(control.errors)[0];
    if (!key) return null;
    return this.messages()[key] ?? DEFAULT_MESSAGES[key] ?? 'Valor inválido.';
  }
}

const DEFAULT_MESSAGES: Record<string, string> = {
  required: 'Campo obrigatório.',
  email: 'Informe um e-mail válido.',
  minlength: 'Muito curto.',
  maxlength: 'Muito longo.',
  pattern: 'Formato inválido.'
};
