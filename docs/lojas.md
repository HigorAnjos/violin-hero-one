# Lojas: Google Play e App Store

Tudo o que o Higor precisa para publicar o Violin Hero (`app.violinhero`) na trilha de teste do Google Play e, quando
houver conta da Apple, no TestFlight. Os agentes nunca entram nas contas das lojas, nunca geram nem guardam chave de
assinatura e nunca a commitam: a chave nasce na máquina do Higor e só existe nos secrets do GitHub.

Resumo do que está pronto no repositório:

| O quê | Onde |
|---|---|
| AAB de release assinado | `.github/workflows/release-android.yml` (à mão ou na tag `v*`) |
| Envio ao TestFlight | `.github/workflows/testflight-ios.yml` (à mão; para com aviso enquanto faltar a conta) |
| Versão dos apps | `version` do `package.json` (regra abaixo) |
| Política de privacidade | https://violin-hero-one.vercel.app/privacidade |
| Exclusão de conta | no app: Configurações › Conta › Apagar minha conta (e no site, no mesmo lugar) |
| Ícone 512 e gráfico 1024×500 | `store/` (`npm run store:graphics` refaz, junto com os ícones nativos) |
| Capturas de tela | `store/screenshots/play/` (1920×1080) e `store/screenshots/appstore/` (2796×1290), por `npm run store:screenshots` |

## Versão (versionCode crescente)

A versão dos apps é o `version` do `package.json`, a mesma do site. O número interno que as lojas comparam sai dela:

```
versionCode = major × 1.000.000 + minor × 1.000 + patch      0.1.0 → 1000 · 0.1.1 → 1001 · 1.0.0 → 1000000
```

- Sempre cresce quando a versão sobe; `minor` e `patch` vão até 999 (o build recusa acima disso).
- **Cada AAB enviado à Play precisa de um versionCode que ela nunca viu**: antes de cada envio, suba a versão
  (`npm version patch --no-git-tag-version`, commit, e rode o workflow ou crie a tag `v0.1.1`).
- Na tag, o workflow confere que `v0.1.1` bate com `0.1.1` do `package.json`.
- No iOS a versão visível é a mesma e o número do build é `versionCode.rodada` (`1000.7`): dá para mandar mais de um
  build da mesma versão ao TestFlight.
- A conta está em `android/app/build.gradle` e em `scripts/app-version.mjs` (testada por `scripts/app-version.test.mjs`).

## Android (Google Play)

### 1. Gerar a chave de upload (uma vez, na sua máquina)

A Play usa duas chaves: a **chave de assinatura do app**, que fica com o Google (Play App Signing), e a **chave de
upload**, sua, que só prova que o AAB veio de você. Se a chave de upload vazar ou se perder, o Google troca por outra;
a de assinatura nunca sai de lá. Gere a de upload **fora do repositório**:

```bash
mkdir -p ~/chaves-violinhero && chmod 700 ~/chaves-violinhero
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore ~/chaves-violinhero/violinhero-upload.jks \
  -alias violinhero-upload \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Violin Hero, O=Violin Hero, C=BR"
```

O `keytool` pede uma senha. No formato PKCS12 a senha da chave é a mesma do arquivo: use a mesma nos dois secrets de
senha. Guarde o `.jks` e a senha num cofre (gerenciador de senhas) e numa cópia fora deste computador. O `.gitignore`
recusa `*.jks`, `*.keystore`, `*.p12` e `*.p8`, mas não guarde a chave dentro da pasta do projeto.

### 2. Cadastrar os secrets no GitHub

Com o `gh` logado no repositório (cada `gh secret set` sem `--body` pede o valor sem mostrar na tela):

```bash
base64 -w0 ~/chaves-violinhero/violinhero-upload.jks | gh secret set ANDROID_KEYSTORE_BASE64
gh secret set ANDROID_KEYSTORE_PASSWORD     # a senha do keytool
gh secret set ANDROID_KEY_ALIAS --body violinhero-upload
gh secret set ANDROID_KEY_PASSWORD          # a mesma senha (PKCS12)
```

