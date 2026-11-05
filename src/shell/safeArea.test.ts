import { describe, expect, it } from 'vitest';
import { safeAreaInsets } from './safeArea';

describe('safeAreaInsets', () => {
  it('sem entalhe (o jsdom não conhece env()): zero dos dois lados, e não deixa a prova na página', () => {
    expect(safeAreaInsets()).toEqual({ left: 0, right: 0 });
    expect(document.body.children).toHaveLength(0);
  });
});
