import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cadernoTheme } from '../assets/styles/themes';
import { palcoTheme } from '../assets/styles/themes/palco';
import { pixelTheme } from '../assets/styles/themes/specials';
import { fakeSongImporter, ImportError } from '../services/songImport';
import { renderScreen } from '../shell/testing';
import { ImportSong } from './ImportSong';

afterEach(() => vi.restoreAllMocks());
const file = (name = 'minueto.xml') => new File(['partitura'], name);
function choose(selected = file()) {fireEvent.change(screen.getByLabelText('Escolher partitura'), {target:{files:[selected]}});}

describe.each([['Caderno',cadernoTheme],['Palco',palcoTheme],['8-Bits',pixelTheme]] as const)('Importar em %s', (_name,theme) => {
  describe.each([[1280,720],[844,390]])('%i×%i', (width,height) => {
    const render = (importer = fakeSongImporter()) => {
      Object.defineProperty(window,'innerWidth',{configurable:true,value:width});
      Object.defineProperty(window,'innerHeight',{configurable:true,value:height});
      renderScreen(<ImportSong importer={importer} />, {theme});
      return importer;
    };
    it('created mostra dados, níveis, privacidade e Jogar agora', async () => {
      render(); choose();
      const play = await screen.findByRole('link',{name:'Jogar agora'});
      expect(screen.getByRole('region',{name:'Revisar música'})).toHaveTextContent('minueto');
      expect(screen.getByText('80 BPM')).toBeInTheDocument();
      expect(screen.getByText('Fácil')).toBeInTheDocument();
      expect(screen.getByText(/Só você vê/)).toBeInTheDocument();
      await userEvent.click(play);
      expect(screen.getByTestId('location')).toHaveTextContent('/tocar?musica=importada-1');
    });
    it('choose-part reenvia o mesmo arquivo e guarda a parte escolhida', async () => {
      const importer=render(); const selected=file('quarteto.mid');
      const spy=vi.spyOn(importer,'importFile'); choose(selected);
      await userEvent.click(await screen.findByRole('button',{name:/Violino II/}));
      await screen.findByRole('link',{name:'Jogar agora'});
      expect(spy).toHaveBeenLastCalledWith(selected,'P2');
      expect(screen.getByText('Violino II')).toBeInTheDocument();
    });
    it.each([
      ['unknown_format',/Formato não reconhecido/],['no_violin_part',/Nenhuma parte/],
      ['out_of_range',/notas fora da extensão/],['file_too_large',/Arquivo grande demais/],
      ['limit_reached',/limite de 50 músicas/],['unauthorized',/sessão expirou/],
      ['server',/Não foi possível importar agora/],['invalid_file',/Arquivo inválido/],
    ] as const)('traduz %s', async (code,message) => {
      const importer=fakeSongImporter(); importer.importFile=vi.fn().mockRejectedValue(new ImportError(code === 'server' || code === 'unauthorized' ? 'server':'invalid',undefined,'Arquivo inválido',code));
      render(importer); choose(); expect(await screen.findByRole('alert')).toHaveTextContent(message);
    });
    it('offline é informado antes de enviar e atualiza ao reconectar', async () => {
      vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
      const importer=render(); const spy=vi.spyOn(importer,'importFile');
      expect(screen.getByRole('status')).toHaveTextContent('Importar precisa de internet');
      expect(screen.getByLabelText('Escolher partitura')).toBeDisabled();
      choose(); expect(spy).not.toHaveBeenCalled();
      vi.spyOn(navigator,'onLine','get').mockReturnValue(true);
      act(()=>window.dispatchEvent(new Event('online')));
      expect(screen.getByLabelText('Escolher partitura')).toBeEnabled();
    });
  });
});
it('recusa extensão e tamanho antes do envio e mostra progresso sem porcentagem inventada', async () => {
  const importer=fakeSongImporter(); const spy=vi.spyOn(importer,'importFile');
  renderScreen(<ImportSong importer={importer}/>);
  choose(file('musica.exe')); expect(screen.getByRole('alert')).toHaveTextContent('Formato não reconhecido');
  choose(new File([new Uint8Array(1024*1024+1)],'grande.xml')); expect(screen.getByRole('alert')).toHaveTextContent('Arquivo grande demais');
  expect(spy).not.toHaveBeenCalled();
  spy.mockReturnValue(new Promise(()=>undefined)); choose();
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('value');
});
it('arrastar e soltar envia o arquivo', async () => {
  renderScreen(<ImportSong importer={fakeSongImporter()}/>);
  fireEvent.drop(screen.getByLabelText('Escolher partitura').parentElement!, {dataTransfer:{files:[file()]}});
  expect(await screen.findByRole('link',{name:'Jogar agora'})).toBeInTheDocument();
});
