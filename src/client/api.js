export async function fetchRecipe(body, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl('/api/recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the server');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? 'Something went wrong');
  return data.recipe;
}