Ou pela tela: Settings › Secrets and variables › Actions › New repository secret, com os mesmos quatro nomes (o
`ANDROID_KEYSTORE_BASE64` é a saída de `base64 -w0` do arquivo). Confira também as **variáveis** `SUPABASE_URL` e
`SUPABASE_ANON_KEY` (aba Variables): são as públicas do site; sem elas o job para, porque o app sairia sem conta.

### 3. Gerar o AAB

Actions › **Release Android** › Run workflow (ou `git tag v0.1.0 && git push origin v0.1.0`). Sem os secrets, o job para
no primeiro passo dizendo quais faltam. No fim, o AAB assinado fica no artefato `violin-hero-<versão>-<código>-aab`.

### 4. Criar o app na Play e a trilha de teste fechado

Conta pessoal nova na Play só libera produção depois de um **teste fechado com pelo menos 12 testadores inscritos por
14 dias seguidos**. Passo a passo:

1. Play Console › Criar app: nome `Violin Hero`, idioma padrão Português (Brasil), **Jogo**, **Gratuito**; aceite as
   declarações.
2. Configurar o app (painel “Configure seu app”): política de privacidade (URL acima), acesso ao app (tudo funciona sem
   login: “Todas as funcionalidades estão disponíveis sem restrições”), anúncios (**não**), classificação de conteúdo,
   público-alvo, Segurança dos dados, apps de governo (não), recursos financeiros (nenhum), saúde (não). As respostas
   estão nas seções abaixo.
3. Testar e lançar › Teste › **Teste fechado** › Criar faixa (ou usar a “Alpha”) › Testadores: crie uma lista de e-mails
   (contas Google) com **12 pessoas ou mais** (sugestão: 15, para sobrar se alguém sair) e salve. Copie o **link de
   participação** da faixa.
4. Criar versão › Play App Signing: aceite que o Google gerencie a chave de assinatura (o padrão). Envie o AAB do
   artefato, escreva as notas da versão em pt-BR e revise › Iniciar lançamento para teste fechado. A primeira revisão
   do Google leva de horas a alguns dias.
5. Mande o link de participação aos testadores: cada um abre o link **com a conta Google da lista**, aceita ser
   testador e instala pela Play. Os 14 dias contam a partir do dia em que há 12 inscritos, e eles precisam continuar
   inscritos (não precisam abrir todo dia, mas o Google pergunta depois como foi o teste: peça que usem de verdade).
6. Depois dos 14 dias: Painel › Solicitar acesso à produção, responda o questionário sobre o teste e aguarde a
   aprovação. Aí a mesma versão pode ser promovida para produção.

## iOS (App Store / TestFlight)

O job `TestFlight iOS` está pronto e para com a lista do que falta enquanto a conta não existe. O que criar na Apple:

1. **Apple Developer Program** (US$ 99/ano), como pessoa física ou com CNPJ. Anote o **Team ID** (Membership details).
2. **Identifiers** › App IDs › `+`: App, Bundle ID explícito **`app.violinhero`** (não muda depois), descrição
   “Violin Hero”. Capabilities: nenhuma extra (as notificações do lembrete são locais, sem push).
3. **App Store Connect** › Apps › `+` › Novo app: iOS, nome `Violin Hero`, idioma Português (Brasil), Bundle ID
   `app.violinhero`, SKU `violinhero`.
4. **Certificado Apple Distribution**: Certificates › `+` › Apple Distribution, com um CSR gerado no Mac (Acesso às
   Chaves › Assistente de Certificado) ou pelo `openssl`; instale, exporte como **.p12 com senha**. Fica fora do
   repositório, como a chave do Android.
