/** O que aconteceu com o pedido de compartilhar: a tela mostra o aviso certo. */
export type ShareOutcome = 'shared' | 'downloaded' | 'copied' | 'cancelled' | 'failed';

type ShareNavigator = Pick<Navigator, 'share' | 'canShare'> & { clipboard?: Pick<Clipboard, 'writeText'> };

const cancelled = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/**
 * Manda a imagem pela folha de compartilhar do aparelho (Web Share com arquivo); sem suporte a arquivo, ou se a folha
 * falhar, baixa o PNG. Fechar a folha sem escolher nada não baixa.
 */
export async function shareFile(
  file: File,
  { title, text }: { title: string; text?: string },
  nav: Partial<ShareNavigator> = navigator,
  doc: Document = document
): Promise<ShareOutcome> {
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title, ...(text ? { text } : {}) });
      return 'shared';
    } catch (error) {
      if (cancelled(error)) return 'cancelled';
    }
  }
  return download(file, doc);
}

function download(file: File, doc: Document): ShareOutcome {
  const url = URL.createObjectURL(file);
  const a = doc.createElement('a');
  a.href = url;
  a.download = file.name;
  a.hidden = true;
  doc.body.append(a);
  a.click();
  a.remove();
  // O download já começou; o endereço temporário pode sair logo depois
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

/** Manda o link (WhatsApp, mensagens…) pela folha do aparelho; sem ela, copia. */
export async function shareLink(url: string, { title, text }: { title: string; text: string }, nav: Partial<ShareNavigator> = navigator): Promise<ShareOutcome> {
  if (nav.share) {
    try {
      await nav.share({ url, title, text });
      return 'shared';
    } catch (error) {
      if (cancelled(error)) return 'cancelled';
    }
  }
  return copyText(url, nav);
}

export async function copyText(text: string, nav: Partial<ShareNavigator> = navigator): Promise<ShareOutcome> {
  try {
    if (!nav.clipboard) return 'failed';
    await nav.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
