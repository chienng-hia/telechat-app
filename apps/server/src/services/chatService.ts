import type Database from 'better-sqlite3';
import type {
  AttachmentDTO,
  ChatDetailDTO,
  ChatDTO,
  ChatMemberDTO,
  MemberRole,
  MessageDTO,
  MessageType,
  ReplyPreviewDTO,
  UserDTO,
} from '@telechat/shared';
import type { PresenceTracker } from './presence.js';

interface UserRow {
  id: string;
  username: string;
  phone: string | null;
  display_name: string;
  bio: string;
  avatar_color: string;
  avatar_url: string | null;
  last_seen_at: string | null;
  created_at: string;
}

interface MessageRow {
  id: string;
  chat_id: string;
  sender_id: string;
  type: MessageType;
  content: string;
  attachment_id: string | null;
  reply_to_id: string | null;
  forward_from_sender_id: string | null;
  forward_from_sender_name: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  sender_username: string;
  sender_display_name: string;
  sender_avatar_color: string;
  sender_avatar_url: string | null;
  att_url: string | null;
  att_file_name: string | null;
  att_mime_type: string | null;
  att_size: number | null;
  att_duration_sec: number | null;
}

export class ChatService {
  constructor(
    private readonly db: Database.Database,
    private readonly presence: PresenceTracker
  ) {}

  mapUser(row: UserRow): UserDTO {
    return {
      id: row.id,
      username: row.username,
      phone: row.phone,
      displayName: row.display_name,
      bio: row.bio,
      avatarColor: row.avatar_color,
      avatarUrl: row.avatar_url,
      online: this.presence.isOnline(row.id),
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
    };
  }

  getUserById(userId: string): UserDTO | null {
    const row = this.db
      .prepare(
        `SELECT id, username, phone, display_name, bio, avatar_color, avatar_url, last_seen_at, created_at
         FROM users WHERE id = ?`
      )
      .get(userId) as UserRow | undefined;
    return row ? this.mapUser(row) : null;
  }

  getMemberRole(chatId: string, userId: string): MemberRole | null {
    const row = this.db
      .prepare('SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?')
      .get(chatId, userId) as { role: MemberRole } | undefined;
    return row ? row.role : null;
  }

  getChatMemberIds(chatId: string): string[] {
    const rows = this.db
      .prepare('SELECT user_id FROM chat_members WHERE chat_id = ?')
      .all(chatId) as Array<{ user_id: string }>;
    return rows.map((r) => r.user_id);
  }

  private getMaxOtherReadTimestamp(chatId: string, senderId: string): string | null {
    const row = this.db
      .prepare(
        `SELECT MAX(m.created_at) as max_read_at
         FROM chat_members cm
         JOIN messages m ON m.id = cm.last_read_message_id
         WHERE cm.chat_id = ? AND cm.user_id != ?`
      )
      .get(chatId, senderId) as { max_read_at: string | null } | undefined;
    return row?.max_read_at ?? null;
  }

  private getReplyPreview(replyToId: string | null): ReplyPreviewDTO | null {
    if (!replyToId) return null;
    const row = this.db
      .prepare(
        `SELECT m.id, m.sender_id, u.display_name as sender_name, m.type, m.content, m.deleted_at
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.id = ?`
      )
      .get(replyToId) as
      | {
          id: string;
          sender_id: string;
          sender_name: string;
          type: MessageType;
          content: string;
          deleted_at: string | null;
        }
      | undefined;
    if (!row || row.deleted_at) return null;
    return {
      id: row.id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      type: row.type,
      content: row.content,
    };
  }

  private mapMessageRow(row: MessageRow, maxOtherReadAt?: string | null): MessageDTO {
    const attachment: AttachmentDTO | null =
      row.attachment_id && row.att_url
        ? {
            id: row.attachment_id,
            url: row.att_url,
            fileName: row.att_file_name || 'file',
            mimeType: row.att_mime_type || 'application/octet-stream',
            size: row.att_size || 0,
            durationSec: row.att_duration_sec,
          }
        : null;

    const readWatermark =
      maxOtherReadAt !== undefined
        ? maxOtherReadAt
        : this.getMaxOtherReadTimestamp(row.chat_id, row.sender_id);

    const isRead = Boolean(readWatermark && readWatermark >= row.created_at);

    return {
      id: row.id,
      chatId: row.chat_id,
      senderId: row.sender_id,
      sender: {
        id: row.sender_id,
        username: row.sender_username,
        displayName: row.sender_display_name,
        avatarColor: row.sender_avatar_color,
        avatarUrl: row.sender_avatar_url,
      },
      type: row.type,
      content: row.content,
      attachment,
      replyTo: this.getReplyPreview(row.reply_to_id),
      forwardFrom:
        row.forward_from_sender_id && row.forward_from_sender_name
          ? {
              senderId: row.forward_from_sender_id,
              senderName: row.forward_from_sender_name,
            }
          : null,
      editedAt: row.edited_at,
      deletedAt: row.deleted_at,
      isRead,
      createdAt: row.created_at,
    };
  }

