# Áudio do microfone falso (e2e)

O Chromium do e2e usa um WAV no lugar do microfone (`--use-file-for-fake-audio-capture`). A fixture
`micPage(take)` de `e2e/microphone.ts` abre um navegador próprio com o arquivo escolhido pelo teste.

## Gravações

| Nome (`<nome>.wav`)          | O que é                                                    | Repete? |
| ---------------------------- | ---------------------------------------------------------- | ------- |
| `cordas-soltas`              | Sol, Ré, Lá e Mi soltas, ~2,5 s cada, do grave ao agudo     | sim     |
| `escala-re-maior`            | Escala de Ré maior a 60 BPM, sem vibrato                   | não     |
| `escala-re-maior-vibrato`    | A mesma, com vibrato                                       | não     |
| `ode-a-alegria`              | Ode à Alegria inteira, bem tocada                          | não     |
| `ode-a-alegria-3-erros`      | A mesma com 3 erros (abaixo)                               | não     |
| `silencio`                   | 10 s de sala em silêncio                                   | sim     |
| `tv`                         | 10 s de TV ligada (gente falando)                          | sim     |

Os 3 erros da Ode, por índice de ataque (contando de 0, sem as ligaduras):

- **10** (compasso 3, o Mi): nota errada — sai Sol;
- **27** (compasso 8, o Mi pontuado): atrasada **entre 220 e ~470 ms** (janela Bom + `ATTEMPT_MARGIN_SECONDS`) — mais que isso o motor dá "não tocada";
- **46** (compasso 12, o Lá de 2 tempos): desafinada **entre 50 e 75 ¢** (alta) — mais que isso vira nota errada.

## Sintéticas e reais

As sintéticas são geradas a cada `npm run test:e2e` (globalSetup) em `e2e/audio/synthetic/`, a partir de
`content/songs/` e de `src/game/audio/testing/e2eTakes.ts`; não vão para o git (~14 MB, deterministas).
Os testes unitários de `e2eTakes.test.ts` passam cada uma pelo Ouvido e pelo Motor de verdade.

Para usar uma gravação real, ponha o arquivo aqui em `e2e/audio/` com o nome da tabela. Ela passa a valer
sozinha, no lugar da sintética de mesmo nome. Para comparar, `E2E_AUDIO=sintetico npm run test:e2e` ignora
as reais.

Formato: WAV PCM 16, 24 ou 32 bits, ou float 32; mono ou estéreo; qualquer taxa. Para as músicas, comece a
gravar antes da primeira nota e toque no metrônomo do BPM da música: o setup corta ou completa o começo para a
primeira nota cair 2,1 s depois da abertura do microfone (o começo da partida mais a latência padrão) e grava a
cópia em `e2e/audio/aligned/`. Silêncio, TV e cordas soltas são usados como estão.
