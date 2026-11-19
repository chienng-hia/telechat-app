import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { z } from 'zod';
import { authenticate, hashPassword, signToken, verifyPassword } from '../auth/jwt.js';
import type { ChatService } from '../services/chatService.js';

const AVATAR_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'];

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, '用户名至少需要 3 个字符')
    .max(24, '用户名最多 24 个字符')
    .regex(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线'),
  phone: z.string().trim().optional().nullable(),
  password: z.string().min(6, '密码至少需要 6 个字符'),
  displayName: z.string().trim().min(1, '请填写昵称').max(40).optional(),
});

const loginSchema = z.object({
  identifier: z.string().trim().min(1, '请输入用户名或手机号'),
  password: z.string().min(1, '请输入密码'),
});

const demoLoginSchema = z.object({
  userId: z.string().min(1),
});

export function registerAuthRoutes(
  app: FastifyInstance,
  db: Database.Database,
  chatService: ChatService
): void {
  app.get('/api/auth/demo-users', async () => {
    const rows = db
      .prepare(
        `SELECT id, username, display_name as displayName, bio, avatar_color as avatarColor
         FROM users WHERE is_demo = 1 ORDER BY created_at ASC`
      )
      .all();
    return { users: rows };
  });

  app.post('/api/auth/demo-login', async (request, reply) => {
    const parsed = demoLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: '无效的演示账号请求' });
    }

    const row = db
      .prepare('SELECT id, username FROM users WHERE id = ? AND is_demo = 1')
      .get(parsed.data.userId) as { id: string; username: string } | undefined;

    if (!row) {
      return reply.code(404).send({ error: '演示账号不存在' });
    }

    const token = signToken({ userId: row.id, username: row.username });
    const user = chatService.getUserById(row.id);
    return { token, user };
  });

  app.post('/api/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || '参数错误' });
    }

    const { username, phone, password, displayName } = parsed.data;
    const normalizedPhone = phone && phone.length > 0 ? phone : null;

    const existing = db
      .prepare('SELECT id FROM users WHERE username = ? OR (? IS NOT NULL AND phone = ?)')
      .get(username, normalizedPhone, normalizedPhone);

    if (existing) {
      return reply.code(409).send({ error: '用户名或手机号已被注册' });
    }

    const id = `user-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const hash = hashPassword(password);

    db.prepare(
      `INSERT INTO users (id, username, phone, password_hash, display_name, bio, avatar_color, is_demo, last_seen_at, created_at)
       VALUES (?, ?, ?, ?, ?, '', ?, 0, ?, ?)`
    ).run(id, username.toLowerCase(), normalizedPhone, hash, displayName || username, color, now, now);

    const token = signToken({ userId: id, username: username.toLowerCase() });
    const user = chatService.getUserById(id);
    return reply.code(201).send({ token, user });
  });

  app.post('/api/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || '参数错误' });
    }

    const { identifier, password } = parsed.data;
    const row = db
      .prepare('SELECT id, username, password_hash FROM users WHERE username = ? OR phone = ?')
      .get(identifier, identifier) as { id: string; username: string; password_hash: string } | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      return reply.code(401).send({ error: '用户名/手机号或密码错误' });
    }

    const token = signToken({ userId: row.id, username: row.username });
    const user = chatService.getUserById(row.id);
    return { token, user };
  });

  app.get('/api/auth/me', { preHandler: authenticate }, async (request, reply) => {
    const user = chatService.getUserById(request.authUser!.userId);
    if (!user) {
      return reply.code(404).send({ error: '用户不存在' });
    }
    return { user };
  });
}
