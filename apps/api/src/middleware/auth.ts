/**
 * Auth middleware. Verifies the Bearer JWT and stores the caller's orgId/userId
 * on the request context so handlers can tenant-scope every query. Requests
 * without a valid token get 401.
 */
import type { Context, MiddlewareHandler } from 'hono';
import { verifyToken } from '../lib/auth.js';

// Type the context variables so c.get('orgId') is typed everywhere.
declare module 'hono' {
  interface ContextVariableMap {
    orgId: string;
    userId: string;
  }
}

/** Verifies the Authorization header and populates orgId/userId, else 401. */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const header = c.req.header('Authorization');
  // Header is preferred; fall back to ?access_token= for browser GETs that can't
  // set headers (EventSource SSE, <a download> links).
  const token = header?.startsWith('Bearer ') ? header.slice(7) : c.req.query('access_token');
  if (!token) {
    return c.json({ error: 'Authentication required', code: 'UNAUTHENTICATED' }, 401);
  }
  const claims = await verifyToken(token);
  if (!claims) {
    return c.json({ error: 'Invalid or expired token', code: 'UNAUTHENTICATED' }, 401);
  }
  c.set('orgId', claims.orgId);
  c.set('userId', claims.sub);
  await next();
  return undefined;
};

/** Reads the authenticated caller's org/user from context. */
export function getAuth(c: Context): { orgId: string; userId: string } {
  return { orgId: c.get('orgId'), userId: c.get('userId') };
}
