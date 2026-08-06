import { generateToken, hashPassword, hashToken, signToken, verifyPassword, verifyToken } from './crypto';
import { sendPasswordResetEmail, sendVerificationEmail } from './email';
import type { Env } from './env';
import { error, htmlPage, json, safeJson } from './http';
import { checkRateLimit, clientIp } from './ratelimit';

interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  password_salt: string;
  is_public: number;
  email_verified: number;
  avatar_key: string | null;
}

interface TokenRow {
  id: string;
  user_id: string;
  expires_at: number;
  used_at: number | null;
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const RESET_TOKEN_RE = /^[0-9a-f]{48}$/;

function userSummary(row: Pick<UserRow, 'id' | 'username' | 'email' | 'is_public' | 'email_verified' | 'avatar_key'>) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    isPublic: !!row.is_public,
    emailVerified: !!row.email_verified,
    avatarKey: row.avatar_key,
  };
}

async function issueAndSendVerification(env: Env, request: Request, userId: string, email: string): Promise<void> {
  const token = generateToken();
  const tokenHash = await hashToken(token);
  await env.DB.prepare(
    'INSERT INTO auth_tokens (id, user_id, purpose, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(crypto.randomUUID(), userId, 'verify_email', tokenHash, Date.now() + 24 * 60 * 60 * 1000, Date.now())
    .run();

  await sendVerificationEmail(env, new URL(request.url).origin, email, token);
}

export async function handleSignup(request: Request, env: Env): Promise<Response> {
  if (!(await checkRateLimit(env, `signup:${clientIp(request)}`, 5, 3600))) {
    return error('Too many signup attempts. Try again later.', 429);
  }

  const body = await safeJson(request);
  if (!body) return error('Invalid JSON body');

  const username = String(body.username ?? '').trim();
  const email = String(body.email ?? '')
    .trim()
    .toLowerCase();
  const password = String(body.password ?? '');

  if (!USERNAME_RE.test(username)) {
    return error('Username must be 3-20 characters: letters, numbers, underscores only');
  }
  if (!email.includes('@')) return error('Enter a valid email address');
  if (password.length < 8) return error('Password must be at least 8 characters');

  const existing = await env.DB.prepare('SELECT id FROM users WHERE LOWER(username) = ? OR email = ?')
    .bind(username.toLowerCase(), email)
    .first();
  if (existing) return error('That username or email is already taken', 409);

  const { hash, salt } = await hashPassword(password);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO users (id, username, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(id, username, email, hash, salt, Date.now())
    .run();

  await issueAndSendVerification(env, request, id, email);

  const token = await signToken({ sub: id, username }, env.JWT_SECRET);
  return json({ token, user: { id, username, email, isPublic: false, emailVerified: false, avatarKey: null } });
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (!(await checkRateLimit(env, `login:${clientIp(request)}`, 8, 900))) {
    return error('Too many login attempts. Try again in a few minutes.', 429);
  }

  const body = await safeJson(request);
  if (!body) return error('Invalid JSON body');

  const identifier = String(body.identifier ?? '')
    .trim()
    .toLowerCase();
  const password = String(body.password ?? '');
  if (!identifier || !password) return error('Enter your email/username and password');

  const user = await env.DB.prepare('SELECT * FROM users WHERE LOWER(username) = ? OR email = ?')
    .bind(identifier, identifier)
    .first<UserRow>();
  if (!user) return error('Incorrect email/username or password', 401);

  const valid = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!valid) return error('Incorrect email/username or password', 401);

  const token = await signToken({ sub: user.id, username: user.username }, env.JWT_SECRET);
  return json({ token, user: userSummary(user) });
}

export async function handleMe(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  const row = await env.DB.prepare('SELECT id, username, email, is_public, email_verified, avatar_key FROM users WHERE id = ?')
    .bind(auth.id)
    .first<Pick<UserRow, 'id' | 'username' | 'email' | 'is_public' | 'email_verified' | 'avatar_key'>>();
  if (!row) return error('User not found', 404);

  return json({ user: userSummary(row) });
}

export async function requireAuth(request: Request, env: Env): Promise<{ id: string; username: string } | null> {
  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer (.+)$/i);
  if (!match) return null;

  const payload = await verifyToken(match[1], env.JWT_SECRET);
  if (!payload || typeof payload.sub !== 'string' || typeof payload.username !== 'string') return null;
  return { id: payload.sub, username: payload.username };
}

