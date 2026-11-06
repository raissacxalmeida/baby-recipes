import { useEffect, useState } from 'react';
import type { Api } from './api.js';
import { asApiError } from './api.js';
import type { ApiBaby, BabyInput } from './apiTypes.js';
import { t, type ErrorInfo } from './i18n/index.js';

// A baby's name as shown; a baby made before names existed has none yet.
export const babyName = (baby: ApiBaby): string => baby.name ?? t('baby.unnamed');

export interface Babies {
  status: 'loading' | 'ready' | 'error';
  error: ErrorInfo | null;
  babies: ApiBaby[];
  // The baby the app shows; null while loading and for an account with no babies.
  babyId: string | null;
  select(id: string): void;
  add(input: BabyInput): Promise<ApiBaby>;
  edit(id: string, input: BabyInput): Promise<void>;
  remove(id: string): Promise<void>;
}

// The account's babies and which one is showing. It loads once `enabled` (someone is signed in) and starts on the
// baby used last when it is still there, else on the first. Writes throw their error for the screen to show.
// A 401 while loading means the session ended: `onSessionLost` is called instead of keeping an error.
export function useBabies(api: Api, enabled: boolean, onSessionLost: () => void = () => {}): Babies {
  const [status, setStatus] = useState<Babies['status']>('loading');
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [babies, setBabies] = useState<ApiBaby[]>([]);
  const [babyId, setBabyId] = useState<string | null>(null);

  useEffect(() => {
    setStatus('loading');
    setError(null);
    setBabies([]);
    setBabyId(null);
    if (!enabled) return undefined;
    let live = true;
    api.babies()
      .then(({ babies: list, lastBabyId }) => {
        if (!live) return;
        setBabies(list);
        setBabyId(list.find((b) => b.id === lastBabyId)?.id ?? list[0]?.id ?? null);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (!live) return;
        if (asApiError(err).status === 401) return onSessionLost();
        setError(asApiError(err));
        setStatus('error');
      });
    return () => { live = false; };
  }, [api, enabled]);

  // Remembering the baby on the server is a convenience for the next visit: a failure is not worth a message.
  function select(id: string) {
    setBabyId(id);
    api.setLastBaby(id).catch(() => {});
  }

  async function add(input: BabyInput): Promise<ApiBaby> {
    const baby = await api.addBaby(input);
    setBabies((list) => [...list, baby]);
    select(baby.id);
    return baby;
  }

  async function edit(id: string, input: BabyInput): Promise<void> {
    await api.updateBaby(id, input);
    setBabies((list) => list.map((b) => (b.id === id ? { ...b, ...input } : b)));
  }

  async function remove(id: string): Promise<void> {
    await api.removeBaby(id);
    const rest = babies.filter((b) => b.id !== id);
    setBabies(rest);
    if (rest[0]) select(rest[0].id);
    else setBabyId(null);
  }

  return { status, error, babies, babyId, select, add, edit, remove };
}
