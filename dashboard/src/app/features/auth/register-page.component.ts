import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { toApiErrorMessage } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'sid3-register-page',
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
          <h1>Criar conta</h1>
        </header>

        <form [formGroup]="form" (ngSubmit)="submit()">
          <label>
            Nome
            <input type="text" formControlName="name" autocomplete="name" />
          </label>
          <label>
            E-mail
            <input type="email" formControlName="email" autocomplete="email" />
          </label>
          <label>
            Senha
            <input type="password" formControlName="password" autocomplete="new-password" />
          </label>

          @if (errorMessage()) {
            <p class="form-error">{{ errorMessage() }}</p>
          }

          <button type="submit" [disabled]="form.invalid || isSubmitting()">
            {{ isSubmitting() ? 'Criando...' : 'Criar conta' }}
          </button>
        </form>

        <p class="auth-switch">Já tem conta? <a routerLink="/login">Entrar</a></p>
      </section>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterPageComponent {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(12)]]
  });

  submit(): void {
    if (this.form.invalid || this.isSubmitting()) {
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
