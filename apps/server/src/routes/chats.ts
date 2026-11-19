import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';
import crypto from 'node:crypto';
import { z } from 'zod';
import type { ClientToServerEvents, ServerToClientEvents } from '@telechat/shared';
import { authenticate } from '../auth/jwt.js';
import type { ChatService } from '../services/chatService.js';

const GROUP_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f97316', '#3b82f6', '#8b5cf6'];

const createDmSchema = z.object({
  targetUserId: z.string().min(1),
});

const createGroupSchema = z.object({
  title: z.string().trim().min(1, '请填写群名称').max(60),
  description: z.string().trim().max(200).optional(),
  memberIds: z.array(z.string().min(1)).default([]),
});

const updateGroupSchema = z.object({
  title: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(200).optional(),
});

const addMembersSchema = z.object({
  memberIds: z.array(z.string().min(1)).min(1),
});

const updateRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

export function registerChatRoutes(
  app: FastifyInstance,
  db: Database.Database,
  chatService: ChatService,
  io: Server<ClientToServerEvents, ServerToClientEvents>
): void {
  const notifyMembers = (memberIds: string[], chatId: string) => {
    for (const uid of memberIds) {
      io.to(`user:${uid}`).emit('chat:updated', { chatId });
    }
  };

  app.get('/api/chats', { preHandler: authenticate }, async (request) => {
    const chats = chatService.getUserChats(request.authUser!.userId);
    return { chats };
  });

  app.post('/api/chats/dm', { preHandler: authenticate }, async (request, reply) => {
    const parsed = createDmSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: '无效的目标用户' });
    }

    const currentUserId = request.authUser!.userId;
    const { targetUserId } = parsed.data;

    if (targetUserId === currentUserId) {
      return reply.code(400).send({ error: '不能与自己发起私聊' });
    }

    const targetUser = chatService.getUserById(targetUserId);
    if (!targetUser) {
      return reply.code(404).send({ error: '目标用户不存在' });
    }

    const existing = db
      .prepare(
        `SELECT c.id
         FROM chats c
         JOIN chat_members m1 ON m1.chat_id = c.id AND m1.user_id = ?
         JOIN chat_members m2 ON m2.chat_id = c.id AND m2.user_id = ?
         WHERE c.type = 'dm'
         LIMIT 1`
      )
      .get(currentUserId, targetUserId) as { id: string } | undefined;

    if (existing) {
      return { chat: chatService.getChatDTO(existing.id, currentUserId) };
    }

    const chatId = `chat-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(
        `INSERT INTO chats (id, type, title, description, avatar_color, created_by, created_at, updated_at)
         VALUES (?, 'dm', '', '', ?, ?, ?, ?)`
      ).run(chatId, targetUser.avatarColor, currentUserId, now, now);

      db.prepare(
        `INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`
      ).run(chatId, currentUserId, now);

      db.prepare(
        `INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`
      ).run(chatId, targetUserId, now);
    })();

    notifyMembers([currentUserId, targetUserId], chatId);
    return reply.code(201).send({ chat: chatService.getChatDTO(chatId, currentUserId) });
  });

  app.post('/api/chats/group', { preHandler: authenticate }, async (request, reply) => {
    const parsed = createGroupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || '参数错误' });
    }

    const currentUserId = request.authUser!.userId;
    const { title, description = '', memberIds } = parsed.data;
    const uniqueMembers = Array.from(new Set(memberIds.filter((id) => id !== currentUserId)));

    const chatId = `chat-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const color = GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];

    db.transaction(() => {
      db.prepare(
        `INSERT INTO chats (id, type, title, description, avatar_color, created_by, created_at, updated_at)
         VALUES (?, 'group', ?, ?, ?, ?, ?, ?)`
      ).run(chatId, title, description, color, currentUserId, now, now);

      db.prepare(
        `INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)`
      ).run(chatId, currentUserId, now);

      const insertMember = db.prepare(
        `INSERT OR IGNORE INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`
      );
      for (const uid of uniqueMembers) {
        if (chatService.getUserById(uid)) {
          insertMember.run(chatId, uid, now);
        }
      }
    })();

    notifyMembers([currentUserId, ...uniqueMembers], chatId);
    return reply.code(201).send({ chat: chatService.getChatDTO(chatId, currentUserId) });
  });

  app.get('/api/chats/:chatId', { preHandler: authenticate }, async (request, reply) => {
    const { chatId } = request.params as { chatId: string };
    const detail = chatService.getChatDetailDTO(chatId, request.authUser!.userId);
    if (!detail) {
      return reply.code(404).send({ error: '会话不存在或无权访问' });
    }
    return { chat: detail };
  });

  app.patch('/api/chats/:chatId', { preHandler: authenticate }, async (request, reply) => {
    const { chatId } = request.params as { chatId: string };
    const currentUserId = request.authUser!.userId;
    const role = chatService.getMemberRole(chatId, currentUserId);
    if (!role || (role !== 'owner' && role !== 'admin')) {
      return reply.code(403).send({ error: '仅群主或管理员可修改群资料' });
    }

    const parsed = updateGroupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: '群资料格式无效' });
    }

    const { title, description } = parsed.data;
    const now = new Date().toISOString();
    if (title !== undefined) {
      db.prepare('UPDATE chats SET title = ?, updated_at = ? WHERE id = ? AND type = ?').run(
        title,
        now,
        chatId,
        'group'
      );
    }
    if (description !== undefined) {
      db.prepare('UPDATE chats SET description = ?, updated_at = ? WHERE id = ? AND type = ?').run(
        description,
        now,
        chatId,
        'group'
      );
    }

    notifyMembers(chatService.getChatMemberIds(chatId), chatId);
    return { chat: chatService.getChatDetailDTO(chatId, currentUserId) };
  });

  app.post('/api/chats/:chatId/members', { preHandler: authenticate }, async (request, reply) => {
    const { chatId } = request.params as { chatId: string };
    const currentUserId = request.authUser!.userId;
    const role = chatService.getMemberRole(chatId, currentUserId);
    if (!role || (role !== 'owner' && role !== 'admin')) {
      return reply.code(403).send({ error: '仅群主或管理员可邀请新成员' });
    }

    const chat = db.prepare('SELECT type FROM chats WHERE id = ?').get(chatId) as
      | { type: string }
      | undefined;
    if (!chat || chat.type !== 'group') {
      return reply.code(400).send({ error: '仅群聊支持添加成员' });
    }

    const parsed = addMembersSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: '请选择要添加的成员' });
    }

    const now = new Date().toISOString();
    const insert = db.prepare(
      `INSERT OR IGNORE INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`
    );
    db.transaction(() => {
      for (const uid of parsed.data.memberIds) {
        if (chatService.getUserById(uid)) {
          insert.run(chatId, uid, now);
        }
      }
      db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(now, chatId);
    })();

    notifyMembers(chatService.getChatMemberIds(chatId), chatId);
    return { chat: chatService.getChatDetailDTO(chatId, currentUserId) };
  });

  app.delete(
    '/api/chats/:chatId/members/:userId',
    { preHandler: authenticate },
    async (request, reply) => {
      const { chatId, userId: targetUserId } = request.params as { chatId: string; userId: string };
      const currentUserId = request.authUser!.userId;
      const myRole = chatService.getMemberRole(chatId, currentUserId);
      const targetRole = chatService.getMemberRole(chatId, targetUserId);

      if (!myRole || !targetRole) {
        return reply.code(404).send({ error: '成员不存在' });
      }

      const isSelfLeaving = currentUserId === targetUserId;
      if (!isSelfLeaving) {
        if (myRole === 'member') {
          return reply.code(403).send({ error: '无权移除成员' });
        }
        if (myRole === 'admin' && targetRole !== 'member') {
          return reply.code(403).send({ error: '管理员无法移除群主或其他管理员' });
        }
      }

      const memberIdsBefore = chatService.getChatMemberIds(chatId);
      db.prepare('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?').run(
        chatId,
        targetUserId
      );

      notifyMembers(memberIdsBefore, chatId);
      return { ok: true };
    }
  );

  app.patch(
    '/api/chats/:chatId/members/:userId/role',
    { preHandler: authenticate },
    async (request, reply) => {
      const { chatId, userId: targetUserId } = request.params as { chatId: string; userId: string };
      const currentUserId = request.authUser!.userId;
      const myRole = chatService.getMemberRole(chatId, currentUserId);

      if (myRole !== 'owner') {
        return reply.code(403).send({ error: '仅群主可调整管理员权限' });
      }
      if (targetUserId === currentUserId) {
        return reply.code(400).send({ error: '无法修改自己的群主角色' });
      }

      const parsed = updateRoleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: '角色参数无效' });
      }

      db.prepare('UPDATE chat_members SET role = ? WHERE chat_id = ? AND user_id = ?').run(
        parsed.data.role,
        chatId,
        targetUserId
      );

      notifyMembers(chatService.getChatMemberIds(chatId), chatId);
      return { chat: chatService.getChatDetailDTO(chatId, currentUserId) };
    }
  );
}
