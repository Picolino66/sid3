import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { SID3_API_BASE_URL } from '../api/api.config';
import { AuthResponse, LoginRequest, RegisterRequest, User } from './auth.models';

const ACCESS_TOKEN_KEY = 'sid3.accessToken';
const USER_KEY = 'sid3.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(SID3_API_BASE_URL);
  private readonly accessTokenSignal = signal<string | null>(localStorage.getItem(ACCESS_TOKEN_KEY));
  private readonly userSignal = signal<User | null>(this.readStoredUser());

  accessToken(): string | null {
    return this.accessTokenSignal();
  }

  currentUser(): User | null {
    return this.userSignal();
  }

  isAuthenticated(): boolean {
    return Boolean(this.accessTokenSignal());
  }

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiBaseUrl}/auth/login`, request).pipe(
      tap((response) => this.persistSession(response))
    );
  }

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiBaseUrl}/auth/register`, request).pipe(
      tap((response) => this.persistSession(response))
    );
  }

  loadCurrentUser(): Observable<User> {
    return this.http.get<User>(`${this.apiBaseUrl}/me`).pipe(
      tap((user) => {
        this.userSignal.set(user);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      })
    );
  }

  logout(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.accessTokenSignal.set(null);
    this.userSignal.set(null);
  }

  private persistSession(response: AuthResponse): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    this.accessTokenSignal.set(response.accessToken);
    this.userSignal.set(response.user);
  }

  private readStoredUser(): User | null {
    const storedUser = localStorage.getItem(USER_KEY);

    if (!storedUser) {
      return null;
    }

    try {
      return JSON.parse(storedUser) as User;
    } catch {
      localStorage.removeItem(USER_KEY);
      return null;
    }
  }
}
