export function confirmAction(message: string): boolean {
  if (typeof window === 'undefined') return true;
  return window.confirm(message);
}