  getMessageById(messageId: string): MessageDTO | null {
    const row = this.db
      .prepare(
        `SELECT m.*,
                u.username as sender_username,
                u.display_name as sender_display_name,
                u.avatar_color as sender_avatar_color,
                u.avatar_url as sender_avatar_url,
                a.url as att_url,
                a.file_name as att_file_name,
                a.mime_type as att_mime_type,
                a.size as att_size,
                a.duration_sec as att_duration_sec
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         LEFT JOIN attachments a ON a.id = m.attachment_id
         WHERE m.id = ? AND m.deleted_at IS NULL`
      )
      .get(messageId) as MessageRow | undefined;

    return row ? this.mapMessageRow(row) : null;
  }

  getChatMessages(chatId: string, limit = 50, beforeId?: string): MessageDTO[] {
    let beforeCreatedAt: string | null = null;
    if (beforeId) {
      const ref = this.db
        .prepare('SELECT created_at FROM messages WHERE id = ? AND chat_id = ?')
        .get(beforeId, chatId) as { created_at: string } | undefined;
      if (ref) {
        beforeCreatedAt = ref.created_at;
      }
    }

    const rows = (
      beforeCreatedAt
        ? this.db
            .prepare(
              `SELECT m.*,
                      u.username as sender_username,
                      u.display_name as sender_display_name,
                      u.avatar_color as sender_avatar_color,
                      u.avatar_url as sender_avatar_url,
                      a.url as att_url,
                      a.file_name as att_file_name,
                      a.mime_type as att_mime_type,
                      a.size as att_size,
                      a.duration_sec as att_duration_sec
               FROM messages m
               JOIN users u ON u.id = m.sender_id
               LEFT JOIN attachments a ON a.id = m.attachment_id
               WHERE m.chat_id = ? AND m.deleted_at IS NULL AND m.created_at < ?
               ORDER BY m.created_at DESC, m.id DESC
               LIMIT ?`
            )
            .all(chatId, beforeCreatedAt, limit)
        : this.db
            .prepare(
              `SELECT m.*,
                      u.username as sender_username,
                      u.display_name as sender_display_name,
                      u.avatar_color as sender_avatar_color,
                      u.avatar_url as sender_avatar_url,
                      a.url as att_url,
                      a.file_name as att_file_name,
                      a.mime_type as att_mime_type,
                      a.size as att_size,
                      a.duration_sec as att_duration_sec
               FROM messages m
               JOIN users u ON u.id = m.sender_id
               LEFT JOIN attachments a ON a.id = m.attachment_id
               WHERE m.chat_id = ? AND m.deleted_at IS NULL
               ORDER BY m.created_at DESC, m.id DESC
               LIMIT ?`
            )
            .all(chatId, limit)
    ) as MessageRow[];

    return rows.reverse().map((row) => this.mapMessageRow(row));
  }

