import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { palcoTheme } from '../../assets/styles/themes/palco';
import { renderScreen } from '../../shell/testing';
import { OpenStringCard } from './OpenStringCard';

const inList = (ui: React.ReactElement) => <ul>{ui}</ul>;

describe('OpenStringCard', () => {
  it('corda ouvida mostra o desvio médio', () => {
    renderScreen(inList(<OpenStringCard string={0} state="heard" cents={-2} />));
    expect(screen.getByRole('listitem', { name: 'Sol (G): Ouvida · −2 ¢' })).toBeInTheDocument();
    expect(screen.getByText('Sol · a mais grossa')).toBeInTheDocument();
    expect(screen.getByText('196,9 Hz')).toBeInTheDocument();
  });

  it('corda da vez mostra quanto já segurou e o desvio ao vivo', () => {
    renderScreen(inList(<OpenStringCard string={2} state="listening" cents={4} heldSeconds={1.2} />), { theme: palcoTheme });
    expect(screen.getByRole('progressbar', { name: 'Segurando' })).toHaveAttribute('aria-valuenow', '60');
    expect(screen.getByText('● Ouvindo · +4 ¢')).toBeInTheDocument();
    expect(screen.getByText('442,0 Hz')).toBeInTheDocument();
  });

  it('corda da vez em silêncio pede para tocar; a seguinte espera', () => {
    renderScreen(
      inList(
        <>
          <OpenStringCard string={1} state="listening" cents={null} />
          <OpenStringCard string={3} state="next" cents={null} a4={440} />
        </>
      )
    );
    expect(screen.getByText('● Toque agora')).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Mi (E): Próxima' })).toHaveTextContent('659,3 Hz');
  });
});
