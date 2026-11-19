export type ChatType = 'dm' | 'group';
export type MemberRole = 'owner' | 'admin' | 'member';
export type MessageType = 'text' | 'image' | 'file' | 'voice' | 'system';

export interface UserDTO {
  id: string;
  username: string;
  phone: string | null;
  displayName: string;
  bio: string;
  avatarColor: string;
  avatarUrl: string | null;
  online: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface AttachmentDTO {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
  durationSec: number | null;
}

export interface ReplyPreviewDTO {
  id: string;
  senderId: string;
  senderName: string;
  type: MessageType;
  content: string;
}

export interface ForwardOriginDTO {
  senderId: string;
  senderName: string;
}

export interface MessageDTO {
  id: string;
  chatId: string;
  senderId: string;
  sender: {
    id: string;
    username: string;
    displayName: string;
    avatarColor: string;
    avatarUrl: string | null;
  };
  type: MessageType;
  content: string;
  attachment: AttachmentDTO | null;
  replyTo: ReplyPreviewDTO | null;
  forwardFrom: ForwardOriginDTO | null;
  editedAt: string | null;
  deletedAt: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface ChatMemberDTO {
  userId: string;
  role: MemberRole;
  joinedAt: string;
  lastReadMessageId: string | null;
  user: UserDTO;
}

export interface ChatDTO {
  id: string;
  type: ChatType;
  title: string;
  description: string;
  avatarColor: string;
  avatarUrl: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  otherUser: UserDTO | null;
  lastMessage: MessageDTO | null;
  unreadCount: number;
  myRole: MemberRole;
}

export interface ChatDetailDTO extends ChatDTO {
  members: ChatMemberDTO[];
}

export interface GlobalSearchResultDTO {
  users: UserDTO[];
  chats: ChatDTO[];
  messages: Array<MessageDTO & { chatTitle: string; chatType: ChatType }>;
}

export interface AuthResponseDTO {
  token: string;
  user: UserDTO;
}

export interface DemoUserDTO {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarColor: string;
}

export interface ServerToClientEvents {
  'message:new': (payload: { message: MessageDTO }) => void;
  'message:updated': (payload: { message: MessageDTO }) => void;
  'message:deleted': (payload: { chatId: string; messageId: string }) => void;
  'chat:updated': (payload: { chatId: string }) => void;
  'chat:read': (payload: { chatId: string; userId: string; lastReadMessageId: string }) => void;
  'typing:start': (payload: { chatId: string; userId: string; displayName: string }) => void;
  'typing:stop': (payload: { chatId: string; userId: string }) => void;
  'presence:update': (payload: { userId: string; online: boolean; lastSeenAt: string | null }) => void;
}

export interface ClientToServerEvents {
  'chat:join': (payload: { chatId: string }) => void;
  'typing:start': (payload: { chatId: string }) => void;
  'typing:stop': (payload: { chatId: string }) => void;
}
