/**
 * Texto da política de privacidade (rota /privacidade). Cada afirmação foi conferida no código e no banco (ciclo 6):
 * se o app mudar o que guarda ou com quem fala, este texto muda junto. `review`: trecho que pede revisão jurídica
 * (o Higor decidiu publicar antes, ciclo 5); a tela marca cada um.
 */
export interface PrivacySection {
  id: string;
  title: string;
  paragraphs: readonly string[];
  items?: readonly string[];
  review?: boolean;
}

/** Data da versão publicada (muda junto com o texto). */
export const PRIVACY_UPDATED_AT = '2026-11-03';

/** E-mail de contato para privacidade: vazio até o Higor definir (a tela diz que ainda será publicado). */
export const PRIVACY_CONTACT_EMAIL = '';

export const PRIVACY_SECTIONS: readonly PrivacySection[] = [
  {
    id: 'quem',
    title: 'Quem somos',
    paragraphs: [
      'O Violin Hero é um jogo para aprender violino tocando um violino de verdade: o microfone ouve a nota, o tempo e a afinação. ' +
        'Ele funciona no navegador (violin-hero-one.vercel.app) e nos apps para Android e iOS, com as mesmas regras.',
      'O público inclui crianças. Por isso guardamos o mínimo para o jogo funcionar e nada além disso.',
      'O responsável pelos dados (controlador) é o desenvolvedor do Violin Hero, pessoa física.',
    ],
    review: true,
  },
  {
    id: 'coleta',
    title: 'O que guardamos e para quê',
    paragraphs: ['Tudo o que fica no servidor serve para o jogo funcionar e guardar o seu progresso:'],
    items: [
      'Convidado: no primeiro uso o app cria uma conta anônima, sem nome nem e-mail, só com um identificador.',
      'Conta (opcional): o e-mail, se você entra pelo link mágico, ou a conta Google, se entra pelo Google. O e-mail serve só para entrar: não aparece para ninguém.',
      'Perfil: apelido (só você vê), o bicho escolhido, nível, Lá de referência, latência medida e tema.',
      'Nome público: no ranking e nos desafios você aparece como o bicho e um número sorteado (por exemplo, “Raposa 4821”), nunca pelo apelido nem pelo e-mail.',
      'Partidas: música, nível, pontos, acertos, afinação média por corda, duração e data; e, a partir delas, recordes, selos, dias de prática e sequência.',
      'Músicas que você importa ou escreve: o arquivo e a partitura ficam privados, só para você.',
      'Desafios que você cria ou aceita: a música, o prazo e os pontos de quem entrou.',
    ],
  },
  {
    id: 'microfone',
    title: 'Microfone',
    paragraphs: [
      'O microfone serve só para ouvir o violino. A nota, o tempo e a afinação são calculados no próprio aparelho, e o som não sai dele.',
      'A única exceção é a tarefa da turma: o aluno pode gravar a partida da tarefa e enviar ao professor. A gravação fica só na memória até o aluno pedir o envio.',
    ],
  },
  {
    id: 'turmas',
    title: 'Turmas, alunos e responsáveis',
    paragraphs: [
      'O professor (conta com e-mail) cria a turma e cadastra cada aluno pelo nome. O aluno entra com o código da turma, o nome e um PIN, sem e-mail. ' +
        'O PIN é guardado só de forma cifrada (hash).',
      'O nome do aluno aparece só dentro da turma: para o professor, para o próprio aluno e para o responsável ligado a ele. Fora da turma, ranking e desafios não mostram o aluno.',
      'Tarefas, entregas, nota e comentário do professor ficam visíveis para o aluno, o professor da turma e o responsável.',
      'O áudio da entrega é ouvido só pelo aluno, pelo professor da turma e pelo responsável. Ele é apagado 30 dias depois da revisão do professor; ' +
        'se nunca for revisado, 30 dias depois do prazo da tarefa.',
      'Para conter tentativas de adivinhar o PIN, o login da turma guarda o endereço IP de quem erra, numa lista de bloqueio sem ligação com a conta.',
    ],
    review: true,
  },
  {
    id: 'aparelho',
    title: 'No seu aparelho',
    paragraphs: [
      'Progresso, preferências e as partidas que ainda não subiram ficam guardados no próprio aparelho (armazenamento do navegador ou do app), ' +
        'para o jogo funcionar sem internet. Sair da conta ou apagá-la limpa esses dados do aparelho.',
      'O lembrete de prática é uma notificação do próprio aparelho: o horário não vai para o servidor.',
    ],
  },
  {
    id: 'nao',
    title: 'O que não fazemos',
    paragraphs: [],
    items: [
      'Não mostramos anúncios.',
      'Não usamos rastreamento, ferramentas de análise de uso nem cookies de terceiros.',
      'Não vendemos nem alugamos dados a ninguém.',
      'Não pedimos localização, contatos, fotos ou câmera.',
    ],
  },
  {
    id: 'operadores',
    title: 'Com quem os dados ficam',
    paragraphs: ['Usamos serviços que guardam ou transportam os dados em nosso nome (operadores), só para o jogo funcionar:'],
    items: [
      'Supabase: banco de dados, login e arquivos de áudio das entregas.',
      'Vercel: hospeda o site do jogo.',
      'Google: só se você escolher entrar com a conta Google.',
    ],
    review: true,
  },
  {
    id: 'seguranca',
    title: 'Segurança',
    paragraphs: [
      'Toda conexão com o servidor é cifrada (HTTPS). No banco, cada pessoa só lê o que é dela ou da turma dela, por regras conferidas em testes automáticos. ' +
        'O app nunca leva chaves de administrador.',
    ],
  },
  {
    id: 'direitos',
    title: 'Seus direitos e como apagar',
    paragraphs: [
      'Você pode ver e mudar seu perfil no próprio jogo, e apagar tudo a qualquer momento em Configurações › Conta › Apagar minha conta ' +
        '(no convidado, “Apagar meus dados”). A exclusão tira do servidor o perfil, as partidas, os recordes, os selos, as músicas, os desafios e os vínculos, e não dá para desfazer.',
      'Professor que apaga a conta leva junto as turmas, as tarefas, as entregas e as contas dos alunos delas.',
      'A conta de aluno da turma é apagada pelo professor, na área do professor (o aluno sai da turma e o professor toca em Apagar): ' +
        'saem o cadastro, as entregas, o vínculo do responsável e a conta com todo o progresso. O aluno ou o responsável pede ao professor.',
      'Para outros pedidos (acesso, correção, dúvida), escreva para o contato abaixo.',
    ],
    review: true,
  },
  {
    id: 'mudancas',
    title: 'Mudanças nesta política',
    paragraphs: ['Quando o jogo passar a guardar algo novo, este texto muda antes, com a data nova no topo.'],
  },
];
