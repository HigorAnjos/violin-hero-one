import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { AvatarPicker } from '../components/AvatarPicker/AvatarPicker';
import { Button } from '../components/Button/Button';
import { LevelCard } from '../components/LevelCard/LevelCard';
import { useRadioGroup } from '../components/RadioGroup/useRadioGroup';
import { Kicker, Lead, Screen, ScreenHeader, ScreenTitle } from '../components/Screen/Screen';
import {
  loadLocalProfile,
  NICKNAME_MAX,
  normalizeNickname,
  PLAYER_LEVELS,
  useSaveStartProfile,
  type Animal,
  type PlayerLevel,
} from '../services/profile';
import { ROUTES } from '../shell/routes';

interface LevelInfo {
  title: string;
  description: string;
  /** O que o jogador ganha ao escolher: dificuldade, velocidade da pista e tolerância de afinação. */
  start: { difficulty: string; examples: string; speed: string; speedHint: string; tolerance: string; toleranceHint: string };
}

export const LEVEL_INFO: Record<PlayerLevel, LevelInfo> = {
  never: {
    title: 'Nunca toquei',
    description: 'Começa segurando o arco e tocando as cordas soltas.',
    start: { difficulty: 'Dificuldade 1', examples: 'Cordas soltas, arco longo', speed: 'Pista 0,6×', speedHint: 'bem devagar', tolerance: 'Afinação ±40 ¢', toleranceHint: 'muito tolerante' },
  },
  beginner: {
    title: 'Estou começando',
    description: 'Menos de 1 ano. Escalas e músicas curtas, pista devagar.',
    start: { difficulty: 'Dificuldade 2', examples: 'Canon em Neon, Ode em Ré…', speed: 'Pista 0,8×', speedHint: 'mais tempo para ler', tolerance: 'Afinação ±30 ¢', toleranceHint: 'bem tolerante' },
  },
  some_songs: {
    title: 'Já toco algumas músicas',
    description: '1 a 3 anos. Músicas inteiras na 1ª posição.',
    start: { difficulty: 'Dificuldade 3', examples: 'Músicas inteiras, 1ª posição', speed: 'Pista 1×', speedHint: 'no andamento', tolerance: 'Afinação ±20 ¢', toleranceHint: 'tolerante' },
  },
  years: {
    title: 'Toco há anos',
    description: 'Posições altas, vibrato e músicas rápidas desde o início.',
    start: { difficulty: 'Dificuldade 4', examples: 'Posições altas, vibrato', speed: 'Pista 1,2×', speedHint: 'leitura rápida', tolerance: 'Afinação ±15 ¢', toleranceHint: 'mais exigente' },
  },
};

const DEFAULT_LEVEL: PlayerLevel = 'beginner';

const Progress = styled.span`
  display: flex;
  gap: 0.375rem;

  i {
    width: 2.25rem;
    height: 0.375rem;
    border-radius: ${({ theme }) => theme.borderRadius.pill};
    background-color: ${({ theme }) => theme.colors.surfaceBorder};
  }

  i:first-child {
    background-color: ${({ theme }) => theme.colors.text};
  }
`;

const Intro = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
`;

const Levels = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: ${({ theme }) => theme.spacing.md};

  @media (max-width: 720px) and (min-height: 501px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xs};
  }
`;

const Extras = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  align-items: stretch;

  @media (max-width: 900px) {
    flex-direction: column;
  }

  @media (max-height: 500px) {
    flex-direction: row;
    gap: ${({ theme }) => theme.spacing.xs};
  }
`;

const Panel = styled.section`
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: 1rem;
`;

const Summary = styled(Panel)`
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1.375rem;
  padding: 0.875rem 1.125rem;

  @media (max-height: 500px) {
    gap: 0.25rem 0.875rem;
    padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.sm}`};
  }
`;

const Fact = styled.span`
  display: flex;
  flex-direction: column;

  b {
    font-size: 1rem;
  }

  span {
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    b {
      font-size: 0.875rem;
    }

    span {
      display: none;
    }
  }
`;

const NamePanel = styled(Panel)`
  width: 22.5rem;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: 0.75rem 1rem;

  @media (max-width: 900px) and (min-height: 501px) {
    width: auto;
  }

  @media (max-height: 500px) {
    width: 18rem;
    padding: ${({ theme }) => `${theme.spacing.xxs} ${theme.spacing.sm}`};
    gap: ${({ theme }) => theme.spacing.xxs};
  }
`;

