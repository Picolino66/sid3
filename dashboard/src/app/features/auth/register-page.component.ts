import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { IconComponent } from '../../shared/ui/icon.component';

const MIN_PASSWORD_LENGTH = 12;

@Component({
  selector: 'sid3-register-page',
  imports: [ReactiveFormsModule, RouterLink, FieldErrorComponent, IconComponent],
  template: `
    <main class="auth">
      <section class="card auth__panel">
        <div class="brand">
          <span class="brand__mark" aria-hidden="true">S3</span>
          <span class="brand__name">SID3</span>
        </div>

        <header class="auth__head">
          <h1 class="auth__title">Criar conta</h1>
          <p class="muted">Use o Google Drive como armazenamento, com API e controle de acesso.</p>
        </header>

        <form class="auth__form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (errorMessage()) {
            <div class="callout callout--danger" role="alert"><sid3-icon name="alert" /><span class="callout__text">{{ errorMessage() }}</span></div>
          }

          <div class="field">
            <label class="field__label" for="register-name">Nome</label>
            <input id="register-name" class="input" type="text" formControlName="name" autocomplete="name" aria-describedby="register-name-error" />
            <sid3-field-error id="register-name-error" [control]="form.controls.name" [messages]="{ required: 'Informe seu nome.', minlength: 'Use pelo menos 2 caracteres.' }" />
          </div>

          <div class="field">
            <label class="field__label" for="register-email">E-mail</label>
            <input id="register-email" class="input" type="email" formControlName="email" autocomplete="email" aria-describedby="register-email-error" />
            <sid3-field-error id="register-email-error" [control]="form.controls.email" [messages]="{ required: 'Informe seu e-mail.' }" />
          </div>

          <div class="field">
            <label class="field__label" for="register-password">Senha</label>
            <div class="input-group">
              <input
                id="register-password"
                class="input"
                [type]="showPassword() ? 'text' : 'password'"
                formControlName="password"
                autocomplete="new-password"
                aria-describedby="register-password-hint register-password-error"
              />
              <button class="btn btn--icon" type="button" [attr.aria-label]="showPassword() ? 'Ocultar senha' : 'Mostrar senha'" [attr.aria-pressed]="showPassword()" (click)="showPassword.set(!showPassword())">
                <sid3-icon [name]="showPassword() ? 'eye-off' : 'eye'" />
              </button>
            </div>
            <div class="password-meter" aria-hidden="true">
              <span class="meter meter--slim" [class.meter--warn]="passwordLength() < minLength">
                <span [style.width.%]="passwordProgress()"></span>
              </span>
            </div>
            <span class="field__hint" id="register-password-hint" aria-live="polite">
              @if (passwordLength() >= minLength) {
                <span style="color: var(--color-success)">Senha com tamanho suficiente.</span>
              } @else {
                Mínimo de {{ minLength }} caracteres ({{ passwordLength() }} de {{ minLength }}).
              }
            </span>
            <sid3-field-error
              id="register-password-error"
              [control]="form.controls.password"
              [messages]="{ required: 'Crie uma senha.', minlength: 'A senha precisa ter pelo menos ' + minLength + ' caracteres.' }"
            />
          </div>

          <button class="btn btn--primary btn--lg btn--block" type="submit" [disabled]="isSubmitting()">
            @if (isSubmitting()) {
              <sid3-icon name="loader" [spin]="true" />Criando conta...
            } @else {
              Criar conta
            }
          </button>
        </form>

        <p class="auth__switch">Já tem conta? <a routerLink="/login">Entrar</a></p>
      </section>
    </main>
  `,
  styles: ['.password-meter { margin-top: 2px; }'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterPageComponent {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  protected readonly minLength = MIN_PASSWORD_LENGTH;
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]]
  });

  private readonly password = toSignal(this.form.controls.password.valueChanges, { initialValue: '' });
  protected passwordLength(): number {
    return this.password().length;
  }
  protected passwordProgress(): number {
    return Math.min(100, (this.password().length / MIN_PASSWORD_LENGTH) * 100);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.isSubmitting()) {
      return;
    }

    this.errorMessage.set(null);
    this.isSubmitting.set(true);
    this.authService
      .register(this.form.getRawValue())
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => void this.router.navigateByUrl('/projects'),
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }
}