5. **Chave da API do App Store Connect**: Users and Access › Integrations › App Store Connect API › `+`, papel
   **App Manager**. Baixe o `.p8` (só dá para baixar uma vez) e anote o **Key ID** e o **Issuer ID**.
6. Secrets no GitHub:

```bash
gh secret set APPLE_TEAM_ID
base64 -i distribution.p12 | gh secret set APPLE_DIST_CERT_P12_BASE64
gh secret set APPLE_DIST_CERT_PASSWORD
gh secret set APPLE_ASC_KEY_ID
gh secret set APPLE_ASC_ISSUER_ID
base64 -i AuthKey_XXXXXXXXXX.p8 | gh secret set APPLE_ASC_KEY_P8_BASE64
```

7. Actions › **TestFlight iOS** › Run workflow. O job arquiva com assinatura automática (o perfil de distribuição é
   criado pela chave da API), exporta o `.ipa` e manda ao TestFlight com `xcrun altool`. O build aparece em App Store
   Connect › TestFlight depois do processamento (uns 15 a 30 minutos). Testadores internos (até 100, da sua equipe)
   não precisam de revisão; externos passam pela revisão do TestFlight.

Na ficha da App Store: Privacidade do app (respostas equivalentes às da Segurança dos dados abaixo: e-mail, ID do
usuário, conteúdo de áudio, conteúdo gerado e dados de uso do jogo, todos **ligados à conta**, **sem rastreamento**),
classificação **4+**, categoria **Jogos › Música** (secundária Educação), URL da política e as capturas de
`store/screenshots/appstore/`.

> **Atenção (diretriz 4.8 da App Store):** app com login de terceiros (o “Entrar com Google”) precisa oferecer também
> um login equivalente que proteja a privacidade (o “Sign in with Apple” cumpre). O link mágico por e-mail é do próprio
> app e pode não bastar na revisão. Antes do primeiro envio à revisão, decida: ligar “Sign in with Apple” no Supabase
> e no app, ou esconder o botão do Google no iOS.

## Ficha da loja (pt-BR)

- **Nome:** Violin Hero
- **Categoria:** Jogo › Música (Play); Jogos › Música, secundária Educação (App Store)
- **Tags (Play):** Música, Educação, Ritmo
- **E-mail de contato:** _a definir pelo Higor_ (obrigatório na Play; o mesmo vai na política, em `src/pages/privacyPolicy.ts`)
- **Site:** https://violin-hero-one.vercel.app
- **Política de privacidade:** https://violin-hero-one.vercel.app/privacidade

### Descrição curta (até 80 caracteres)

```
Aprenda violino tocando de verdade: o jogo ouve a nota, o tempo e a afinação.
```

### Descrição completa (até 4000 caracteres)

```
Violin Hero é um jogo para aprender violino com o seu violino de verdade. As notas descem pela pista, você toca, e o microfone do celular ouve a nota, o tempo e a afinação de cada uma, na hora.

COMO FUNCIONA
• Escolha uma música, afine pelo afinador do próprio jogo e toque junto com a orquestra.
• Cada nota mostra a corda e o dedo. Acertou a nota no tempo e afinada? Perfeito! Desafinou um pouco? O cartão de afinação mostra para que lado corrigir.
• No fim, você vê os pontos, a precisão e a afinação de cada corda.

PARA QUEM ESTÁ COMEÇANDO E PARA QUEM JÁ TOCA
• Três níveis por música: Fácil, Médio e Difícil.
• Modo prática: repita só um trecho, mais devagar, quantas vezes quiser.
• Exercícios de cordas soltas, escalas e uma estante com músicas conhecidas.
• Modos Arcade, Partitura e Cordas 3D.

SUAS MÚSICAS
• Importe partituras em MusicXML, MIDI ou ABC, ou escreva a sua melodia no editor.
• O que você importa fica só com você.

PROGRESSO
• Recordes, selos, sequência de dias de prática e lembrete de prática no horário que você escolher.
• Ranking e desafios entre amigos com um nome divertido de bicho e número, sem mostrar seu nome ou e-mail.

PARA PROFESSORES E RESPONSÁVEIS
• O professor cria a turma, cadastra os alunos e passa tarefas.
• O aluno entra com o código da turma e um PIN, sem e-mail, grava a tarefa e envia.
• O professor ouve, dá nota e comenta; o responsável acompanha o progresso do filho.

FEITO PARA TODAS AS IDADES
• Sem anúncios e sem rastreamento.
• Comece sem cadastro: a conta é opcional e só serve para levar o progresso para outro aparelho.
• O microfone serve só para ouvir o violino: o som é analisado no próprio aparelho.
• Temas Caderno, Palco e 8-Bits, padrões para daltonismo e respeito à opção de reduzir movimento.

DICA
Para a melhor resposta, use fone com fio ou o alto-falante do aparelho. Fone Bluetooth atrasa o som.
```

