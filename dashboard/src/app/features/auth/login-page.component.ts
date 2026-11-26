import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'sid3-login-page',
  imports: [ReactiveFormsModule, RouterLink, FieldErrorComponent, IconComponent],
  template: `
    <main class="auth">
      <section class="card auth__panel">
        <div class="brand">
          <span class="brand__mark" aria-hidden="true">S3</span>
          <span class="brand__name">SID3</span>
        </div>

        <header class="auth__head">
          <h1 class="auth__title">Entrar no painel</h1>
          <p class="muted">Gerencie seus projetos, conexões e arquivos.</p>
        </header>

        <form class="auth__form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (errorMessage()) {
            <div class="callout callout--danger" role="alert"><sid3-icon name="alert" /><span class="callout__text">{{ errorMessage() }}</span></div>
          }

          <div class="field">
            <label class="field__label" for="login-email">E-mail</label>
            <input id="login-email" class="input" type="email" formControlName="email" autocomplete="email" aria-describedby="login-email-error" />
            <sid3-field-error id="login-email-error" [control]="form.controls.email" [messages]="{ required: 'Informe seu e-mail.' }" />
          </div>

          <div class="field">
            <label class="field__label" for="login-password">Senha</label>
            <div class="input-group">
              <input
                id="login-password"
                class="input"
                [type]="showPassword() ? 'text' : 'password'"
                formControlName="password"
                autocomplete="current-password"
                aria-describedby="login-password-error"
              />
              <button class="btn btn--icon" type="button" [attr.aria-label]="showPassword() ? 'Ocultar senha' : 'Mostrar senha'" [attr.aria-pressed]="showPassword()" (click)="showPassword.set(!showPassword())">
                <sid3-icon [name]="showPassword() ? 'eye-off' : 'eye'" />
              </button>
            </div>
            <sid3-field-error id="login-password-error" [control]="form.controls.password" [messages]="{ required: 'Informe sua senha.' }" />
          </div>

          <button class="btn btn--primary btn--lg btn--block" type="submit" [disabled]="isSubmitting()">
            @if (isSubmitting()) {
              <sid3-icon name="loader" [spin]="true" />Entrando...
            } @else {
              Entrar
            }
          </button>
        </form>

        <p class="auth__switch">Não tem conta? <a routerLink="/register">Criar conta</a></p>
      </section>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginPageComponent {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

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
      .login(this.form.getRawValue())
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => void this.router.navigateByUrl('/overview'),
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }
}
