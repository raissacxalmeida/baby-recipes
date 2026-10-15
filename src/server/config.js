export function loadConfig(env) {
  const problems = [];
  const databaseUrl = (env.DATABASE_URL ?? '').trim();
  if (!databaseUrl) problems.push('DATABASE_URL is required');

  let publicUrl = (env.PUBLIC_URL ?? '').trim();
  let publicHost = null;
  if (!publicUrl) {
    problems.push('PUBLIC_URL is required (for example http://my-mac.local:3000)');
  } else {
    try {
      const url = new URL(publicUrl);
      if (!/^https?:$/.test(url.protocol)) throw new Error('protocol');
      publicHost = url.hostname;
      publicUrl = publicUrl.replace(/\/+$/, '');
    } catch {
      problems.push('PUBLIC_URL must be an http or https address');
    }
  }
  if (problems.length) throw new Error(problems.join('; '));

  const listed = (env.ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean);
  return {
    databaseUrl,
    openaiKey: env.OPENAI_API_KEY ?? '',
    publicUrl,
    allowedHosts: listed.length ? listed : [...new Set([publicHost, 'localhost', '127.0.0.1'])],
    cookieSecure: env.COOKIE_SECURE === 'true',
    port: Number(env.PORT) || 3000,
  };
}
