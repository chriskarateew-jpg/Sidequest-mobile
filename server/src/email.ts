// Gumption — transactional email via Resend. Uses their shared sending
// domain (onboarding@resend.dev) so nothing extra is needed to get going —
// caveat: that sender can only deliver to the email address on the Resend
// account itself until a real domain is verified there. Fine for solo
// testing; a verified domain is required before this reaches real users.

import type { Env } from './env';

async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<void> {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: 'Gumption <onboarding@resend.dev>', to: [to], subject, html }),
    });
  } catch {
    // best-effort — the account still works, the user just won't get this email
  }
}

export async function sendVerificationEmail(env: Env, origin: string, to: string, token: string): Promise<void> {
  const link = `${origin}/auth/verify?token=${token}`;
  await sendEmail(
    env,
    to,
    'Verify your Gumption email',
    `<p>Welcome to Gumption — confirm your email to finish setting up your account:</p>
     <p><a href="${link}">${link}</a></p>
     <p>This link expires in 24 hours. If you didn't sign up for Gumption, you can ignore this email.</p>`
  );
}

export async function sendPasswordResetEmail(env: Env, origin: string, to: string, token: string): Promise<void> {
  const link = `${origin}/auth/reset-password-page?token=${token}`;
  await sendEmail(
    env,
    to,
    'Reset your Gumption password',
    `<p>Someone requested a password reset for this account. If that was you:</p>
     <p><a href="${link}">${link}</a></p>
     <p>This link expires in 30 minutes and can only be used once. If you didn't request this, you can ignore this email.</p>`
  );
}
