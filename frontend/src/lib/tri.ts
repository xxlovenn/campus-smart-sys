export function triField(
  obj: Record<string, unknown>,
  base: string,
  locale: string,
): string {
  const zh = obj[`${base}Zh`] as string | undefined;
  const en = obj[`${base}En`] as string | undefined;
  const ru = obj[`${base}Ru`] as string | undefined;
  if (locale === 'en') return en || zh || '';
  if (locale === 'ru') return ru || zh || '';
  return zh || en || '';
}