const NameLabel = styled.label`
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const NameRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const NameInput = styled.input`
  flex: 1;
  min-width: 0;
  min-height: 2.75rem;
  padding: 0 0.75rem;
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: 0.625rem;
  background-color: ${({ theme }) => theme.colors.surface};
  font-size: 0.9375rem;
  font-weight: 700;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textMuted};
    font-weight: 600;
  }

  &:focus-visible {
    border-color: ${({ theme }) => theme.colors.text};
  }
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: auto;

  > span {
    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    > span {
      font-size: 0.75rem;
    }
  }
`;

const Continue = styled(Button)`
  flex: none;
  min-height: 3.125rem;
  padding: 0 1.625rem;
`;

/** 0a · Seu nível: onde o jogador começa, apelido e avatar (opcionais). Grava e segue para o microfone. */
export const OnboardLevel: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const save = useSaveStartProfile();
  const [stored] = React.useState(loadLocalProfile);
  const [level, setLevel] = React.useState<PlayerLevel>(stored.level ?? DEFAULT_LEVEL);
  const [nickname, setNickname] = React.useState(stored.nickname ?? '');
  const [animal, setAnimal] = React.useState<Animal | null>(stored.animal ?? null);
  const radio = useRadioGroup(PLAYER_LEVELS, level, setLevel);
  const start = LEVEL_INFO[level].start;
  // Entrou direto (primeiro acesso): não há tela anterior para onde voltar
  const canGoBack = location.key !== 'default';

  const onContinue = () => {
    save.mutate({ level, nickname: normalizeNickname(nickname), animal });
    navigate(ROUTES.mic);
  };

  return (
    <Screen>
      <ScreenHeader>
        {canGoBack ? (
          <Button type="button" $variant="link" onClick={() => navigate(-1)}>
            <span aria-hidden="true">◂</span> Voltar
          </Button>
        ) : (
          <span />
        )}
        <Progress role="img" aria-label="Passo 1 de 3">
          <i />
          <i />
          <i />
        </Progress>
        <Button as={Link} to={ROUTES.mic} $variant="link">
          Pular
        </Button>
      </ScreenHeader>

      <Intro>
        <ScreenTitle $size="lg">Quanto você já toca?</ScreenTitle>
        <Lead $size="lg">Isso só ajusta onde você começa. Dá para mudar depois, e o jogo também se ajusta sozinho conforme você toca.</Lead>
      </Intro>

      <Levels role="radiogroup" aria-label="Seu nível">
        {PLAYER_LEVELS.map((value) => (
          <LevelCard key={value} level={value} title={LEVEL_INFO[value].title} description={LEVEL_INFO[value].description} radio={radio(value)} />
        ))}
      </Levels>

      <Extras>
        <Summary aria-label="Como vai ficar" aria-live="polite">
          <Kicker>Você vai começar com</Kicker>
          <Fact>
            <b>{start.difficulty}</b>
            <span>{start.examples}</span>
          </Fact>
          <Fact>
            <b>{start.speed}</b>
            <span>{start.speedHint}</span>
          </Fact>
          <Fact>
            <b>{start.tolerance}</b>
            <span>{start.toleranceHint}</span>
          </Fact>
        </Summary>
        <NamePanel aria-label="Seu apelido">
          <NameLabel htmlFor="apelido">Como te chamamos? (opcional)</NameLabel>
          <NameRow>
            <NameInput
              id="apelido"
              value={nickname}
              maxLength={NICKNAME_MAX}
              autoComplete="nickname"
              placeholder="Seu apelido"
              onChange={(e) => setNickname(e.target.value)}
            />
            <AvatarPicker value={animal} onChange={setAnimal} />
          </NameRow>
        </NamePanel>
      </Extras>

      <Footer>
        <span>Não sabe? Escolha "Estou começando": se estiver fácil, o jogo sobe a dificuldade depois de 3 músicas.</span>
        <Continue type="button" onClick={onContinue}>
          Continuar <span aria-hidden="true">▸</span>
        </Continue>
      </Footer>
    </Screen>
  );
};
