/**
 * Authentication primitives: password hashing (scrypt, from node:crypto — no
 * external dep) and JWT sign/verify (jose, HS256). Tokens carry the user id and
 * org id so every request can be tenant-scoped without a DB lookup.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';

const SCRYPT_KEYLEN = 64;
const TOKEN_TTL = '7d';
const secretKey = new TextEncoder().encode(env.JWT_SECRET);

/** Hashes a password as `salt:hash` (both hex). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

/** Verifies a password against a stored `salt:hash`, in constant time. */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Claims embedded in the JWT. */
export interface TokenClaims {
  sub: string; // user id
  orgId: string;
  email: string;
}

/** Signs a 7-day JWT for a user. */
export async function signToken(claims: TokenClaims): Promise<string> {
  return new SignJWT({ orgId: claims.orgId, email: claims.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secretKey);
}

/** Verifies a JWT and returns its claims, or null if invalid/expired. */
export async function verifyToken(token: string): Promise<TokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    if (typeof payload.sub !== 'string' || typeof payload.orgId !== 'string') return null;
    return { sub: payload.sub, orgId: payload.orgId, email: String(payload.email ?? '') };
  } catch {
    return null;
  }
}
