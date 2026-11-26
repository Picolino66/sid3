/**
 * Executa tarefas com a mesma chave uma de cada vez (dentro do processo). Tarefas de chaves diferentes
 * continuam em paralelo. Usado para que envios simultâneos não criem pastas duplicadas no Drive.
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  async runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    const tail = run.catch(() => undefined);
    this.tails.set(key, tail);

    try {
      return await run;
    } finally {
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    }
  }
}
