import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { Button } from '../components/Button/Button';
import { LEVEL_NAMES } from '../components/CountIn/countIn';
import { Kicker, Screen, ScreenTitle } from '../components/Screen/Screen';
import { ScoreStaff } from '../components/ScoreStaff/ScoreStaff';
import { noteName } from '../game/notation/editor';
import { importAndKeep, ImportError, type FileImportResult, type SongImporter } from '../services/songImport';
import { songCache } from '../services/songCache';
import { songKeys } from '../services/songs';
import { appImporter } from '../shell/editorImporter';
import { modesUrl } from '../shell/choice';
import { ROUTES } from '../shell/routes';

const Header = styled.header`display:flex; align-items:center; justify-content:space-between; gap:1rem;`;
const Body = styled.div`
  display:grid; grid-template-columns:22.5rem minmax(0,1fr); gap:1.5rem; min-height:0;
  @media(max-height:500px), (max-width:750px) { grid-template-columns:minmax(0,1fr); gap:0.75rem; }
`;
const Panel = styled.section`
  min-width:0; padding:1rem; display:flex; flex-direction:column; gap:1rem;
  background:${({ theme }) => theme.colors.surface}; border:2px solid ${({ theme }) => theme.colors.surfaceBorder}; border-radius:3px;
  font-size:0.875rem;
`;
const Actions = styled.div`display:flex; flex-wrap:wrap; align-items:center; gap:0.75rem;`;
const Drop = styled.label`
  position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0.75rem;
  min-height:10rem; padding:1rem; text-align:center; cursor:pointer; overflow-wrap:anywhere;
  border:2px dashed ${({ theme }) => theme.colors.primary.main}; background:${({ theme }) => theme.colors.surfaceHover};
  &:focus-within { outline:3px solid ${({ theme }) => theme.colors.primary.main}; outline-offset:3px; }
  input { position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; }
`;
const Facts = styled.dl`
  display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1rem;
  div {min-width:0; overflow-wrap:anywhere;} dt {font-size:0.75rem; color:${({ theme }) => theme.colors.textMuted};} dd {margin:0;}
`;
const Staff = styled.div`overflow:auto; max-height:12rem;`;
const OFFLINE = 'Importar precisa de internet. Conecte-se à rede para enviar a partitura.';
const ERRORS: Record<string,string> = {
  unknown_format:'Formato não reconhecido. Escolha MusicXML, MIDI ou ABC.',
  no_violin_part:'Nenhuma parte deste arquivo cabe no violino.',
  out_of_range:'A partitura tem notas fora da extensão do violino (Sol3 a Mi6).',
  too_large:'Arquivo grande demais. O limite é 1 MB.',
  limit_reached:'Você atingiu o limite de 50 músicas. Apague alguma na Biblioteca para importar outra.',
  unauthorized:'Sua sessão expirou. Reconecte-se e tente de novo; não precisa criar uma conta.',
};
export function importMessage(error: unknown): string {
  if (error instanceof ImportError) {
    if (error.code && ERRORS[error.code]) return ERRORS[error.code];
    if (error.kind === 'offline') return OFFLINE;
    if (error.kind === 'limit') return ERRORS.limit_reached;
    if (error.kind === 'invalid') return error.message;
  }
  return 'Não foi possível importar agora. Tente de novo em instantes.';
}

