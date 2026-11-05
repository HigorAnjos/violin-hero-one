/**
 * Celular em pé: retrato e até 600 px de largura. Pega todo celular em pé (360 a 480 px) e deixa de fora o tablet em
 * pé (744 px ou mais) e o celular deitado (o corte de altura de 500 px), que seguem com os layouts de sempre.
 */
export const PORTRAIT_QUERY = '(max-width: 600px) and (orientation: portrait)';

/** O mesmo corte nos estilos: `${portrait} { ... }`. */
export const portrait = `@media ${PORTRAIT_QUERY}`;
