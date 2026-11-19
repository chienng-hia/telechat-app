import type Database from 'better-sqlite3';
import { hashPassword } from '../auth/jwt.js';

export function seedDatabase(db: Database.Database): void {
  const existingCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
  if (existingCount > 0) {
    return;
  }

  const now = Date.now();
  const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
  const defaultHash = hashPassword('password123');

  const users = [
    {
      id: 'user-alice',
      username: 'alice',
      phone: '13800000001',
      displayName: 'Alice 林汐',
      bio: '产品设计师 · 喜欢简洁高效的工具',
      avatarColor: '#3b82f6',
      isDemo: 1,
      lastSeenAt: iso(-60_000),
      createdAt: iso(-86_400_000 * 5),
    },
    {
      id: 'user-bob',
      username: 'bob',
      phone: '13800000002',
      displayName: 'Bob 陈默',
      bio: '全栈工程师 · TypeScript / Rust',
      avatarColor: '#10b981',
      isDemo: 1,
      lastSeenAt: iso(-120_000),
      createdAt: iso(-86_400_000 * 5),
    },
    {
      id: 'user-charlie',
      username: 'charlie',
      phone: '13800000003',
      displayName: 'Charlie 周航',
      bio: '后端架构师 · 分布式系统爱好者',
      avatarColor: '#8b5cf6',
      isDemo: 1,
      lastSeenAt: iso(-300_000),
      createdAt: iso(-86_400_000 * 4),
    },
    {
      id: 'user-diana',
      username: 'diana',
      phone: '13800000004',
      displayName: 'Diana 苏禾',
      bio: 'UX 研究员 · 关注细节与交互体验',
      avatarColor: '#f59e0b',
      isDemo: 1,
      lastSeenAt: iso(-600_000),
      createdAt: iso(-86_400_000 * 3),
    },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, username, phone, password_hash, display_name, bio, avatar_color, is_demo, last_seen_at, created_at)
    VALUES (@id, @username, @phone, @passwordHash, @displayName, @bio, @avatarColor, @isDemo, @lastSeenAt, @createdAt)
  `);

  const insertChat = db.prepare(`
    INSERT INTO chats (id, type, title, description, avatar_color, created_by, created_at, updated_at)
    VALUES (@id, @type, @title, @description, @avatarColor, @createdBy, @createdAt, @updatedAt)
  `);

  const insertMember = db.prepare(`
    INSERT INTO chat_members (chat_id, user_id, role, last_read_message_id, joined_at)
    VALUES (@chatId, @userId, @role, @lastReadMessageId, @joinedAt)
  `);

  const insertMessage = db.prepare(`
    INSERT INTO messages (id, chat_id, sender_id, type, content, reply_to_id, created_at)
    VALUES (@id, @chatId, @senderId, @type, @content, @replyToId, @createdAt)
  `);

  const tx = db.transaction(() => {
    for (const u of users) {
      insertUser.run({ ...u, passwordHash: defaultHash });
    }

    // 1. DM between Alice and Bob
    insertChat.run({
      id: 'chat-dm-alice-bob',
      type: 'dm',
      title: '',
      description: '',
      avatarColor: '#10b981',
      createdBy: 'user-alice',
      createdAt: iso(-3_600_000 * 4),
      updatedAt: iso(-600_000),
    });
    insertMember.run({
      chatId: 'chat-dm-alice-bob',
      userId: 'user-alice',
      role: 'member',
      lastReadMessageId: 'msg-dm1-2',
      joinedAt: iso(-3_600_000 * 4),
    });
    insertMember.run({
      chatId: 'chat-dm-alice-bob',
      userId: 'user-bob',
      role: 'member',
      lastReadMessageId: 'msg-dm1-3',
      joinedAt: iso(-3_600_000 * 4),
    });

    insertMessage.run({
      id: 'msg-dm1-1',
      chatId: 'chat-dm-alice-bob',
      senderId: 'user-alice',
      type: 'text',
      content: '嗨 Bob，新版聊天界面的两栏布局定稿了，你要不要看看？',
      replyToId: null,
      createdAt: iso(-3_600_000 * 2),
    });
    insertMessage.run({
      id: 'msg-dm1-2',
      chatId: 'chat-dm-alice-bob',
      senderId: 'user-bob',
      type: 'text',
      content: '太棒了！我刚把 Socket.IO 的实时已读回执和语音消息接口调通。',
      replyToId: 'msg-dm1-1',
      createdAt: iso(-3_600_000),
    });
    insertMessage.run({
      id: 'msg-dm1-3',
      chatId: 'chat-dm-alice-bob',
      senderId: 'user-bob',
      type: 'text',
      content: '等下我们直接在群里测一下富媒体上传和全局搜索吧 👍',
      replyToId: null,
      createdAt: iso(-600_000),
    });

    // 2. Group chat: 产品设计与开发群
    insertChat.run({
      id: 'chat-group-team',
      type: 'group',
      title: '产品设计与开发群',
      description: '讨论 TeleChat 核心功能迭代、交互细节与技术架构',
      avatarColor: '#6366f1',
      createdBy: 'user-alice',
      createdAt: iso(-86_400_000),
      updatedAt: iso(-300_000),
    });
    insertMember.run({
      chatId: 'chat-group-team',
      userId: 'user-alice',
      role: 'owner',
      lastReadMessageId: 'msg-grp-2',
      joinedAt: iso(-86_400_000),
    });
    insertMember.run({
      chatId: 'chat-group-team',
      userId: 'user-bob',
      role: 'admin',
      lastReadMessageId: 'msg-grp-3',
      joinedAt: iso(-86_400_000),
    });
    insertMember.run({
      chatId: 'chat-group-team',
      userId: 'user-charlie',
      role: 'member',
      lastReadMessageId: 'msg-grp-2',
      joinedAt: iso(-86_400_000),
    });
    insertMember.run({
      chatId: 'chat-group-team',
      userId: 'user-diana',
      role: 'member',
      lastReadMessageId: 'msg-grp-1',
      joinedAt: iso(-86_400_000),
    });

    insertMessage.run({
      id: 'msg-grp-1',
      chatId: 'chat-group-team',
      senderId: 'user-alice',
      type: 'text',
      content: '欢迎大家加入 TeleChat 核心研发群！这里同步最新进度。',
      replyToId: null,
      createdAt: iso(-7_200_000),
    });
    insertMessage.run({
      id: 'msg-grp-2',
      chatId: 'chat-group-team',
      senderId: 'user-charlie',
      type: 'text',
      content: 'SQLite 本地零依赖架构已经验证通过，启动速度非常快。',
      replyToId: null,
      createdAt: iso(-1_800_000),
    });
    insertMessage.run({
      id: 'msg-grp-3',
      chatId: 'chat-group-team',
      senderId: 'user-diana',
      type: 'text',
      content: '暗黑模式和移动端响应式适配也记得一起验证一下哦 ✨',
      replyToId: 'msg-grp-2',
      createdAt: iso(-300_000),
    });

    // 3. DM between Alice and Diana
    insertChat.run({
      id: 'chat-dm-alice-diana',
      type: 'dm',
      title: '',
      description: '',
      avatarColor: '#f59e0b',
      createdBy: 'user-diana',
      createdAt: iso(-86_400_000),
      updatedAt: iso(-5_400_000),
    });
    insertMember.run({
      chatId: 'chat-dm-alice-diana',
      userId: 'user-alice',
      role: 'member',
      lastReadMessageId: 'msg-dm2-1',
      joinedAt: iso(-86_400_000),
    });
    insertMember.run({
      chatId: 'chat-dm-alice-diana',
      userId: 'user-diana',
      role: 'member',
      lastReadMessageId: 'msg-dm2-1',
      joinedAt: iso(-86_400_000),
    });
    insertMessage.run({
      id: 'msg-dm2-1',
      chatId: 'chat-dm-alice-diana',
      senderId: 'user-diana',
      type: 'text',
      content: '午饭后我们一起过一下新版的图标规范吧！',
      replyToId: null,
      createdAt: iso(-5_400_000),
    });
  });

  tx();
}
