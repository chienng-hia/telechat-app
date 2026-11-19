import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { AttachmentDTO } from '@telechat/shared';
import { authenticate } from '../auth/jwt.js';

export function registerUploadRoutes(
  app: FastifyInstance,
  db: Database.Database,
  uploadDir: string
): void {
  fs.mkdirSync(uploadDir, { recursive: true });

  app.post('/api/uploads', { preHandler: authenticate }, async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: '未收到上传文件' });
    }

    const query = request.query as { durationSec?: string };
    const durationSec = query.durationSec ? Number(query.durationSec) : null;

    const ext = path.extname(file.filename || '').slice(0, 16);
    const id = `att-${crypto.randomUUID()}`;
    const storedName = `${id}${ext}`;
    const destPath = path.join(uploadDir, storedName);

    await pipeline(file.file, fs.createWriteStream(destPath));
    const stat = fs.statSync(destPath);
    const url = `/uploads/${storedName}`;
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO attachments (id, uploader_id, url, file_name, mime_type, size, duration_sec, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      request.authUser!.userId,
      url,
      file.filename || 'file',
      file.mimetype || 'application/octet-stream',
      stat.size,
      Number.isFinite(durationSec) ? durationSec : null,
      now
    );

    const attachment: AttachmentDTO = {
      id,
      url,
      fileName: file.filename || 'file',
      mimeType: file.mimetype || 'application/octet-stream',
      size: stat.size,
      durationSec: Number.isFinite(durationSec) ? durationSec : null,
    };

    return reply.code(201).send({ attachment });
  });
}
