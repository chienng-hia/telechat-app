import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ClientToServerEvents, ServerToClientEvents } from '@telechat/shared';
import { createDatabase } from './db/database.js';
import { seedDatabase } from './db/seed.js';
import { PresenceTracker } from './services/presence.js';
import { ChatService } from './services/chatService.js';
import { setupSocketHandlers } from './socket/index.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerUserRoutes } from './routes/users.js';
import { registerChatRoutes } from './routes/chats.js';
import { registerMessageRoutes } from './routes/messages.js';
import { registerUploadRoutes } from './routes/uploads.js';
import { registerSearchRoutes } from './routes/search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.resolve(__dirname, '../data/telechat.db');
const DEFAULT_UPLOAD_DIR = path.resolve(__dirname, '../uploads');

export interface CreateAppOptions {
  dbPath?: string;
  uploadDir?: string;
  seed?: boolean;
}

export async function createApp(options: CreateAppOptions = {}): Promise<{
  app: FastifyInstance;
  io: Server<ClientToServerEvents, ServerToClientEvents>;
  close: () => Promise<void>;
}> {
  const dbPath = options.dbPath ?? process.env.DB_PATH ?? DEFAULT_DB_PATH;
  const uploadDir = options.uploadDir ?? process.env.UPLOAD_DIR ?? DEFAULT_UPLOAD_DIR;
  const shouldSeed = options.seed ?? true;

  fs.mkdirSync(uploadDir, { recursive: true });

  const db = createDatabase(dbPath);
  if (shouldSeed) {
    seedDatabase(db);
  }

  const presence = new PresenceTracker();
  const chatService = new ChatService(db, presence);

  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(multipart, {
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB
    },
  });

  await app.register(fastifyStatic, {
    root: uploadDir,
    prefix: '/uploads/',
    decorateReply: false,
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  setupSocketHandlers(io, db, presence, chatService);

  app.get('/api/health', async () => ({ status: 'ok' }));

  registerAuthRoutes(app, db, chatService);
  registerUserRoutes(app, db, chatService);
  registerChatRoutes(app, db, chatService, io);
  registerMessageRoutes(app, db, chatService, io);
  registerUploadRoutes(app, db, uploadDir);
  registerSearchRoutes(app, db, chatService);

  const close = async () => {
    io.close();
    await app.close();
    db.close();
  };

  return { app, io, close };
}
