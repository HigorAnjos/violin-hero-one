import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../../shell/testing';
import { initialTuner } from './tuner';
import { stringStatus, Tuner } from './Tuner';

const renderTuner = (a4: number, onA4 = vi.fn()) => renderScreen(<Tuner a4={a4} onA4={onA4} state={initialTuner()} />);
const reference = () => screen.getByRole('group', { name: 'Lá de referência' });
/** O "···" só aparece no celular deitado: escondido no jsdom, fica sem nome acessível e sai do getByRole. */
const more = () => screen.getByLabelText('Outro Lá', { selector: 'button' });

describe('Tuner', () => {
  it('estado da corda: o primeiro caractere é o sinal que sobra no celular', () => {
    expect(stringStatus('live', null)).toBe('● Ouvindo agora');
    expect(stringStatus('tuned', 3)).toBe('✓ Afinada · +3 ¢');
    expect(stringStatus('pending', null)).toBe('○ Pendente');
  });

  it('celular: "···" troca os atalhos 440/442/443 pelo −/+ e o 415, e volta', async () => {
    renderTuner(442);
    expect(more()).toHaveAttribute('aria-expanded', 'false');
    expect(reference()).not.toHaveAttribute('data-more');
    expect(screen.getByRole('button', { name: '442' })).toHaveAttribute('data-common');
    expect(screen.getByRole('button', { name: '415 barroco' })).toHaveAttribute('data-more');
    await userEvent.click(more());
    expect(more()).toHaveAttribute('aria-expanded', 'true');
    expect(reference()).toHaveAttribute('data-more');
    await userEvent.click(more());
    expect(reference()).not.toHaveAttribute('data-more');
  });

  it('celular: com um Lá fora dos atalhos comuns, abre já com o −/+ à vista', () => {
    renderTuner(415);
    expect(more()).toHaveAttribute('aria-expanded', 'true');
    expect(reference()).toHaveAttribute('data-more');
  });

  it('os atalhos e o −/+ mudam o Lá', async () => {
    const onA4 = vi.fn();
    renderTuner(442, onA4);
    await userEvent.click(screen.getByRole('button', { name: '443' }));
    await userEvent.click(screen.getByRole('button', { name: 'Diminuir 1 Hz' }));
    expect(onA4.mock.calls).toEqual([[443], [441]]);
  });
});
