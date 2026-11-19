import type { Server, Socket } from 'socket.io';
import type Database from 'better-sqlite3';
import type { ClientToServerEvents, ServerToClientEvents } from '@telechat/shared';
import { verifyToken } from '../auth/jwt.js';
import type { PresenceTracker } from '../services/presence.js';
import type { ChatService } from '../services/chatService.js';

interface SocketData {
  userId: string;
  username: string;
  displayName: string;
}

export function setupSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
  db: Database.Database,
  presence: PresenceTracker,
  chatService: ChatService
): void {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error('Unauthorized'));
      return;
    }

    try {
      const payload = verifyToken(token);
      const user = chatService.getUserById(payload.userId);
      if (!user) {
        next(new Error('User not found'));
        return;
      }
      socket.data.userId = user.id;
      socket.data.username = user.username;
      socket.data.displayName = user.displayName;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>) => {
    const { userId, displayName } = socket.data;
    socket.join(`user:${userId}`);

    // Join all chats this user belongs to
    const chats = chatService.getUserChats(userId);
    for (const c of chats) {
      socket.join(`chat:${c.id}`);
    }

    const becameOnline = presence.addSocket(userId, socket.id);
    if (becameOnline) {
      io.emit('presence:update', { userId, online: true, lastSeenAt: null });
    }

    socket.on('chat:join', ({ chatId }) => {
      if (chatService.getMemberRole(chatId, userId)) {
        socket.join(`chat:${chatId}`);
      }
    });

    socket.on('typing:start', ({ chatId }) => {
      if (chatService.getMemberRole(chatId, userId)) {
        socket.to(`chat:${chatId}`).emit('typing:start', { chatId, userId, displayName });
      }
    });

    socket.on('typing:stop', ({ chatId }) => {
      if (chatService.getMemberRole(chatId, userId)) {
        socket.to(`chat:${chatId}`).emit('typing:stop', { chatId, userId });
      }
    });

    socket.on('disconnect', () => {
      const becameOffline = presence.removeSocket(userId, socket.id);
      if (becameOffline) {
        const now = new Date().toISOString();
        db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(now, userId);
        io.emit('presence:update', { userId, online: false, lastSeenAt: now });
      }
    });
  });
}
