// lib/auth/core.ts
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import type { NextRequest } from 'next/server';

export type AuthUser = {
  id: string;
  email: string;
  username: string;
  emailVerified: boolean;
  role: 'user' | 'admin' | 'moderator';
  createdAt: string;
};

export type SessionPayload = {
  sub: string;
  email: string;
  username: string;
  role: string;
  emailVerified: boolean;
  iat: number;
  exp: number;
};

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.AUTH_SECRET || ''
);

if (!JWT_SECRET || JWT_SECRET.length === 0) {
  throw new Error('JWT_SECRET or AUTH_SECRET must be set');
}

const SESSION_COOKIE = 'auth_session';
const TOKEN_EXPIRY = 60 * 60 * 24 * 7; // 7 days

// Core JWT functions
export async function signToken(payload: Omit<SessionPayload, 'iat' | 'exp'>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

// Cookie management
export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_EXPIRY,
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

// User database operations
export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  const { rows } = await query<{
    id: string;
    email: string;
    username: string;
    password_hash: string;
    email_verified: boolean;
    role: string;
    created_at: string;
  }>(
    `SELECT id, email, username, password_hash, email_verified, role, created_at
     FROM users 
     WHERE lower(email) = lower($1) 
     LIMIT 1`,
    [email]
  );

  const user = rows[0];
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    emailVerified: user.email_verified,
    role: (user.role as 'user' | 'admin' | 'moderator') || 'user',
    createdAt: user.created_at,
  };
}

export async function createUser(data: {
  email: string;
  username: string;
  password: string;
  emailVerified?: boolean;
}): Promise<AuthUser> {
  const passwordHash = await bcrypt.hash(data.password, 12);
  
  const { rows } = await query<{
    id: string;
    email: string;
    username: string;
    email_verified: boolean;
    role: string;
    created_at: string;
  }>(
    `INSERT INTO users (email, username, password_hash, email_verified, role)
     VALUES ($1, $2, $3, $4, 'user')
     RETURNING id, email, username, email_verified, role, created_at`,
    [data.email, data.username, passwordHash, data.emailVerified || false]
  );

  const user = rows[0];
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    emailVerified: user.email_verified,
    role: user.role as 'user' | 'admin' | 'moderator',
    createdAt: user.created_at,
  };
}

export async function verifyPassword(email: string, password: string): Promise<AuthUser | null> {
  const { rows } = await query<{
    id: string;
    email: string;
    username: string;
    password_hash: string;
    email_verified: boolean;
    role: string;
    created_at: string;
  }>(
    `SELECT id, email, username, password_hash, email_verified, role, created_at
     FROM users 
     WHERE lower(email) = lower($1) 
     LIMIT 1`,
    [email]
  );

  const user = rows[0];
  if (!user) return null;

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) return null;

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    emailVerified: user.email_verified,
    role: (user.role as 'user' | 'admin' | 'moderator') || 'user',
    createdAt: user.created_at,
  };
}

// Session management
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    
    if (!token) return null;

    const payload = await verifyToken(token);
    if (!payload) return null;

    // Get fresh user data from database
    return await getUserByEmail(payload.email);
  } catch {
    return null;
  }
}

export async function getCurrentUserFromRequest(request: NextRequest): Promise<AuthUser | null> {
  try {
    // Try cookie first
    let token = request.cookies.get(SESSION_COOKIE)?.value;
    
    // Fall back to Authorization header
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) return null;

    const payload = await verifyToken(token);
    if (!payload) return null;

    return await getUserByEmail(payload.email);
  } catch {
    return null;
  }
}

export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireAuth();
  if (user.role !== 'admin') {
    throw new Error('Admin access required');
  }
  return user;
}

// Authentication actions
export async function login(email: string, password: string): Promise<AuthUser> {
  const user = await verifyPassword(email, password);
  if (!user) {
    throw new Error('Invalid credentials');
  }

  const token = await signToken({
    sub: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    emailVerified: user.emailVerified,
  });

  await setAuthCookie(token);
  return user;
}

export async function register(data: {
  email: string;
  username: string;
  password: string;
}): Promise<AuthUser> {
  // Check if user exists
  const existingUser = await getUserByEmail(data.email);
  if (existingUser) {
    throw new Error('User already exists');
  }

  const user = await createUser(data);

  // Auto-login after registration
  const token = await signToken({
    sub: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    emailVerified: user.emailVerified,
  });

  await setAuthCookie(token);
  return user;
}

export async function logout(): Promise<void> {
  await clearAuthCookie();
}