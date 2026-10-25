# Violin Hero — telas

47 telas e componentes do canvas de design, versão de 22/10/2026.

## Como abrir

- Os arquivos `.dc.html` são o código-fonte das telas do canvas (HTML + CSS inline, com marcações `{{ }}`, `<sc-for>` e `<dc-import>` do canvas).
- Eles renderizam completos dentro do canvas de design. Abertos direto no navegador, a maioria aparece, mas listas geradas por script e componentes importados (Orquestra, Faixa de partitura, Selo) ficam vazios.
- `ds/violinhero/` tem os tokens do design system (cores, fontes) e os estilos compartilhados.
- `canvas.json` guarda a posição e o título de cada tela no canvas.

## Telas

| Título | Arquivo | Tamanho |
|---|---|---|
| 1 · Tela inicial | `Main.dc.html` | 1280×720 |
| 2 · Escolha de modo | `ModeSelect.dc.html` | 1280×720 |
| 3 · Seleção de música | `SongSelect.dc.html` | 1280×720 |
| 4 · Afinação e calibração | `Calibration.dc.html` | 1280×720 |
| 5 · Gameplay (Arcade) | `Gameplay.dc.html` | 1280×720 |
| 6 · Pausa | `Pause.dc.html` | 1280×720 |
| 7 · Resultado | `Results.dc.html` | 1280×720 |
| Componente · Faixa de partitura | `SheetStrip.dc.html` | 1200×112 |
| 5b · Gameplay (Partitura) | `GameplaySheet.dc.html` | 1280×720 |
| 5c · Gameplay (Cordas 3D) | `Gameplay3D.dc.html` | 1280×720 |
| 0 · Boas-vindas (sem cadastro) | `Login.dc.html` | 1280×720 |
| 8 · Biblioteca | `Library.dc.html` | 1280×720 |
| 9 · Importar música | `Import.dc.html` | 1280×720 |
| 9b · Escrever partitura | `ScoreEditor.dc.html` | 1280×720 |
| 0b · Primeira vez: microfone | `OnboardMic.dc.html` | 1280×720 |
| 0c · Primeira vez: cordas soltas | `OnboardTest.dc.html` | 1280×720 |
| 5d · Feedback de erros | `GameplayErrors.dc.html` | 1280×720 |
| 10 · Modo prática | `Practice.dc.html` | 1280×720 |
| 11 · Perfil e progresso | `Profile.dc.html` | 1280×720 |
| 4b · Contagem antes de começar | `Countdown.dc.html` | 1280×720 |
| 6b · A orquestra parou | `GameOver.dc.html` | 1280×720 |
| 12 · Configurações | `Settings.dc.html` | 1280×720 |
| 13 · Ranking e selos | `Ranking.dc.html` | 1280×720 |
| Componente · Selo | `Badge.dc.html` | 44×48 |
| Componente · Orquestra | `Orchestra.dc.html` | 1280×330 |
| Celular · Início | `MobileMain.dc.html` | 844×390 |
| Celular · Biblioteca | `MobileLibrary.dc.html` | 844×390 |
| Celular · Afinar | `MobileCalibration.dc.html` | 844×390 |
| Celular · Gameplay | `MobileGameplay.dc.html` | 844×390 |
| 8b · Biblioteca vazia | `LibraryEmpty.dc.html` | 1280×720 |
| 4c · Carregando (sem internet) | `Loading.dc.html` | 1280×720 |
| 15 · Planos | `Plans.dc.html` | 1280×720 |
| 16 · Desafiar amigo | `Challenge.dc.html` | 1280×720 |
| 16b · Card para compartilhar (1080×1350) | `ShareCard.dc.html` | 1080×1350 |
| 18 · Lembrete de prática | `Reminder.dc.html` | 390×844 |
| 7a · Selo conquistado (antes do resultado) | `BadgeEarned.dc.html` | 1280×720 |
| A1 · Aluno: entrar na turma | `JoinClass.dc.html` | 1280×720 |
| A2 · Aluno: tarefas e recados | `StudentTasks.dc.html` | 1280×720 |
| A3 · Aluno: enviar tarefa | `TaskResult.dc.html` | 1280×720 |
| P1 · Professor: painel da turma | `Teacher.dc.html` | 1280×720 |
| P2 · Professor: nova tarefa | `AssignTask.dc.html` | 1280×720 |
| P3 · Professor: revisar entrega | `TeacherReview.dc.html` | 1280×720 |
| 0a · Primeira vez: seu nível | `OnboardLevel.dc.html` | 1280×720 |
| 0d · Conta só quando precisa | `GuestPrompt.dc.html` | 1280×720 |
| A0 · Aluno sem e-mail: entrar pela turma | `ClassLogin.dc.html` | 1280×720 |
| 5e · Microfone com problema (tweak: estado) | `MicTrouble.dc.html` | 1280×720 |
| R1 · Responsável (celular) | `Parent.dc.html` | 390×844 |
