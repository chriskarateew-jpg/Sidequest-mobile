// Gumpa — transactional email via Resend, sent from the verified
// gumpaapp.com domain (DKIM + SPF confirmed in the Resend dashboard). Used
// to go through Resend's shared onboarding@resend.dev sandbox sender, which
// could only deliver to the Resend account's own verified address — that
// restriction is gone now that a real domain backs this. PRIMARY_INBOX
// (appgumpa@gmail.com) is the app's business inbox, still set as reply-to
// on every send below since FROM_ADDRESS itself isn't a monitored mailbox.

import type { Env } from './env';

// The app's own business inbox — where replies to any outgoing email land.
const PRIMARY_INBOX = 'appgumpa@gmail.com';

const FROM_ADDRESS = 'Gumpa <hello@gumpaapp.com>';

// Returns whether Resend actually accepted the send. The two existing
// callers below ignore this (their flows have always been best-effort and
// silent), but a caller that needs to tell the user "that didn't go
// through" — see sendRecommendationEmail — can now actually know.
async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [to], reply_to: PRIMARY_INBOX, subject, html }),
    });
    if (!res.ok) {
      console.error(`email: Resend rejected "${subject}" to ${to} (${res.status})`, await res.text().catch(() => ''));
    }
    return res.ok;
  } catch (err) {
    console.error(`email: send threw for "${subject}" to ${to}`, err);
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function sendVerificationEmail(env: Env, origin: string, to: string, token: string): Promise<void> {
  const link = `${origin}/auth/verify?token=${token}`;
  await sendEmail(
    env,
    to,
    'Verify your Gumpa email',
    `<p>Welcome to Gumpa — confirm your email to finish setting up your account:</p>
     <p><a href="${link}">${link}</a></p>
     <p>This link expires in 24 hours. If you didn't sign up for Gumpa, you can ignore this email.</p>`
  );
}

export async function sendPasswordResetEmail(env: Env, origin: string, to: string, token: string): Promise<void> {
  const link = `${origin}/auth/reset-password-page?token=${token}`;
  await sendEmail(
    env,
    to,
    'Reset your Gumpa password',
    `<p>Someone requested a password reset for this account. If that was you:</p>
     <p><a href="${link}">${link}</a></p>
     <p>This link expires in 30 minutes and can only be used once. If you didn't request this, you can ignore this email.</p>`
  );
}

// Recipient is fixed and hardcoded on purpose — this always goes to the
// app's own inbox (PRIMARY_INBOX), never a per-user destination.
export async function sendRecommendationEmail(env: Env, username: string, message: string): Promise<boolean> {
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
  return sendEmail(
    env,
    PRIMARY_INBOX,
    `${username} Recommendation`,
    `<p><strong>@${escapeHtml(username)}</strong> sent a recommendation via the Gumpa app:</p>
     <p>${safeMessage}</p>`
  );
}
