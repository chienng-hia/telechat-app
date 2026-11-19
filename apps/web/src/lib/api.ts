import type {
  AttachmentDTO,
  AuthResponseDTO,
  ChatDetailDTO,
  ChatDTO,
  DemoUserDTO,
  GlobalSearchResultDTO,
  MemberRole,
  MessageDTO,
  MessageType,
  UserDTO,
} from '@telechat/shared';

const TOKEN_KEY = 'telechat_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data as T;
}

export const api = {
  getDemoUsers: () => request<{ users: DemoUserDTO[] }>('/api/auth/demo-users'),

  demoLogin: (userId: string) =>
    request<AuthResponseDTO>('/api/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),

  register: (payload: {
    username: string;
    phone?: string;
    password: string;
    displayName?: string;
  }) =>
    request<AuthResponseDTO>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { identifier: string; password: string }) =>
    request<AuthResponseDTO>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  me: () => request<{ user: UserDTO }>('/api/auth/me'),

  updateProfile: (payload: { displayName?: string; bio?: string; avatarColor?: string }) =>
    request<{ user: UserDTO }>('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  searchUsers: (q: string) =>
    request<{ users: UserDTO[] }>(`/api/users/search?q=${encodeURIComponent(q)}`),

  getChats: () => request<{ chats: ChatDTO[] }>('/api/chats'),

  createDm: (targetUserId: string) =>
    request<{ chat: ChatDTO }>('/api/chats/dm', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    }),

  createGroup: (payload: { title: string; description?: string; memberIds: string[] }) =>
    request<{ chat: ChatDTO }>('/api/chats/group', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getChatDetail: (chatId: string) => request<{ chat: ChatDetailDTO }>(`/api/chats/${chatId}`),

  updateGroup: (chatId: string, payload: { title?: string; description?: string }) =>
    request<{ chat: ChatDetailDTO }>(`/api/chats/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  addGroupMembers: (chatId: string, memberIds: string[]) =>
    request<{ chat: ChatDetailDTO }>(`/api/chats/${chatId}/members`, {
      method: 'POST',
      body: JSON.stringify({ memberIds }),
    }),

  removeGroupMember: (chatId: string, userId: string) =>
    request<{ ok: boolean }>(`/api/chats/${chatId}/members/${userId}`, {
      method: 'DELETE',
    }),

  updateMemberRole: (chatId: string, userId: string, role: Exclude<MemberRole, 'owner'>) =>
    request<{ chat: ChatDetailDTO }>(`/api/chats/${chatId}/members/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  getMessages: (chatId: string, before?: string) => {
    const params = new URLSearchParams({ limit: '50' });
    if (before) params.set('before', before);
    return request<{ messages: MessageDTO[]; hasMore: boolean }>(
      `/api/chats/${chatId}/messages?${params.toString()}`
    );
  },

  sendMessage: (
    chatId: string,
    payload: {
      type?: Exclude<MessageType, 'system'>;
      content?: string;
      attachmentId?: string | null;
      replyToId?: string | null;
      forwardFromMessageId?: string | null;
    }
  ) =>
    request<{ message: MessageDTO }>(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  editMessage: (messageId: string, content: string) =>
    request<{ message: MessageDTO }>(`/api/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),

  deleteMessage: (messageId: string) =>
    request<{ ok: boolean }>(`/api/messages/${messageId}`, {
      method: 'DELETE',
    }),

  markRead: (chatId: string, messageId: string) =>
    request<{ ok: boolean }>(`/api/chats/${chatId}/read`, {
      method: 'POST',
      body: JSON.stringify({ messageId }),
    }),

  uploadFile: (file: Blob, fileName: string, durationSec?: number) => {
    const formData = new FormData();
    formData.append('file', file, fileName);
    const qs = durationSec !== undefined ? `?durationSec=${durationSec.toFixed(1)}` : '';
    return request<{ attachment: AttachmentDTO }>(`/api/uploads${qs}`, {
      method: 'POST',
      body: formData,
    });
  },

  globalSearch: (q: string) =>
    request<GlobalSearchResultDTO>(`/api/search?q=${encodeURIComponent(q)}`),
};
