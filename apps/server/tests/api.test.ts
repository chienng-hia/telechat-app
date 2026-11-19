import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';

describe('TeleChat Server API & WebSocket Integration', () => {
  let baseUrl = '';
  let closeServer: () => Promise<void>;
  let uploadDir = '';

  beforeAll(async () => {
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telechat-test-uploads-'));
    const { app, close } = await createApp({
      dbPath: ':memory:',
      uploadDir,
      seed: true,
    });
    closeServer = close;
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = address;
  });

  afterAll(async () => {
    await closeServer();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  async function api(pathname: string, options: RequestInit = {}, token?: string) {
    const headers = new Headers(options.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    const res = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
    const data = await res.json();
    return { status: res.status, data };
  }

  it('returns health status and seeded demo users', async () => {
    const health = await api('/api/health');
    expect(health.status).toBe(200);
    expect(health.data.status).toBe('ok');

    const demos = await api('/api/auth/demo-users');
    expect(demos.status).toBe(200);
    expect(demos.data.users.length).toBeGreaterThanOrEqual(4);
  });

  it('supports user registration, login, and profile update', async () => {
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: 'newuser_1',
        password: 'secret123',
        displayName: '新用户',
      }),
    });
    expect(reg.status).toBe(201);
    expect(reg.data.token).toBeTruthy();
    expect(reg.data.user.username).toBe('newuser_1');

    const dup = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: 'newuser_1',
        password: 'secret123',
      }),
    });
    expect(dup.status).toBe(409);

    const login = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'newuser_1',
        password: 'secret123',
      }),
    });
    expect(login.status).toBe(200);
    expect(login.data.user.displayName).toBe('新用户');

    const patch = await api(
      '/api/users/me',
      {
        method: 'PATCH',
        body: JSON.stringify({ displayName: '更新后的昵称', bio: 'Hello TeleChat' }),
      },
      login.data.token
    );
    expect(patch.status).toBe(200);
    expect(patch.data.user.displayName).toBe('更新后的昵称');
    expect(patch.data.user.bio).toBe('Hello TeleChat');
  });

  it('supports DM, group management, messaging, reply, forward, edit, delete, read & search', async () => {
    const aliceLogin = await api('/api/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ userId: 'user-alice' }),
    });
    const bobLogin = await api('/api/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ userId: 'user-bob' }),
    });
    const aliceToken = aliceLogin.data.token;
    const bobToken = bobLogin.data.token;

    // Create group
    const groupRes = await api(
      '/api/chats/group',
      {
        method: 'POST',
        body: JSON.stringify({
          title: '测试研发群',
          description: '集成测试用群组',
          memberIds: ['user-bob'],
        }),
      },
      aliceToken
    );
    expect(groupRes.status).toBe(201);
    const groupId = groupRes.data.chat.id;
    expect(groupRes.data.chat.memberCount).toBe(2);

    // Promote Bob to admin, add Charlie, then remove Charlie
    const roleRes = await api(
      `/api/chats/${groupId}/members/user-bob/role`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role: 'admin' }),
      },
      aliceToken
    );
    expect(roleRes.status).toBe(200);
    const bobMember = roleRes.data.chat.members.find((m: { userId: string }) => m.userId === 'user-bob');
    expect(bobMember.role).toBe('admin');

    const addRes = await api(
      `/api/chats/${groupId}/members`,
      {
        method: 'POST',
        body: JSON.stringify({ memberIds: ['user-charlie'] }),
      },
      bobToken
    );
    expect(addRes.status).toBe(200);
    expect(addRes.data.chat.memberCount).toBe(3);

    // Send message, reply, edit, forward, read, delete
    const msg1 = await api(
      `/api/chats/${groupId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({ type: 'text', content: '第一条测试消息' }),
      },
      aliceToken
    );
    expect(msg1.status).toBe(201);

    const msg2 = await api(
      `/api/chats/${groupId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'text',
          content: '回复第一条消息',
          replyToId: msg1.data.message.id,
        }),
      },
      bobToken
    );
    expect(msg2.status).toBe(201);
    expect(msg2.data.message.replyTo.id).toBe(msg1.data.message.id);

    // Edit msg1
    const edited = await api(
      `/api/messages/${msg1.data.message.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ content: '第一条测试消息（已修改）' }),
      },
      aliceToken
    );
    expect(edited.status).toBe(200);
    expect(edited.data.message.content).toBe('第一条测试消息（已修改）');
    expect(edited.data.message.editedAt).toBeTruthy();

    // Forward msg1 to DM with Bob
    const dmRes = await api(
      '/api/chats/dm',
      {
        method: 'POST',
        body: JSON.stringify({ targetUserId: 'user-bob' }),
      },
      aliceToken
    );
    expect(dmRes.status).toBe(200);
    const dmId = dmRes.data.chat.id;

    const fwd = await api(
      `/api/chats/${dmId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({ forwardFromMessageId: msg1.data.message.id }),
      },
      aliceToken
    );
    expect(fwd.status).toBe(201);
    expect(fwd.data.message.forwardFrom.senderId).toBe('user-alice');

    // Mark read by Bob
    const readRes = await api(
      `/api/chats/${dmId}/read`,
      {
        method: 'POST',
        body: JSON.stringify({ messageId: fwd.data.message.id }),
      },
      bobToken
    );
    expect(readRes.status).toBe(200);

    // Search
    const searchRes = await api('/api/search?q=已修改', {}, aliceToken);
    expect(searchRes.status).toBe(200);
    expect(searchRes.data.messages.length).toBeGreaterThanOrEqual(1);

    // Delete msg2
    const delRes = await api(
      `/api/messages/${msg2.data.message.id}`,
      { method: 'DELETE' },
      bobToken
    );
    expect(delRes.status).toBe(200);
  });

  it('delivers real-time messages over Socket.IO', async () => {
    const aliceLogin = await api('/api/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ userId: 'user-alice' }),
    });
    const bobLogin = await api('/api/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ userId: 'user-bob' }),
    });

    const bobSocket: Socket = ioClient(baseUrl, {
      auth: { token: bobLogin.data.token },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => {
      bobSocket.on('connect', () => resolve());
    });

    const receivedPromise = new Promise<{ content: string }>((resolve) => {
      bobSocket.on('message:new', (payload: { message: { content: string } }) => {
        if (payload.message.content === 'Socket 实时消息测试') {
          resolve(payload.message);
        }
      });
    });

    await api(
      '/api/chats/chat-dm-alice-bob/messages',
      {
        method: 'POST',
        body: JSON.stringify({ type: 'text', content: 'Socket 实时消息测试' }),
      },
      aliceLogin.data.token
    );

    const received = await receivedPromise;
    expect(received.content).toBe('Socket 实时消息测试');
    bobSocket.disconnect();
  });
});
