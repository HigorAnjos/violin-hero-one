/** Recuos da área segura nas laterais (o entalhe do celular deitado), em px. */
export interface SideInsets {
  left: number;
  right: number;
}

/** O env(safe-area-inset-*) do CSS, lido num elemento de prova: o JS não tem outro jeito de ver o entalhe. */
export function safeAreaInsets(): SideInsets {
  if (typeof document === 'undefined' || !document.body) return { left: 0, right: 0 };
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding-left:env(safe-area-inset-left, 0px);padding-right:env(safe-area-inset-right, 0px)';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const insets = { left: parseFloat(style.paddingLeft) || 0, right: parseFloat(style.paddingRight) || 0 };
  probe.remove();
  return insets;
}