  getChatDTO(chatId: string, currentUserId: string): ChatDTO | null {
    const chat = this.db
      .prepare(
        `SELECT c.*, cm.role as my_role, cm.last_read_message_id as my_last_read_id
         FROM chats c
         JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = ?
         WHERE c.id = ?`
      )
      .get(currentUserId, chatId) as
      | {
          id: string;
          type: 'dm' | 'group';
          title: string;
          description: string;
          avatar_color: string;
          avatar_url: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          my_role: MemberRole;
          my_last_read_id: string | null;
        }
      | undefined;

    if (!chat) return null;

    const memberCount = (
      this.db.prepare('SELECT COUNT(*) as cnt FROM chat_members WHERE chat_id = ?').get(chatId) as {
        cnt: number;
      }
    ).cnt;

    let otherUser: UserDTO | null = null;
    if (chat.type === 'dm') {
      const otherRow = this.db
        .prepare(
          `SELECT u.id, u.username, u.phone, u.display_name, u.bio, u.avatar_color, u.avatar_url, u.last_seen_at, u.created_at
           FROM chat_members cm
           JOIN users u ON u.id = cm.user_id
           WHERE cm.chat_id = ? AND cm.user_id != ?
           LIMIT 1`
        )
        .get(chatId, currentUserId) as UserRow | undefined;
      if (otherRow) {
        otherUser = this.mapUser(otherRow);
      }
    }

    const lastMsgRow = this.db
      .prepare(
        `SELECT m.*,
                u.username as sender_username,
                u.display_name as sender_display_name,
                u.avatar_color as sender_avatar_color,
                u.avatar_url as sender_avatar_url,
                a.url as att_url,
                a.file_name as att_file_name,
                a.mime_type as att_mime_type,
                a.size as att_size,
                a.duration_sec as att_duration_sec
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         LEFT JOIN attachments a ON a.id = m.attachment_id
         WHERE m.chat_id = ? AND m.deleted_at IS NULL
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT 1`
      )
      .get(chatId) as MessageRow | undefined;

    let myLastReadAt: string | null = null;
    if (chat.my_last_read_id) {
      const ref = this.db
        .prepare('SELECT created_at FROM messages WHERE id = ?')
        .get(chat.my_last_read_id) as { created_at: string } | undefined;
      myLastReadAt = ref?.created_at ?? null;
    }

    const unreadCount = (
      myLastReadAt
        ? this.db
            .prepare(
              `SELECT COUNT(*) as cnt FROM messages
               WHERE chat_id = ? AND sender_id != ? AND deleted_at IS NULL AND created_at > ?`
            )
            .get(chatId, currentUserId, myLastReadAt)
        : this.db
            .prepare(
              `SELECT COUNT(*) as cnt FROM messages
               WHERE chat_id = ? AND sender_id != ? AND deleted_at IS NULL`
            )
            .get(chatId, currentUserId)
    ) as { cnt: number };

    return {
      id: chat.id,
      type: chat.type,
      title: chat.type === 'dm' && otherUser ? otherUser.displayName : chat.title,
      description: chat.description,
      avatarColor: chat.type === 'dm' && otherUser ? otherUser.avatarColor : chat.avatar_color,
      avatarUrl: chat.type === 'dm' && otherUser ? otherUser.avatarUrl : chat.avatar_url,
      createdBy: chat.created_by,
      createdAt: chat.created_at,
      updatedAt: chat.updated_at,
      memberCount,
      otherUser,
      lastMessage: lastMsgRow ? this.mapMessageRow(lastMsgRow) : null,
      unreadCount: unreadCount.cnt,
      myRole: chat.my_role,
    };
  }

  getUserChats(currentUserId: string): ChatDTO[] {
    const rows = this.db
      .prepare(
        `SELECT c.id
         FROM chats c
         JOIN chat_members cm ON cm.chat_id = c.id
         WHERE cm.user_id = ?
         ORDER BY c.updated_at DESC`
      )
      .all(currentUserId) as Array<{ id: string }>;

    return rows
      .map((r) => this.getChatDTO(r.id, currentUserId))
      .filter((c): c is ChatDTO => c !== null);
  }

  getChatDetailDTO(chatId: string, currentUserId: string): ChatDetailDTO | null {
    const base = this.getChatDTO(chatId, currentUserId);
    if (!base) return null;

    const memberRows = this.db
      .prepare(
        `SELECT cm.user_id, cm.role, cm.joined_at, cm.last_read_message_id,
                u.id, u.username, u.phone, u.display_name, u.bio, u.avatar_color, u.avatar_url, u.last_seen_at, u.created_at
         FROM chat_members cm
         JOIN users u ON u.id = cm.user_id
         WHERE cm.chat_id = ?
         ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, cm.joined_at ASC`
      )
      .all(chatId) as Array<
      UserRow & {
        user_id: string;
        role: MemberRole;
        joined_at: string;
        last_read_message_id: string | null;
      }
    >;

    const members: ChatMemberDTO[] = memberRows.map((r) => ({
      userId: r.user_id,
      role: r.role,
      joinedAt: r.joined_at,
      lastReadMessageId: r.last_read_message_id,
      user: this.mapUser(r),
    }));

    return {
      ...base,
      members,
    };
  }
}