## Classificação de conteúdo (questionário do IARC)

Responda pela realidade do app; o resultado esperado é **Livre (ClassInd L) / PEGI 3 / ESRB Everyone / 4+**.

| Pergunta | Resposta |
|---|---|
| Categoria | Jogo (não é só referência, notícia ou utilitário) |
| Violência, sangue, medo | Não |
| Sexualidade, nudez | Não |
| Linguagem imprópria | Não |
| Drogas, álcool, tabaco | Não |
| Jogos de azar, apostas simuladas | Não |
| Humor grosseiro | Não |
| Compras digitais / dinheiro dentro do app | Não |
| Os usuários podem interagir ou trocar conteúdo? | **Sim**, de forma limitada: o professor comenta as tarefas dos próprios alunos e o ranking/desafio mostra pontos com nome gerado (bicho + número). Não há chat, mensagem livre entre jogadores nem conteúdo público. |
| Compartilha a localização do usuário? | Não |
| Permite compras de itens digitais? | Não |
| É um navegador ou mecanismo de busca na web? | Não |

### Público-alvo e política de Famílias (Play)

O público inclui crianças. Em **Público-alvo e conteúdo**, marque as faixas de idade reais (por exemplo 6–8, 9–12,
13–15, 16–17 e 18+). Marcar qualquer faixa abaixo de 13 anos coloca o app sob a **política de Famílias do Google**:
o Google pode exigir a política de privacidade (já existe), proibir SDK de anúncio ou de análise não certificado (o app
não tem nenhum), conferir que o conteúdo é adequado e pedir que o app se declare na **Families Self-Certified**. A
revisão de apps de Famílias costuma demorar mais. Sem anúncios, responda “Não” em anúncios e não entre no programa
“Aprovado por professores” por enquanto (opcional, revisão própria).

## Segurança dos dados (formulário da Play)

Visão geral:

| Pergunta | Resposta |
|---|---|
| O app coleta ou compartilha algum dos tipos de dados exigidos? | **Sim** (coleta; não compartilha) |
| Todos os dados coletados são criptografados em trânsito? | **Sim** (HTTPS em toda chamada ao Supabase) |
| Você oferece uma forma de os usuários pedirem a exclusão dos dados? | **Sim**: no app (Configurações › Conta › Apagar minha conta) e no site, no mesmo lugar, com a política em `/privacidade` |
| Link da exclusão de conta (pedido na Play) | https://violin-hero-one.vercel.app/privacidade (seção “Seus direitos e como apagar”) |

Compartilhamento: **nenhum**. Supabase e Vercel são operadores (prestadores que processam em nome do app), o que a
Play não conta como compartilhamento. O som do microfone durante o jogo é analisado **só no aparelho** e não sai dele:
pela regra da Play, isso não é coleta.

