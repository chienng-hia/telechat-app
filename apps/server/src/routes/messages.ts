import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';
import crypto from 'node:crypto';
import { z } from 'zod';
import type { ClientToServerEvents, ServerToClientEvents } from '@telechat/shared';
import { authenticate } from '../auth/jwt.js';
import type { ChatService } from '../services/chatService.js';

const sendMessageSchema = z.object({
  type: z.enum(['text', 'image', 'file', 'voice']).default('text'),
  content: z.string().max(10000).default(''),
  attachmentId: z.string().optional().nullable(),
  replyToId: z.string().optional().nullable(),
  forwardFromMessageId: z.string().optional().nullable(),
});

const editMessageSchema = z.object({
  content: z.string().trim().min(1, '消息内容不能为空').max(10000),
});

const markReadSchema = z.object({
  messageId: z.string().min(1),
});

export function registerMessageRoutes(
  app: FastifyInstance,
  db: Database.Database,
  chatService: ChatService,
  io: Server<ClientToServerEvents, ServerToClientEvents>
): void {
  const emitChatUpdated = (chatId: string) => {
    for (const uid of chatService.getChatMemberIds(chatId)) {
      io.to(`user:${uid}`).emit('chat:updated', { chatId });
    }
  };

  app.get('/api/chats/:chatId/messages', { preHandler: authenticate }, async (request, reply) => {
    const { chatId } = request.params as { chatId: string };
    const currentUserId = request.authUser!.userId;
    if (!chatService.getMemberRole(chatId, currentUserId)) {
      return reply.code(403).send({ error: '无权访问该会话' });
    }

    const { before, limit } = request.query as { before?: string; limit?: string };
    const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const messages = chatService.getChatMessages(chatId, parsedLimit + 1, before);
    const hasMore = messages.length > parsedLimit;
    const sliced = hasMore ? messages.slice(messages.length - parsedLimit) : messages;

    return { messages: sliced, hasMore };
  });

  app.post('/api/chats/:chatId/messages', { preHandler: authenticate }, async (request, reply) => {
    const { chatId } = request.params as { chatId: string };
    const currentUserId = request.authUser!.userId;
    if (!chatService.getMemberRole(chatId, currentUserId)) {
      return reply.code(403).send({ error: '无权在该会话发送消息' });
    }

    const parsed = sendMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: '消息格式无效' });
    }

    let { type, content, attachmentId, replyToId, forwardFromMessageId } = parsed.data;
    let forwardFromSenderId: string | null = null;
    let forwardFromSenderName: string | null = null;

    if (forwardFromMessageId) {
      const sourceMsg = chatService.getMessageById(forwardFromMessageId);
      if (!sourceMsg || !chatService.getMemberRole(sourceMsg.chatId, currentUserId)) {
        return reply.code(404).send({ error: '被转发的消息不存在或无权访问' });
      }
      type = sourceMsg.type === 'system' ? 'text' : sourceMsg.type;
      content = sourceMsg.content;
      attachmentId = sourceMsg.attachment?.id ?? null;
      forwardFromSenderId = sourceMsg.forwardFrom?.senderId ?? sourceMsg.senderId;
      forwardFromSenderName = sourceMsg.forwardFrom?.senderName ?? sourceMsg.sender.displayName;
    } else if (type === 'text' && content.trim().length === 0) {
      return reply.code(400).send({ error: '消息内容不能为空' });
    }

    if (replyToId) {
      const replyTarget = db
        .prepare('SELECT id FROM messages WHERE id = ? AND chat_id = ? AND deleted_at IS NULL')
        .get(replyToId, chatId);
      if (!replyTarget) {
        replyToId = null;
      }
    }

    const msgId = `msg-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(
        `INSERT INTO messages (
          id, chat_id, sender_id, type, content, attachment_id, reply_to_id,
          forward_from_sender_id, forward_from_sender_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        msgId,
        chatId,
        currentUserId,
        type,
        content,
        attachmentId ?? null,
        replyToId ?? null,
        forwardFromSenderId,
        forwardFromSenderName,
        now
      );

      db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(now, chatId);
      db.prepare(
        'UPDATE chat_members SET last_read_message_id = ? WHERE chat_id = ? AND user_id = ?'
      ).run(msgId, chatId, currentUserId);
    })();

    const message = chatService.getMessageById(msgId)!;
    io.to(`chat:${chatId}`).emit('message:new', { message });
    emitChatUpdated(chatId);

    return reply.code(201).send({ message });
  });

  app.patch('/api/messages/:messageId', { preHandler: authenticate }, async (request, reply) => {
    const { messageId } = request.params as { messageId: string };
    const currentUserId = request.authUser!.userId;

    const existing = db
      .prepare('SELECT id, chat_id, sender_id, type, deleted_at FROM messages WHERE id = ?')
      .get(messageId) as
      | { id: string; chat_id: string; sender_id: string; type: string; deleted_at: string | null }
      | undefined;

    if (!existing || existing.deleted_at) {
      return reply.code(404).send({ error: '消息不存在' });
    }
    if (existing.sender_id !== currentUserId) {
      return reply.code(403).send({ error: '只能编辑自己发送的消息' });
    }
    if (existing.type !== 'text') {
      return reply.code(400).send({ error: '仅支持编辑文本消息' });
    }

    const parsed = editMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || '消息内容无效' });
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?').run(
      parsed.data.content,
      now,
      messageId
    );

    const updated = chatService.getMessageById(messageId)!;
    io.to(`chat:${existing.chat_id}`).emit('message:updated', { message: updated });
    emitChatUpdated(existing.chat_id);

    return { message: updated };
  });

  app.delete('/api/messages/:messageId', { preHandler: authenticate }, async (request, reply) => {
    const { messageId } = request.params as { messageId: string };
    const currentUserId = request.authUser!.userId;

    const existing = db
      .prepare('SELECT id, chat_id, sender_id, deleted_at FROM messages WHERE id = ?')
      .get(messageId) as
      | { id: string; chat_id: string; sender_id: string; deleted_at: string | null }
      | undefined;

    if (!existing || existing.deleted_at) {
      return reply.code(404).send({ error: '消息不存在' });
    }

    const role = chatService.getMemberRole(existing.chat_id, currentUserId);
    const canDelete = existing.sender_id === currentUserId || role === 'owner' || role === 'admin';
    if (!canDelete) {
      return reply.code(403).send({ error: '无权删除该消息' });
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE messages SET deleted_at = ? WHERE id = ?').run(now, messageId);

    io.to(`chat:${existing.chat_id}`).emit('message:deleted', {
      chatId: existing.chat_id,
      messageId,
    });
    emitChatUpdated(existing.chat_id);

    return { ok: true };
  });

  app.post('/api/chats/:chatId/read', { preHandler: authenticate }, async (request, reply) => {
    const { chatId } = request.params as { chatId: string };
    const currentUserId = request.authUser!.userId;
    if (!chatService.getMemberRole(chatId, currentUserId)) {
      return reply.code(403).send({ error: '无权访问该会话' });
    }

    const parsed = markReadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: '无效的消息 ID' });
    }

    const target = db
      .prepare('SELECT id, created_at FROM messages WHERE id = ? AND chat_id = ?')
      .get(parsed.data.messageId, chatId) as { id: string; created_at: string } | undefined;

    if (!target) {
      return reply.code(404).send({ error: '消息不存在' });
    }

    db.prepare(
      'UPDATE chat_members SET last_read_message_id = ? WHERE chat_id = ? AND user_id = ?'
    ).run(target.id, chatId, currentUserId);

    io.to(`chat:${chatId}`).emit('chat:read', {
      chatId,
      userId: currentUserId,
      lastReadMessageId: target.id,
    });
    io.to(`user:${currentUserId}`).emit('chat:updated', { chatId });

    return { ok: true };
  });
}
