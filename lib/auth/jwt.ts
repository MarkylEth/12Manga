import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set');
}

type JwtPayload = { uid: number; email: string };

export function signJwt(payload: JwtPayload, days = 30) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${days}d` });
}

export function verifyJwt<T = JwtPayload>(token: string): T {
  return jwt.verify(token, JWT_SECRET) as T;
}
