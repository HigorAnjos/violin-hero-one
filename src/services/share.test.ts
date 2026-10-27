import { afterEach, describe, expect, it, vi } from 'vitest';
import { challengeLink, challengeUrl, newChallengeUrl } from '../shell/choice';
import { copyText, shareFile, shareLink } from './share';

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'violin-hero.png', { type: 'image/png' });
const abort = () => new DOMException('fechou', 'AbortError');

afterEach(() => vi.restoreAllMocks());

describe('shareFile', () => {
  it('com Web Share de arquivo: manda a imagem pela folha do aparelho', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    const file = png();
    expect(await shareFile(file, { title: 'Meu placar', text: 'Consegue?' }, { share, canShare })).toBe('shared');
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'Meu placar', text: 'Consegue?' });
  });

  it('sem suporte a arquivo: baixa o PNG com o nome do arquivo', async () => {
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(`${this.download} ${this.getAttribute('href')}`);
    });
    expect(await shareFile(png(), { title: 't' }, { share: vi.fn(), canShare: () => false })).toBe('downloaded');
    expect(await shareFile(png(), { title: 't' }, {})).toBe('downloaded');
    expect(created).toHaveBeenCalledTimes(2);
    expect(clicks).toEqual(['violin-hero.png blob:x', 'violin-hero.png blob:x']);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('fechar a folha não baixa; folha que falha baixa', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    expect(await shareFile(png(), { title: 't' }, { share: vi.fn().mockRejectedValue(abort()), canShare: () => true })).toBe('cancelled');
    expect(await shareFile(png(), { title: 't' }, { share: vi.fn().mockRejectedValue(new Error('x')), canShare: () => true })).toBe('downloaded');
  });
});

describe('shareLink e copyText', () => {
  it('folha do aparelho quando existe; sem ela, copia; sem área de transferência, falha', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    expect(await shareLink('https://x/desafio/a', { title: 't', text: 'x' }, { share })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ url: 'https://x/desafio/a', title: 't', text: 'x' });
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await shareLink('https://x/desafio/a', { title: 't', text: 'x' }, { clipboard: { writeText } })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://x/desafio/a');
    expect(await shareLink('u', { title: 't', text: 'x' }, { share: vi.fn().mockRejectedValue(abort()) })).toBe('cancelled');
    expect(await copyText('u', {})).toBe('failed');
    expect(await copyText('u', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('negado')) } })).toBe('failed');
  });
});

describe('endereços do desafio', () => {
  it('montar com a partida, o link interno e o completo', () => {
    expect(newChallengeUrl()).toBe('/desafio');
    expect(newChallengeUrl('p-1')).toBe('/desafio?partida=p-1');
    expect(challengeUrl('Ab3_k9-ZxQ2w')).toBe('/desafio/Ab3_k9-ZxQ2w');
    expect(challengeLink('Ab3_k9-ZxQ2w', 'https://violinhero.app')).toBe('https://violinhero.app/desafio/Ab3_k9-ZxQ2w');
  });
});
