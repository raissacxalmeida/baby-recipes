// Shared narrowing checks for values that arrive as unknown (request bodies, model and translator answers).
export const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';

export const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
