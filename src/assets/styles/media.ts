import { css } from 'styled-components';

/**
 * Celular em pé: retrato e até 600 px de largura. Pega todo celular em pé (360 a 480 px) e deixa de fora o tablet em
 * pé (744 px ou mais) e o celular deitado (o corte de altura de 500 px), que seguem com os layouts de sempre.
 */
export const PORTRAIT_QUERY = '(max-width: 600px) and (orientation: portrait)';

/** O mesmo corte nos estilos: `${portrait} { ... }`. */
export const portrait = `@media ${PORTRAIT_QUERY}`;

/**
 * Telas que cabem na janela (altura fixa, rolagem por dentro): em pé, a página cresce com o conteúdo e rola inteira,
 * com o recuo longe do entalhe e da barra de gestos.
 */
export const portraitScroll = css`
  ${portrait} {
    height: auto;
    min-height: 100vh;
    min-height: 100dvh;
    overflow: visible;
    padding: max(1.25rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1.25rem, env(safe-area-inset-bottom))
      max(1rem, env(safe-area-inset-left));
  }
`;
