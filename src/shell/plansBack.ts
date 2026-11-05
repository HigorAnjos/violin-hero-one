/** De onde os Planos foram abertos (a turma, a nova tarefa): o voltar leva para lá, com o nome da tela. */
export interface PlansBack {
  to: string;
  label: string;
}

export const plansState = (back: PlansBack) => ({ plansBack: back });

/** Só caminho do próprio app; sem estado (link direto, outro lugar), o voltar é o Menu. */
export function readPlansBack(state: unknown): PlansBack | null {
  const back = (state as { plansBack?: Partial<PlansBack> } | null)?.plansBack;
  return typeof back?.to === 'string' && back.to.startsWith('/') && !back.to.startsWith('//') && typeof back.label === 'string' && back.label ? { to: back.to, label: back.label } : null;
}
