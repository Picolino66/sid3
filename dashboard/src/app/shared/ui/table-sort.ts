import { signal } from '@angular/core';

export type SortDirection = 'asc' | 'desc';

/**
 * Ordenação de tabela no cliente, sobre os dados já carregados. Uso no template:
 * `<th [attr.aria-sort]="sort.aria('name')"><button class="sort-btn" (click)="sort.toggle('name')">Nome
 *  <sid3-icon [name]="sort.icon('name')" size="sm" /></button></th>`.
 */
export class TableSort<K extends string> {
  readonly key = signal<K | null>(null);
  readonly direction = signal<SortDirection>('asc');

  constructor(initialKey: K | null = null, initialDirection: SortDirection = 'asc') {
    this.key.set(initialKey);
    this.direction.set(initialDirection);
  }

  toggle(key: K): void {
    if (this.key() === key) {
      this.direction.update((direction) => (direction === 'asc' ? 'desc' : 'asc'));
    } else {
      this.key.set(key);
      this.direction.set('asc');
    }
  }

  aria(key: K): 'ascending' | 'descending' | null {
    if (this.key() !== key) return null;
    return this.direction() === 'asc' ? 'ascending' : 'descending';
  }

  icon(key: K): string {
    if (this.key() !== key) return 'sort';
    return this.direction() === 'asc' ? 'sort-asc' : 'sort-desc';
  }

  apply<T>(rows: readonly T[], accessors: Record<K, (row: T) => string | number | null | undefined>): T[] {
    const key = this.key();
    if (!key) return [...rows];
    const read = accessors[key];
    const factor = this.direction() === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => compareValues(read(a), read(b)) * factor);
  }
}

function compareValues(a: string | number | null | undefined, b: string | number | null | undefined): number {
  if (a === b) return 0;
  if (a === null || a === undefined || a === '') return 1;
  if (b === null || b === undefined || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

/** Filtro de busca simples: normaliza acentos e caixa. */
export function matchesQuery(query: string, ...values: (string | null | undefined)[]): boolean {
  const needle = normalize(query.trim());
  if (!needle) return true;
  return values.some((value) => value && normalize(value).includes(needle));
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
