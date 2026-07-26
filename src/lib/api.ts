// Sidequest — shared fetch helper for the backend Worker (auth, feed, friends,
// photo verification all live behind EXPO_PUBLIC_API_URL).

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export async function apiFetch(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {}
): Promise<Response> {
  if (!BASE_URL) throw new Error('EXPO_PUBLIC_API_URL is not configured');

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  return fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

export function photoUrl(photoKey: string): string {
  return `${BASE_URL}/photos/${photoKey}`;
}