// Gates the /admin/* developer-only routes (custom challenge authoring,
// payout boosts). There's no role/permission system in this app — this is
// the only account allowed through, identified by a Worker secret
// (env.DEV_USER_ID) that's never in git or the client bundle, so it can't be
// spoofed by editing client code. Callers should return a plain 404 (not
// 401/403) on a null result, so a non-developer request looks identical to
// hitting a route that doesn't exist.
export async function requireDeveloper(request: Request, env: Env): Promise<{ id: string; username: string } | null> {
  const auth = await requireAuth(request, env);
  if (!auth || !env.DEV_USER_ID || auth.id !== env.DEV_USER_ID) return null;
  return auth;
}

export async function handleVerifyEmail(request: Request, env: Env): Promise<Response> {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  if (!RESET_TOKEN_RE.test(token)) {
    return htmlPage('<h1>Invalid link</h1><p>This verification link is malformed.</p>');
  }

  const tokenHash = await hashToken(token);
  const row = await env.DB.prepare(
    "SELECT id, user_id, expires_at, used_at FROM auth_tokens WHERE token_hash = ? AND purpose = 'verify_email'"
  )
    .bind(tokenHash)
    .first<TokenRow>();

  if (!row || row.used_at || row.expires_at < Date.now()) {
    return htmlPage(
      '<h1>Link expired</h1><p>This verification link is invalid or has expired. Request a new one from the Gumpa app.</p>'
    );
  }

  await env.DB.batch([
    env.DB.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').bind(row.user_id),
    env.DB.prepare('UPDATE auth_tokens SET used_at = ? WHERE id = ?').bind(Date.now(), row.id),
  ]);

  return htmlPage('<h1>Email verified</h1><p>You can go back to the Gumpa app now.</p>');
}

export async function handleResendVerification(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (!auth) return error('Not authenticated', 401);

  if (!(await checkRateLimit(env, `resend-verify:${auth.id}`, 3, 3600))) {
    return error('Too many requests. Try again later.', 429);
  }

  const row = await env.DB.prepare('SELECT email, email_verified FROM users WHERE id = ?')
    .bind(auth.id)
    .first<{ email: string; email_verified: number }>();
  if (!row) return error('User not found', 404);
  if (row.email_verified) return json({ ok: true, alreadyVerified: true });

  await issueAndSendVerification(env, request, auth.id, row.email);
  return json({ ok: true });
}