export const ImportSong: React.FC<{ importer?: SongImporter }> = ({ importer: given }) => {
  const location = useLocation();
  const [importer] = React.useState(() => given ?? appImporter());
  const queryClient = useQueryClient();
  const [online,setOnline] = React.useState(() => navigator.onLine);
  const [file,setFile] = React.useState<File | null>(null);
  const [result,setResult] = React.useState<FileImportResult | null>(null);
  const [partName,setPartName] = React.useState('Parte única');
  const [busy,setBusy] = React.useState(false);
  const lock = React.useRef(false);
  const [error,setError] = React.useState('');
  React.useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online',update); window.addEventListener('offline',update);
    return () => { window.removeEventListener('online',update); window.removeEventListener('offline',update); };
  },[]);
  const send = async (selected: File, part?: string) => {
    if (lock.current) return;
    setError(''); setResult(null); setFile(selected);
    if (!part) setPartName('Parte única');
    if (!/\.(musicxml|xml|mxl|mid|midi|abc)$/i.test(selected.name)) { setError(ERRORS.unknown_format); return; }
    if (selected.size > 1024 * 1024) { setError(ERRORS.too_large); return; }
    if (!navigator.onLine) { setError(OFFLINE); return; }
    lock.current = true; setBusy(true);
    try {
      const next = await importAndKeep(importer, selected, part, songCache);
      setResult(next);
      if (next.status === 'created') {
        await Promise.all([songKeys.mine,songKeys.saved].map(queryKey => queryClient.invalidateQueries({queryKey})));
      }
    } catch(e) { setError(importMessage(e)); }
    finally { lock.current = false; setBusy(false); }
  };
  const saved = result?.status === 'created' ? result : null;
  const song = saved?.saved.song;
  const libraryUrl = `${ROUTES.library}${location.search}`;
  return <Screen>
    <Header><div><Kicker>Biblioteca</Kicker><ScreenTitle>Importar música</ScreenTitle></div><Button as={Link} to={libraryUrl} $variant="ghost">Biblioteca</Button></Header>
    <ol aria-label="Etapas"><li aria-current={!result ? 'step' : undefined}>1 · Arquivo</li><li aria-current={result?.status === 'choose-part' ? 'step' : undefined}>2 · Escolher parte</li><li aria-current={saved ? 'step' : undefined}>3 · Pronta para tocar</li></ol>
    {!online && <p role="status">{OFFLINE}</p>}
    <Body>
      <Panel aria-label="Origem">
        <Actions><b>Arquivo</b><Button as={Link} to={`${ROUTES.editor}${location.search}`} $variant="ghost">Escrever ou ditar</Button></Actions>
        <Drop onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const dropped=e.dataTransfer.files[0]; if (dropped) void send(dropped); }}>
          <span aria-hidden="true">↑</span><b>Arraste a partitura aqui</b><span>ou escolha um arquivo</span>
          <input aria-label="Escolher partitura" type="file" accept=".musicxml,.xml,.mxl,.mid,.midi,.abc" disabled={busy || !online} onChange={e => { const chosen=e.target.files?.[0]; if(chosen) void send(chosen); e.target.value=''; }} />
        </Drop>
        <p>MusicXML (.musicxml, .xml, .mxl), MIDI (.mid, .midi) e ABC (.abc) · até 1 MB</p>
        <p>Use partituras de domínio público ou que você tenha direito de usar.</p>
        {file && <p style={{overflowWrap:'anywhere'}}>{file.name} · {Math.ceil(file.size/1024)} KB</p>}
        {busy && <div role="status"><p>Enviando e convertendo a partitura…</p><progress aria-label="Importando partitura" /></div>}
        {error && <div role="alert"><p>{error}</p><Button as={Link} to={libraryUrl} $variant="ghost">Ver na Biblioteca</Button>{file && online && <Button onClick={() => void send(file)} $variant="ghost">Tentar de novo</Button>}</div>}
      </Panel>
      <Panel aria-label="Revisar música" aria-busy={busy}>
        {result?.status === 'choose-part' && <><h2>Escolha a parte</h2>{result.parts.map(part => <Button key={part.id} disabled={!part.fits || busy || !online} $variant="ghost" onClick={() => {setPartName(part.name); if(file) void send(file,part.id);}}>{part.name} · {part.lowest === null ? 'Sem notas' : `${noteName(part.lowest,0)} – ${noteName(part.highest!,0)}`} · {part.fits ? 'Cabe no violino' : 'Não cabe no violino'}</Button>)}</>}
        {song && saved ? <>
          <h2>Prévia da música</h2>
          <Facts>{[['Título',song.title],['Compositor',song.composer || 'Não informado'],['Parte escolhida',partName],['Compasso',`${song.timeSignature.beats}/${song.timeSignature.unit}`],['Andamento',`${song.bpm} BPM`],['Níveis gerados',saved.levels.map(l=>LEVEL_NAMES[l]).join(' · ')]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</Facts>
          <Staff><ScoreStaff song={{...song, measures:song.measures.slice(0,3)}} cursor={0} selectedAt={null} onTap={() => undefined} /></Staff>
          <p role="status">✓ Salva na Biblioteca. Só você vê esta música; ela não entra em ranking nem desafio.</p>
          <Actions><Button as={Link} to={modesUrl(undefined,song.id)}>Jogar agora</Button><Button as={Link} to={libraryUrl} $variant="ghost">Ver na Biblioteca</Button></Actions>
        </> : !result && <><h2>Sua partitura, no jogo</h2><p>Escolha um arquivo para ver título, compositor, compasso, andamento e níveis gerados com dedilhado sugerido.</p><p>A importação precisa de internet. A música fica privada na sua Biblioteca.</p></>}
      </Panel>
    </Body>
  </Screen>;
};
