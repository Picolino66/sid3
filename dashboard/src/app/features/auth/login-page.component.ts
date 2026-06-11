import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'sid3-login-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth-page">
      <section class="auth-panel">
        <div class="brand compact">
          <span class="brand-mark">S3</span>
          <div>
            <strong>SID3</strong>
            <span>Gateway de armazenamento</span>
          </div>
        </div>

        <header>
          <p class="eyebrow">Dashboard</p>
          <h1>Entrar</h1>
        </header>

        <form [formGroup]="form" (ngSubmit)="submit()">
          <label>
            E-mail
            <input type="email" formControlName="email" autocomplete="email" />
          </label>
          <label>
            Senha
            <input type="password" formControlName="password" autocomplete="current-password" />
          </label>

          @if (errorMessage()) {
            <p class="form-error">{{ errorMessage() }}</p>
          }

          <button type="submit" [disabled]="form.invalid || isSubmitting()">
            {{ isSubmitting() ? 'Entrando...' : 'Entrar' }}
          </button>
        </form>

        <p class="auth-switch">Não tem conta? <a routerLink="/register">Criar agora</a></p>
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
  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  submit(): void {
    if (this.form.invalid || this.isSubmitting()) {
      return;
    }

    this.errorMessage.set(null);
    this.isSubmitting.set(true);
    this.authService
      .login(this.form.getRawValue())
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => void this.router.navigateByUrl('/projects'),
        error: (error: unknown) => this.errorMessage.set(toApiErrorMessage(error))
      });
  }
}