export async function handleRequestPasswordReset(request: Request, env: Env): Promise<Response> {
  if (!(await checkRateLimit(env, `reset-request:${clientIp(request)}`, 5, 3600))) {
    return error('Too many requests. Try again later.', 429);
  }

  const body = await safeJson(request);
  const email = String(body?.email ?? '')
    .trim()
    .toLowerCase();

  if (email) {
    const row = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
    if (row) {
      const token = generateToken();
      const tokenHash = await hashToken(token);
      await env.DB.prepare(
        'INSERT INTO auth_tokens (id, user_id, purpose, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
        .bind(crypto.randomUUID(), row.id, 'reset_password', tokenHash, Date.now() + 30 * 60 * 1000, Date.now())
        .run();

      await sendPasswordResetEmail(env, new URL(request.url).origin, email, token);
    }
  }

  // Always the same response whether or not that email is registered — avoids leaking who has an account.
  return json({ ok: true });
}

// Checks the token's actual DB state up front (not just its format) so a
// dead link says exactly why — invalid, already used, or expired — the
// moment the page loads, instead of only failing after the user types a
// new password and submits (see handleResetPassword for the same
// three-way split, since a token can still go stale between page-load and
// submit — this is a UX improvement on top of that check, not a replacement).
export async function handleResetPasswordPage(request: Request, env: Env): Promise<Response> {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  if (!RESET_TOKEN_RE.test(token)) {
    return htmlPage('<h1>Invalid link</h1><p>This reset link is malformed.</p>');
  }

  const tokenHash = await hashToken(token);
  const row = await env.DB.prepare(
    "SELECT expires_at, used_at FROM auth_tokens WHERE token_hash = ? AND purpose = 'reset_password'"
  )
    .bind(tokenHash)
    .first<{ expires_at: number; used_at: number | null }>();

  if (!row) {
    return htmlPage('<h1>Invalid link</h1><p>This reset link is invalid. Request a new one from the Gumpa app.</p>');
  }
  if (row.used_at) {
    return htmlPage('<h1>Already used</h1><p>This reset link has already been used. Request a new one from the Gumpa app.</p>');
  }
  if (row.expires_at < Date.now()) {
    return htmlPage('<h1>Link expired</h1><p>This reset link has expired. Request a new one from the Gumpa app.</p>');
  }

  return htmlPage(`
    <h1>Set a new password</h1>
    <p>Choose a new password for your Gumpa account.</p>
    <input id="pw" type="password" placeholder="New password (min 8 characters)" />
    <button id="submitBtn" onclick="submitReset()">Reset password</button>
    <div id="msg" class="msg"></div>
    <script>
      async function submitReset() {
        var pw = document.getElementById('pw').value;
        var msg = document.getElementById('msg');
        var btn = document.getElementById('submitBtn');
        if (pw.length < 8) { msg.textContent = 'Password must be at least 8 characters.'; return; }
        // Guards against a double-click/double-tap firing two submissions —
        // the second would otherwise hit the "already used" case and read
        // as a confusing false failure right after a successful reset.
        if (btn.disabled) return;
        btn.disabled = true;
        msg.textContent = 'Working…';
        try {
          var res = await fetch('/auth/reset-password', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: '${token}', newPassword: pw }),
          });
          var data = await res.json();
          msg.textContent = res.ok ? 'Password updated — you can go back to the app and log in.' : (data.error || 'Something went wrong.');
          if (!res.ok) btn.disabled = false;
        } catch (e) {
          msg.textContent = 'Network error — try again.';
          btn.disabled = false;
        }
      }
    </script>
  `);
}

export async function handleResetPassword(request: Request, env: Env): Promise<Response> {
  const body = await safeJson(request);
  if (!body) return error('Invalid JSON body');

  const token = String(body.token ?? '');
  const newPassword = String(body.newPassword ?? '');
  if (!RESET_TOKEN_RE.test(token)) return error('Invalid or malformed token');
  if (newPassword.length < 8) return error('Password must be at least 8 characters');

  const tokenHash = await hashToken(token);
  const row = await env.DB.prepare(
    "SELECT id, user_id, expires_at, used_at FROM auth_tokens WHERE token_hash = ? AND purpose = 'reset_password'"
  )
    .bind(tokenHash)
    .first<TokenRow>();

  // Split into three distinct outcomes (used to be one generic "invalid or
  // expired" message) so a real recurrence is actually diagnosable instead
  // of always reading as "expired" regardless of the real cause — e.g. a
  // double-submitted link now correctly says "already used," not "expired."
  if (!row) return error('This reset link is invalid. Request a new one from the Gumpa app.', 400);
  if (row.used_at) return error('This reset link has already been used. Request a new one from the Gumpa app.', 400);
  if (row.expires_at < Date.now()) return error('This reset link has expired. Request a new one from the Gumpa app.', 400);

  const user = await env.DB.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?')
    .bind(row.user_id)
    .first<{ password_hash: string; password_salt: string }>();
  if (!user) return error('User not found', 404);

  const sameAsCurrent = await verifyPassword(newPassword, user.password_hash, user.password_salt);
  if (sameAsCurrent) return error('New password must be different from your current password');

  const { hash, salt } = await hashPassword(newPassword);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').bind(hash, salt, row.user_id),
    env.DB.prepare('UPDATE auth_tokens SET used_at = ? WHERE id = ?').bind(Date.now(), row.id),
  ]);

  return json({ ok: true });
}
