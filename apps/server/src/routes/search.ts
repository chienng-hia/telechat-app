import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { GlobalSearchResultDTO } from '@telechat/shared';
import { authenticate } from '../auth/jwt.js';
import type { ChatService } from '../services/chatService.js';

export function registerSearchRoutes(
  app: FastifyInstance,
  db: Database.Database,
  chatService: ChatService
): void {
  app.get('/api/search', { preHandler: authenticate }, async (request) => {
    const rawQ = ((request.query as { q?: string }).q || '').trim();
    const currentUserId = request.authUser!.userId;

    if (!rawQ) {
      const empty: GlobalSearchResultDTO = { users: [], chats: [], messages: [] };
      return empty;
    }

    const cleanUserQ = rawQ.replace(/^@/, '');
    const userRows = db
      .prepare(
        `SELECT id, username, phone, display_name, bio, avatar_color, avatar_url, last_seen_at, created_at
         FROM users
         WHERE id != ? AND (username LIKE ? OR display_name LIKE ?)
         ORDER BY display_name ASC
         LIMIT 10`
      )
      .all(currentUserId, `%${cleanUserQ}%`, `%${cleanUserQ}%`) as Array<
      Parameters<ChatService['mapUser']>[0]
    >;
    const users = userRows.map((r) => chatService.mapUser(r));

    const allChats = chatService.getUserChats(currentUserId);
    const lowerQ = rawQ.toLowerCase();
    const chats = allChats.filter(
      (c) =>
        c.title.toLowerCase().includes(lowerQ) ||
        (c.otherUser?.username.toLowerCase().includes(lowerQ) ?? false)
    );

    const msgRows = db
      .prepare(
        `SELECT m.id, c.type as chat_type, c.title as chat_title
         FROM messages m
         JOIN chats c ON c.id = m.chat_id
         JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = ?
         WHERE m.deleted_at IS NULL AND m.content LIKE ?
         ORDER BY m.created_at DESC
         LIMIT 20`
      )
      .all(currentUserId, `%${rawQ}%`) as Array<{
      id: string;
      chat_type: 'dm' | 'group';
      chat_title: string;
    }>;

    const chatTitleMap = new Map(allChats.map((c) => [c.id, c.title]));
    const messages = msgRows
      .map((row) => {
        const dto = chatService.getMessageById(row.id);
        if (!dto) return null;
        return {
          ...dto,
          chatTitle: chatTitleMap.get(dto.chatId) || row.chat_title || '私聊',
          chatType: row.chat_type,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);

    const result: GlobalSearchResultDTO = { users, chats, messages };
    return result;
  });
}
