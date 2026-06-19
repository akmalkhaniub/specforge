/**
 * Auth routes: login (public) and me (requires a valid token). Registration is
 * intentionally omitted for the demo — users are seeded — but the shape is here
 * to extend. Passwords are never returned.
 */
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { hashPassword, signToken, verifyPassword } from '../lib/auth.js';
import { NotFoundError } from '../lib/errors.js';
import { getAuth } from '../middleware/auth.js';
import { log } from '../lib/logger.js';

export const auth = new Hono();

interface UserRow {
  id: string;
  orgId: string;
  email: string;
  name: string;
  passwordHash: string;
}

/** Public-safe user shape (no password hash). */
function publicUser(u: UserRow): { id: string; orgId: string; email: string; name: string } {
  return { id: u.id, orgId: u.orgId, email: u.email, name: u.name };
}

// POST /api/auth/login  (public)
auth.post(
  '/login',
  zValidator('json', z.object({ email: z.string().email(), password: z.string().min(1) })),
  async (c) => {
    const { email, password } = c.req.valid('json');
    const [user] = await sql<UserRow[]>`
      SELECT id, org_id, email, name, password_hash FROM users WHERE email = ${email.toLowerCase()}
    `;
    // Constant-ish response: same error whether the email or password is wrong.
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return c.json({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' }, 401);
    }
    const token = await signToken({ sub: user.id, orgId: user.orgId, email: user.email });
    log.info('login_success', { userId: user.id, orgId: user.orgId });
    return c.json({ token, user: publicUser(user) });
  },
);

// GET /api/auth/me  (requires auth)
auth.get('/me', async (c) => {
  const { userId } = getAuth(c);
  const [user] = await sql<UserRow[]>`
    SELECT id, org_id, email, name, password_hash FROM users WHERE id = ${userId}
  `;
  if (!user) throw new NotFoundError('User not found', { userId });
  return c.json(publicUser(user));
});

// Exported so the seed can hash the demo password consistently.
export { hashPassword };