| Tipo de dado (Play) | Coletado? | Obrigatório? | Para quê | Observação |
|---|---|---|---|---|
| Informações pessoais › Endereço de e-mail | Sim | Opcional | Gerenciamento da conta | Só de quem cria conta (link mágico ou Google); ninguém mais vê |
| Informações pessoais › Nome | Sim | Opcional | Funcionalidade do app | Nome do aluno que o professor cadastra; visível só na turma |
| Informações pessoais › IDs do usuário | Sim | Obrigatório | Funcionalidade, gerenciamento da conta | Identificador da conta (a anônima nasce no primeiro uso) |
| Áudio › Gravações de voz ou som | Sim | Opcional | Funcionalidade do app | Só a gravação da tarefa que o aluno envia; apagada 30 dias após a revisão |
| Atividade no app › Interações no app | Sim | Obrigatório | Funcionalidade, personalização | Partidas, pontos, precisão, recordes, selos, sequência |
| Atividade no app › Outro conteúdo gerado pelo usuário | Sim | Opcional | Funcionalidade do app | Músicas importadas/escritas (privadas), comentários do professor |
| Localização, contatos, fotos, arquivos, calendário, mensagens, saúde, finanças | Não | — | — | — |
| Informações e desempenho do app (falhas, diagnóstico) | Não | — | — | O diagnóstico de áudio só copia um texto, sem enviar |
| Identificadores do dispositivo | Não | — | — | Ver a nota sobre IP abaixo |

> **Revisão:** o login da turma guarda o IP de quem erra o PIN numa lista de bloqueio (prevenção de fraude), sem ligar
> à conta e hoje sem prazo de limpeza. Confirmar com o jurídico se entra no formulário (Segurança, prevenção de fraude)
> e definir um prazo de retenção.

## Permissões e motivos

Android (manifesto final, com os plugins):

| Permissão | Por quê |
|---|---|
| `INTERNET` | Falar com o servidor (conta, partidas, ranking, turmas) |
| `RECORD_AUDIO` | Ouvir o violino (nota, tempo, afinação) e gravar a tarefa da turma quando o aluno pede |
| `MODIFY_AUDIO_SETTINGS` | O WebView ajusta a rota e o processamento do áudio do microfone durante o jogo |
| `POST_NOTIFICATIONS` | Lembrete de prática (Android 13+), pedida só quando o jogador liga o lembrete |
| `RECEIVE_BOOT_COMPLETED` | Reagendar o lembrete depois que o celular reinicia (plugin de notificação local) |
| `WAKE_LOCK` | Mostrar o lembrete agendado na hora (plugin de notificação local) |
| ~~`SCHEDULE_EXACT_ALARM`~~ | Removida no manifesto: o lembrete é inexato, e a Play só aceita alarme exato em despertador e agenda |

Sem câmera, localização, contatos ou armazenamento. A tela acesa durante a partida usa a flag da janela, sem permissão.

iOS: `NSMicrophoneUsageDescription` (texto no `Info.plist`: ouvir o violino; gravar só a tarefa) e a permissão de
notificação, pedida quando o jogador liga o lembrete. `ITSAppUsesNonExemptEncryption = false` (só HTTPS do sistema).

## Gráficos e capturas

- `store/play-icon-512.png`: ícone da ficha (512×512).
- `store/feature-graphic-1024x500.png`: gráfico de destaque (PNG 24 bits, sem alfa, como a Play pede).
- `store/screenshots/play/*.png`: 4 capturas de celular deitado em 1920×1080 (inicial, jogo, biblioteca, afinar).
- `store/screenshots/appstore/*.png`: as mesmas em 2796×1290 (iPhone de 6,7"). A App Store pede ao menos as de 6,9"
  ou 6,7"; iPad só se o app for marcado para iPad.
- Tudo com dados de exemplo (apelido “Lia”, recordes inventados), sem servidor nem conta real. Refazer:
  `npm run store:graphics` e `E2E_PORT=4392 npm run store:screenshots`.
