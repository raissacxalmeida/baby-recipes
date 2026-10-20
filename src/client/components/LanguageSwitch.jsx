import { LANGUAGES, LANGUAGE_NAMES } from '../../shared/languages.js';
import { getLanguage, t } from '../i18n/index.js';
import { cn } from '@/lib/utils.js';

// The names are written in their own language on purpose: they are how a person finds theirs.
export default function LanguageSwitch({ onChange }) {
  const current = getLanguage();
  return (
    <nav aria-label={t('language.label')} className="flex flex-wrap justify-center gap-x-3 gap-y-1">
      {LANGUAGES.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-current={code === current ? 'true' : undefined}
          className={cn('rounded-control px-1 hover:underline', code === current && 'font-bold text-foreground')}
          onClick={() => onChange(code)}
        >
          {LANGUAGE_NAMES[code]}
        </button>
      ))}
    </nav>
  );
}
