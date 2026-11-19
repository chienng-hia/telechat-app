import React, { useEffect, useState } from 'react';
import type { ChatDetailDTO, ChatDTO, MessageDTO, UserDTO } from '@telechat/shared';
import {
  Check,
  Crown,
  LogOut,
  Search,
  Shield,
  ShieldOff,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatLastSeen } from '../lib/format';
import { Avatar } from './Avatar';

const AVATAR_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'];

const ModalShell: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
    onClick={onClose}
  >
    <div
      className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-base font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-5 max-h-[75vh] overflow-y-auto">{children}</div>
    </div>
  </div>
);

export const NewChatModal: React.FC<{
  onClose: () => void;
  onSelectChat: (chat: ChatDTO) => void;
}> = ({ onClose, onSelectChat }) => {
  const [tab, setTab] = useState<'dm' | 'group'>('dm');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      api
        .searchUsers(query)
        .then((res) => setUsers(res.users))
        .catch(() => {});
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  const handleStartDm = async (userId: string) => {
    setLoading(true);
    try {
      const res = await api.createDm(userId);
      onSelectChat(res.chat);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupTitle.trim()) return;
    setLoading(true);
    try {
      const res = await api.createGroup({
        title: groupTitle.trim(),
        description: groupDesc.trim(),
        memberIds: selectedIds,
      });
      onSelectChat(res.chat);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <ModalShell title="新建会话" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
          <button
            type="button"
            onClick={() => setTab('dm')}
            className={`py-1.5 text-xs font-medium rounded-lg transition cursor-pointer ${
              tab === 'dm'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            发起私聊
          </button>
          <button
            type="button"
            onClick={() => setTab('group')}
            className={`py-1.5 text-xs font-medium rounded-lg transition cursor-pointer ${
              tab === 'group'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            创建群聊
          </button>
        </div>

        {tab === 'group' && (
          <div className="space-y-2.5">
            <input
              type="text"
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
              placeholder="群名称（必填）"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-sm outline-none focus:border-sky-500"
            />
            <input
              type="text"
              value={groupDesc}
              onChange={(e) => setGroupDesc(e.target.value)}
              placeholder="群简介（选填）"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-sm outline-none focus:border-sky-500"
            />
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索 @username 或昵称..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-9 pr-3 py-2 text-sm outline-none focus:border-sky-500"
          />
        </div>

        <div className="space-y-1 max-h-60 overflow-y-auto">
          {users.map((u) => {
            const selected = selectedIds.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                disabled={loading}
                onClick={() => (tab === 'dm' ? handleStartDm(u.id) : toggleSelect(u.id))}
                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition text-left cursor-pointer"
              >
                <Avatar name={u.displayName} color={u.avatarColor} size="sm" online={u.online} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{u.displayName}</div>
                  <div className="text-xs text-slate-400 truncate">@{u.username}</div>
                </div>
                {tab === 'group' && (
                  <div
                    className={`h-5 w-5 rounded-full border flex items-center justify-center ${
                      selected
                        ? 'bg-sky-500 border-sky-500 text-white'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {selected && <Check className="h-3 w-3" />}
                  </div>
                )}
              </button>
            );
          })}
          {users.length === 0 && (
            <div className="text-center py-6 text-xs text-slate-400">未找到匹配用户</div>
          )}
        </div>

        {tab === 'group' && (
          <button
            type="button"
            disabled={loading || !groupTitle.trim()}
            onClick={handleCreateGroup}
            className="w-full rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-medium py-2.5 text-sm transition disabled:opacity-50 cursor-pointer"
          >
            创建群聊（已选 {selectedIds.length} 人）
          </button>
        )}
      </div>
    </ModalShell>
  );
};

export const ChatInfoModal: React.FC<{
  chatId: string;
  currentUserId: string;
  onClose: () => void;
  onLeftGroup: (chatId: string) => void;
  onUpdated: () => void;
}> = ({ chatId, currentUserId, onClose, onLeftGroup, onUpdated }) => {
  const [detail, setDetail] = useState<ChatDetailDTO | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [adding, setAdding] = useState(false);
  const [candidates, setCandidates] = useState<UserDTO[]>([]);

  const loadDetail = async () => {
    const res = await api.getChatDetail(chatId);
    setDetail(res.chat);
    setTitle(res.chat.title);
    setDescription(res.chat.description);
  };

  useEffect(() => {
    loadDetail().catch(() => {});
  }, [chatId]);

  const openAddMembers = async () => {
    setAdding(true);
    const res = await api.searchUsers('');
    const existingIds = new Set(detail?.members.map((m) => m.userId) || []);
    setCandidates(res.users.filter((u) => !existingIds.has(u.id)));
  };

  const handleAddMember = async (userId: string) => {
    await api.addGroupMembers(chatId, [userId]);
    setCandidates((prev) => prev.filter((u) => u.id !== userId));
    await loadDetail();
    onUpdated();
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.updateGroup(chatId, { title, description });
    setEditing(false);
    await loadDetail();
    onUpdated();
  };

  const handleRoleToggle = async (userId: string, currentRole: string) => {
    const nextRole = currentRole === 'admin' ? 'member' : 'admin';
    await api.updateMemberRole(chatId, userId, nextRole);
    await loadDetail();
  };

  const handleRemoveMember = async (userId: string) => {
    await api.removeGroupMember(chatId, userId);
    if (userId === currentUserId) {
      onLeftGroup(chatId);
      onClose();
    } else {
      await loadDetail();
      onUpdated();
    }
  };

  if (!detail) {
    return (
      <ModalShell title="会话详情" onClose={onClose}>
        <div className="py-8 text-center text-sm text-slate-400">加载中...</div>
      </ModalShell>
    );
  }

  if (detail.type === 'dm' && detail.otherUser) {
    const u = detail.otherUser;
    return (
      <ModalShell title="联系人信息" onClose={onClose}>
        <div className="flex flex-col items-center text-center space-y-3 py-2">
          <Avatar name={u.displayName} color={u.avatarColor} size="xl" online={u.online} />
          <div>
            <h3 className="text-lg font-semibold">{u.displayName}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              @{u.username} · {formatLastSeen(u.online, u.lastSeenAt)}
            </p>
          </div>
          {u.bio && (
            <div className="w-full rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3 text-xs text-slate-600 dark:text-slate-300">
              {u.bio}
            </div>
          )}
        </div>
      </ModalShell>
    );
  }

  const canManage = detail.myRole === 'owner' || detail.myRole === 'admin';

  return (
    <ModalShell title="群聊信息" onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center gap-3.5">
          <Avatar name={detail.title} color={detail.avatarColor} size="lg" isGroup />
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold truncate">{detail.title}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {detail.memberCount} 位成员
            </p>
          </div>
          {canManage && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-sky-500 hover:underline cursor-pointer"
            >
              编辑资料
            </button>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleSaveGroup} className="space-y-2.5">
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm outline-none"
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="群简介"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 text-xs rounded-lg bg-sky-500 text-white cursor-pointer"
              >
                保存
              </button>
            </div>
          </form>
        ) : (
          detail.description && (
            <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/70 rounded-xl p-3">
              {detail.description}
            </p>
          )
        )}

        {/* Members */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <Users className="h-3.5 w-3.5" />
              <span>群成员 ({detail.members.length})</span>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => (adding ? setAdding(false) : openAddMembers())}
                className="flex items-center gap-1 text-xs text-sky-500 hover:underline cursor-pointer"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>{adding ? '收起' : '邀请成员'}</span>
              </button>
            )}
          </div>

          {adding && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-2 space-y-1 bg-slate-50 dark:bg-slate-800/40 max-h-40 overflow-y-auto">
              {candidates.length === 0 ? (
                <div className="text-xs text-slate-400 text-center py-2">没有可添加的新成员</div>
              ) : (
                candidates.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleAddMember(u.id)}
                    className="w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar name={u.displayName} color={u.avatarColor} size="sm" />
                      <span className="text-xs font-medium truncate">{u.displayName}</span>
                    </div>
                    <span className="text-[11px] text-sky-500">+ 添加</span>
                  </button>
                ))
              )}
            </div>
          )}

          <div className="space-y-1">
            {detail.members.map((m) => (
              <div
                key={m.userId}
                className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <Avatar
                  name={m.user.displayName}
                  color={m.user.avatarColor}
                  size="sm"
                  online={m.user.online}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{m.user.displayName}</span>
                    {m.role === 'owner' && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        <Crown className="h-2.5 w-2.5" /> 群主
                      </span>
                    )}
                    {m.role === 'admin' && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400">
                        <Shield className="h-2.5 w-2.5" /> 管理员
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">@{m.user.username}</div>
                </div>

                {detail.myRole === 'owner' && m.userId !== currentUserId && (
                  <button
                    type="button"
                    title={m.role === 'admin' ? '取消管理员' : '设为管理员'}
                    onClick={() => handleRoleToggle(m.userId, m.role)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    {m.role === 'admin' ? (
                      <ShieldOff className="h-3.5 w-3.5" />
                    ) : (
                      <Shield className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}

                {canManage &&
                  m.userId !== currentUserId &&
                  !(detail.myRole === 'admin' && m.role !== 'member') && (
                    <button
                      type="button"
                      title="移出群聊"
                      onClick={() => handleRemoveMember(m.userId)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                    </button>
                  )}
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleRemoveMember(currentUserId)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-medium transition cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>退出该群聊</span>
        </button>
      </div>
    </ModalShell>
  );
};

export const ForwardModal: React.FC<{
  message: MessageDTO;
  chats: ChatDTO[];
  onClose: () => void;
  onForward: (targetChatId: string) => Promise<void>;
}> = ({ chats, onClose, onForward }) => {
  const [sending, setSending] = useState(false);

  const handlePick = async (chatId: string) => {
    setSending(true);
    try {
      await onForward(chatId);
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalShell title="转发消息到..." onClose={onClose}>
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {chats.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={sending}
            onClick={() => handlePick(c.id)}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition text-left cursor-pointer"
          >
            <Avatar
              name={c.title}
              color={c.avatarColor}
              size="sm"
              isGroup={c.type === 'group'}
              online={c.otherUser?.online}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{c.title}</div>
              <div className="text-xs text-slate-400">
                {c.type === 'group' ? `${c.memberCount} 位成员` : `@${c.otherUser?.username}`}
              </div>
            </div>
          </button>
        ))}
      </div>
    </ModalShell>
  );
};

export const ProfileModal: React.FC<{
  user: UserDTO;
  onClose: () => void;
  onUpdated: (user: UserDTO) => void;
  onLogout: () => void;
}> = ({ user, onClose, onUpdated, onLogout }) => {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [bio, setBio] = useState(user.bio);
  const [avatarColor, setAvatarColor] = useState(user.avatarColor);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.updateProfile({ displayName, bio, avatarColor });
      onUpdated(res.user);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="个人资料与设置" onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex flex-col items-center gap-3">
          <Avatar name={displayName || user.username} color={avatarColor} size="xl" />
          <div className="flex items-center gap-2">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setAvatarColor(c)}
                className={`h-6 w-6 rounded-full cursor-pointer transition ${
                  avatarColor === c ? 'ring-2 ring-offset-2 ring-sky-500 dark:ring-offset-slate-900' : ''
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="text-xs text-slate-400">@{user.username}</div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">显示昵称</label>
          <input
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-sm outline-none focus:border-sky-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">个人简介</label>
          <textarea
            rows={2}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="介绍一下自己..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2 text-sm outline-none focus:border-sky-500 resize-none"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onLogout}
            className="flex-1 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-medium cursor-pointer"
          >
            退出登录
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存资料'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

export const ImageLightbox: React.FC<{ url: string; onClose: () => void }> = ({ url, onClose }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
    onClick={onClose}
  >
    <button
      type="button"
      onClick={onClose}
      className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
    >
      <X className="h-5 w-5" />
    </button>
    <img
      src={url}
      alt="预览"
      className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain"
      onClick={(e) => e.stopPropagation()}
    />
  </div>
);
