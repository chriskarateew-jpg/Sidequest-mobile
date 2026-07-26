export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export async function safeJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Minimal server-rendered page for email links (verify / reset password) —
// these are opened straight from a mail client, not the app, so they need
// to work as a plain webpage rather than round-tripping through the client.
export function htmlPage(bodyHtml: string): Response {
  const page = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Gumption</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F5F4F0; color: #111214; display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; padding: 24px; }
    .card { background: #fff; border-radius: 18px; padding: 32px; max-width: 380px; width: 100%; box-shadow: 0 2px 10px rgba(17,18,20,0.08); text-align: center; }
    h1 { font-size: 20px; margin: 0 0 12px; }
    p { font-size: 14px; color: #6E7178; line-height: 1.5; }
    input { width: 100%; box-sizing: border-box; padding: 12px 14px; border-radius: 12px; border: 1.5px solid #E5E3DD; font-size: 15px; margin-bottom: 12px; }
    button { width: 100%; padding: 14px; border-radius: 12px; border: none; background: #F3680C; color: #fff; font-weight: 800; font-size: 15px; cursor: pointer; }
    .msg { margin-top: 12px; font-size: 13px; font-weight: 700; }
  </style>
</head>
<body><div class="card">${bodyHtml}</div></body>
</html>`;
  return new Response(page, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
