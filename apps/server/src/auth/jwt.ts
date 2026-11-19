import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { FastifyReply, FastifyRequest } from 'fastify';

const JWT_SECRET = process.env.JWT_SECRET || 'telechat-dev-secret-change-in-prod';

export interface JwtPayload {
  userId: string;
  username: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: JwtPayload;
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({ error: '未登录或凭证缺失' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  try {
    request.authUser = verifyToken(token);
  } catch {
    reply.code(401).send({ error: '登录凭证无效或已过期' });
  }
}
