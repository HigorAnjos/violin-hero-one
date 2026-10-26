import { describe, expect, it } from 'vitest';
import { createShowQueue, MAX_WAITING, MIN_SHOW_SECONDS } from './showQueue';

describe('createShowQueue', () => {
  it('mostra na hora quando a tela está livre e some depois de `hold`', () => {
    const q = createShowQueue<string>(2.5);
    q.push('a', 10);
    expect(q.current(10)?.item).toBe('a');
    expect(q.current(12.4)?.item).toBe('a');
    expect(q.current(12.6)).toBeNull();
  });

  it('julgamentos seguidos entram em fila: cada um fica pelo menos 250 ms, na ordem', () => {
    const q = createShowQueue<string>(1);
    q.push('erro', 10);
    q.push('acerto', 10.05);
    q.push('outro', 10.1);
    expect(q.current(10.2)?.item).toBe('erro');
    expect(q.current(10 + MIN_SHOW_SECONDS)?.item).toBe('acerto');
    expect(q.current(10 + 2 * MIN_SHOW_SECONDS - 0.01)?.item).toBe('acerto');
    expect(q.current(10 + 2 * MIN_SHOW_SECONDS)?.item).toBe('outro');
  });

  it('um erro não segura a tela: o acerto seguinte aparece depois dos 250 ms', () => {
    const q = createShowQueue<string>(2.5);
    q.push('erro', 10);
    q.push('acerto', 10.4);
    expect(q.current(10.4)?.item).toBe('acerto');
  });

  it('cada entrada tem serial novo, para a animação recomeçar', () => {
    const q = createShowQueue<string>(1);
    q.push('a', 0);
    const first = q.current(0)!.serial;
    q.push('a', 0.5);
    expect(q.current(0.5)!.serial).toBe(first + 1);
  });

  it('com muitos esperando, os mais antigos saem e o texto alcança a música', () => {
    const q = createShowQueue<number>(1);
    for (let i = 0; i <= MAX_WAITING + 2; i++) q.push(i, 10 + i * 0.01);
    expect(q.current(10.1)?.item).toBe(0);
    expect(q.current(10 + MIN_SHOW_SECONDS)?.item).toBe(3);
  });

  it('clear limpa a tela e a fila', () => {
    const q = createShowQueue<string>(1);
    q.push('a', 0);
    q.push('b', 0.1);
    q.clear();
    expect(q.current(0.3)).toBeNull();
  });
});
