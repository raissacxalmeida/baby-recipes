import type { Language } from '../../shared/types.js';
import type { Catalog } from './en.js';
import en from './en.js';
import pt from './pt.js';
import es from './es.js';
import de from './de.js';

const catalogs: Record<Language, Catalog> = { en, pt, es, de };

export default catalogs;
