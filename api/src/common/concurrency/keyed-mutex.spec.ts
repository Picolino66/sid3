import { KeyedMutex } from './keyed-mutex';

describe(KeyedMutex.name, () => {
  it('runs tasks with the same key one at a time, in order', async () => {
    const mutex = new KeyedMutex();
    const events: string[] = [];
    const task = (name: string, delay: number) => async () => {
      events.push(`start:${name}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      events.push(`end:${name}`);
      return name;
    };

    const results = await Promise.all([
      mutex.runExclusive('a', task('first', 20)),
      mutex.runExclusive('a', task('second', 1))
    ]);

    expect(results).toEqual(['first', 'second']);
    expect(events).toEqual(['start:first', 'end:first', 'start:second', 'end:second']);
  });

  it('lets different keys run in parallel', async () => {
    const mutex = new KeyedMutex();
    const events: string[] = [];
    await Promise.all([
      mutex.runExclusive('a', async () => {
        events.push('start:a');
        await new Promise((resolve) => setTimeout(resolve, 20));
        events.push('end:a');
      }),
      mutex.runExclusive('b', async () => {
        events.push('start:b');
        events.push('end:b');
      })
    ]);

    expect(events.indexOf('end:b')).toBeLessThan(events.indexOf('end:a'));
  });

  it('keeps going after a task fails', async () => {
    const mutex = new KeyedMutex();
    await expect(mutex.runExclusive('a', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(mutex.runExclusive('a', async () => 'ok')).resolves.toBe('ok');
  });
});
