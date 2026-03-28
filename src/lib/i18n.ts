import translationsData from '../locales/translations.json';

export const translations = translationsData;

export type Locale = keyof typeof translations;
export type TranslationMessages = (typeof translations)['en'];

export function resolveLocale(preferredLocale: string, systemLocale = 'en'): Locale {
  const candidate = preferredLocale === 'auto' ? systemLocale : preferredLocale;
  return candidate.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function formatText(template: string, values: Record<string, number | string | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(values[key] ?? ''));
}
