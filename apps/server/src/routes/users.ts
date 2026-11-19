import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { authenticate } from '../auth/jwt.js';
import type { ChatService } from '../services/chatService.js';

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  bio: z.string().trim().max(160).optional(),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export function registerUserRoutes(
  app: FastifyInstance,
  db: Database.Database,
  chatService: ChatService
): void {
  app.get('/api/users/search', { preHandler: authenticate }, async (request) => {
    const query = ((request.query as { q?: string }).q || '').trim().replace(/^@/, '');
    const currentUserId = request.authUser!.userId;

    const rows = query
      ? db
          .prepare(
            `SELECT id, username, phone, display_name, bio, avatar_color, avatar_url, last_seen_at, created_at
             FROM users
             WHERE id != ? AND (username LIKE ? OR display_name LIKE ?)
             ORDER BY display_name ASC
             LIMIT 30`
          )
          .all(currentUserId, `%${query}%`, `%${query}%`)
      : db
          .prepare(
            `SELECT id, username, phone, display_name, bio, avatar_color, avatar_url, last_seen_at, created_at
             FROM users
             WHERE id != ?
             ORDER BY display_name ASC
             LIMIT 30`
          )
          .all(currentUserId);

    return {
      users: (rows as Array<Parameters<ChatService['mapUser']>[0]>).map((r) =>
        chatService.mapUser(r)
      ),
    };
  });

  app.patch('/api/users/me', { preHandler: authenticate }, async (request, reply) => {
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: '个人资料格式无效' });
    }

    const userId = request.authUser!.userId;
    const { displayName, bio, avatarColor } = parsed.data;

    if (displayName !== undefined) {
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, userId);
    }
    if (bio !== undefined) {
      db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio, userId);
    }
    if (avatarColor !== undefined) {
      db.prepare('UPDATE users SET avatar_color = ? WHERE id = ?').run(avatarColor, userId);
    }

    return { user: chatService.getUserById(userId) };
  });
}
