# Partituras de teste da importação

Cinco partituras reais, de domínio público ou CC0, usadas pelos testes do conversor (`src/game/notation/importScore.test.ts`)
e da Edge Function `import-song` (`scripts/test-functions.mjs`). Não entram no catálogo nem no app.

| Arquivo | Obra | Formato | O que exercita | Fonte | Licença |
|---|---|---|---|---|---|
| `lehmann-the-yellowhammer.mxl` | Liza Lehmann (1862–1918), *Bird Songs* nº 3, "The Yellowhammer" | MusicXML comprimido | 2 partes (voz e piano: escolhe a voz), 14 ligaduras e 31 pausas na voz | OpenScore Lieder Corpus, `scores/Lehmann,_Liza/Bird_Songs/3_The_Yellowhammer/lc6421659.mxl` — <https://github.com/OpenScore/Lieder> | CC0 1.0 (corpus inteiro; obra em domínio público) |
| `brahms-heimweh-1.musicxml` | Johannes Brahms (1833–1897), Op. 63 nº 7, "Heimweh I" | MusicXML | 2 partes, mudança de compasso (3/4 ↔ 2/4), 356 KB | OpenScore Lieder Corpus, `scores/Brahms,_Johannes/9_Lieder_und_Gesänge,_Op.63/7_Heimweh_I/lc5936324.mxl` (o `score.xml` de dentro do .mxl, sem alteração) | CC0 1.0 (`<rights>OpenScore (CC0)</rights>`) |
| `baltzar-prelude.mid` | Thomas Baltzar (c.1631–1663), *The Division Violin* nº 13, "A Prelude for the Violin" | MIDI | violino solo, 455 notas, cordas duplas (fica a mais aguda), tercinas de fusa, até o Dó 6 | Mutopia Project #95 — <https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=95> | Public Domain |
| `soldiers-joy.mid` | "Soldier's Joy" (tradicional) | MIDI | 2 trilhas (melodia e acordes, nenhuma marcada como violino: escolhe a mais aguda), anacruse | Mutopia Project #510 — <https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=510> | Public Domain |
| `red-apple-rag.abc` | "Red Apple Rag" (tradicional) | ABC | repetição com 1ª e 2ª casa nas duas partes, anacruse, arcadas, ligaduras de expressão, cifras | transcrição nossa, nota a nota, da edição do Mutopia Project #529 — <https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=529>; o MIDI dessa edição confere a transcrição nos testes | Public Domain (fonte); a transcrição em ABC também vai como CC0 |

Os arquivos do OpenScore e do Mutopia estão byte a byte como baixados em 27/10/2026, salvo o `brahms-heimweh-1.musicxml`,
que é o MusicXML de dentro do `.mxl` original (descompactado, sem edição).
