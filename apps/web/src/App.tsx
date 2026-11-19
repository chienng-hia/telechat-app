import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  AuthResponseDTO,
  ChatDTO,
  ClientToServerEvents,
  GlobalSearchResultDTO,
  MessageDTO,
  ServerToClientEvents,
  UserDTO,
} from '@telechat/shared';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Info,
  MessageSquarePlus,
  Mic,
  Moon,
  Paperclip,
  Pencil,
  Reply,
  Search,
  Send,
  Square,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { api, getToken, setToken } from './lib/api';
import {
  formatChatListTime,
  formatDateDivider,
  formatDuration,
  formatLastSeen,
} from './lib/format';
import { AuthScreen } from './components/AuthScreen';
import { Avatar } from './components/Avatar';
import { MessageBubble } from './components/MessageBubble';
import {
  ChatInfoModal,
  ForwardModal,
  ImageLightbox,
  NewChatModal,
  ProfileModal,
} from './components/Modals';

export function App() {
  const [user, setUser] = useState<UserDTO | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('telechat_theme') === 'dark');

  const [chats, setChats] = useState<ChatDTO[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const [composerText, setComposerText] = useState('');
  const [replyTo, setReplyTo] = useState<MessageDTO | null>(null);
  const [editingMsg, setEditingMsg] = useState<MessageDTO | null>(null);
  const [forwardingMsg, setForwardingMsg] = useState<MessageDTO | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const [showNewChat, setShowNewChat] = useState(false);
  const [showChatInfo, setShowChatInfo] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // Global search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GlobalSearchResultDTO | null>(null);

  // Typing state: chatId -> Map<userId, displayName>
  const [typingByChat, setTypingByChat] = useState<Record<string, Record<string, string>>>({});

  // Voice recording
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recordCancelledRef = useRef(false);

  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  activeChatIdRef.current = activeChatId;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('telechat_theme', dark ? 'dark' : 'light');
  }, [dark]);

  // Verify existing token on mount
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthChecked(true);
      return;
    }
    api
      .me()
      .then((res) => setUser(res.user))
      .catch(() => setToken(null))
      .finally(() => setAuthChecked(true));
  }, []);

  const refreshChats = useCallback(async () => {
    try {
      const res = await api.getChats();
      setChats(res.chats);
    } catch {
      // ignore
    }
  }, []);

  const loadMessages = useCallback(async (chatId: string) => {
    setLoadingMsgs(true);
    try {
      const res = await api.getMessages(chatId);
      setMessages(res.messages);
      setHasMore(res.hasMore);
      if (res.messages.length > 0) {
        const last = res.messages[res.messages.length - 1];
        api.markRead(chatId, last.id).catch(() => {});
      }
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 30);
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  // Setup Socket.IO when logged in
  useEffect(() => {
    if (!user) return;
    refreshChats();

    const token = getToken();
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
      auth: { token },
    });
    socketRef.current = socket;

    socket.on('message:new', ({ message }) => {
      if (activeChatIdRef.current === message.chatId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        });
        if (message.senderId !== user.id) {
          api.markRead(message.chatId, message.id).catch(() => {});
        }
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 40);
      }
      refreshChats();
    });

    socket.on('message:updated', ({ message }) => {
      if (activeChatIdRef.current === message.chatId) {
        setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
      }
      refreshChats();
    });

    socket.on('message:deleted', ({ chatId, messageId }) => {
      if (activeChatIdRef.current === chatId) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
      refreshChats();
    });

    socket.on('chat:updated', ({ chatId }) => {
      socket.emit('chat:join', { chatId });
      refreshChats();
    });

    socket.on('chat:read', ({ chatId, userId: readerId }) => {
      if (readerId !== user.id && activeChatIdRef.current === chatId) {
        setMessages((prev) =>
          prev.map((m) => (m.senderId === user.id ? { ...m, isRead: true } : m))
        );
      }
    });

    socket.on('typing:start', ({ chatId, userId: typerId, displayName }) => {
      if (typerId === user.id) return;
      setTypingByChat((prev) => ({
        ...prev,
        [chatId]: { ...(prev[chatId] || {}), [typerId]: displayName },
      }));
    });

    socket.on('typing:stop', ({ chatId, userId: typerId }) => {
      setTypingByChat((prev) => {
        const chatTypers = { ...(prev[chatId] || {}) };
        delete chatTypers[typerId];
        return { ...prev, [chatId]: chatTypers };
      });
    });

    socket.on('presence:update', ({ userId: targetId, online, lastSeenAt }) => {
      setChats((prev) =>
        prev.map((c) =>
          c.otherUser && c.otherUser.id === targetId
            ? { ...c, otherUser: { ...c.otherUser, online, lastSeenAt } }
            : c
        )
      );
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, refreshChats]);

  // Global search debounce
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(() => {
      api
        .globalSearch(q)
        .then(setSearchResults)
        .catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeChatId) || null,
    [chats, activeChatId]
  );

  const selectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setReplyTo(null);
    setEditingMsg(null);
    socketRef.current?.emit('chat:join', { chatId });
    loadMessages(chatId);
  };

  const handleLoadMore = async () => {
    if (!activeChatId || messages.length === 0 || loadingMsgs) return;
    const oldest = messages[0];
    const res = await api.getMessages(activeChatId, oldest.id);
    setMessages((prev) => [...res.messages, ...prev]);
    setHasMore(res.hasMore);
  };

  const handleAuthSuccess = (auth: AuthResponseDTO) => {
    setToken(auth.token);
    setUser(auth.user);
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setChats([]);
    setActiveChatId(null);
    setMessages([]);
    setShowProfile(false);
  };

  const emitTyping = () => {
    if (!activeChatId || !socketRef.current) return;
    socketRef.current.emit('typing:start', { chatId: activeChatId });
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      if (activeChatId) {
        socketRef.current?.emit('typing:stop', { chatId: activeChatId });
      }
    }, 1800);
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!activeChatId) return;
    const text = composerText.trim();
    if (!text) return;

    setComposerText('');
    socketRef.current?.emit('typing:stop', { chatId: activeChatId });

    if (editingMsg) {
      const targetId = editingMsg.id;
      setEditingMsg(null);
      await api.editMessage(targetId, text);
    } else {
      const replyId = replyTo?.id ?? null;
      setReplyTo(null);
      await api.sendMessage(activeChatId, {
        type: 'text',
        content: text,
        replyToId: replyId,
      });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeChatId) return;

    const { attachment } = await api.uploadFile(file, file.name);
    const type = file.type.startsWith('image/') ? 'image' : 'file';
    await api.sendMessage(activeChatId, {
      type,
      content: '',
      attachmentId: attachment.id,
      replyToId: replyTo?.id ?? null,
    });
    setReplyTo(null);
  };

  const startRecording = async () => {
    if (!activeChatId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recordChunksRef.current = [];
      recordCancelledRef.current = false;
      const startedAt = Date.now();

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
        const elapsed = (Date.now() - startedAt) / 1000;
        setRecording(false);
        setRecordSec(0);

        if (recordCancelledRef.current || recordChunksRef.current.length === 0) {
          return;
        }
        const blob = new Blob(recordChunksRef.current, { type: 'audio/webm' });
        const { attachment } = await api.uploadFile(blob, `voice-${Date.now()}.webm`, elapsed);
        if (activeChatIdRef.current) {
          await api.sendMessage(activeChatIdRef.current, {
            type: 'voice',
            content: '',
            attachmentId: attachment.id,
          });
        }
      };

      recorder.start();
      setRecording(true);
      setRecordSec(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSec((s) => s + 1);
      }, 1000);
    } catch {
      alert('无法访问麦克风，请检查浏览器权限。');
    }
  };

  const stopRecording = (cancel: boolean) => {
    recordCancelledRef.current = cancel;
    mediaRecorderRef.current?.stop();
  };

  const jumpToMessage = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-sky-400', 'rounded-2xl');
      setTimeout(() => el.classList.remove('ring-2', 'ring-sky-400', 'rounded-2xl'), 1500);
    }
  };

  if (!authChecked) {
    return (
      <div className="h-screen flex items-center justify-center text-sm text-slate-400">
        正在加载...
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onSuccess={handleAuthSuccess} />;
  }

  const activeTypers = activeChatId ? Object.values(typingByChat[activeChatId] || {}) : [];

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* LEFT SIDEBAR */}
      <aside
        className={`${
          activeChatId ? 'hidden md:flex' : 'flex'
        } w-full md:w-[340px] lg:w-[380px] shrink-0 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900`}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/80 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setShowProfile(true)}
            className="flex items-center gap-2.5 min-w-0 hover:opacity-85 transition cursor-pointer"
          >
            <Avatar name={user.displayName} color={user.avatarColor} size="sm" online />
            <div className="text-left min-w-0">
              <div className="text-sm font-semibold truncate">{user.displayName}</div>
              <div className="text-[11px] text-slate-400 truncate">@{user.username}</div>
            </div>
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              title={dark ? '切换浅色模式' : '切换深色模式'}
              onClick={() => setDark((d) => !d)}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              title="新建私聊或群聊"
              onClick={() => setShowNewChat(true)}
              className="p-2 rounded-xl text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-950/50 transition cursor-pointer"
            >
              <MessageSquarePlus className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Global Search */}
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索联系人、群聊或历史消息..."
              className="w-full rounded-xl bg-slate-100 dark:bg-slate-800 pl-9 pr-8 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500/30"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Chat List or Search Results */}
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {searchResults ? (
            <div className="space-y-4 px-1">
              {searchResults.chats.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase">
                    会话
                  </div>
                  {searchResults.chats.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        selectChat(c.id);
                      }}
                      className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer"
                    >
                      <Avatar
                        name={c.title}
                        color={c.avatarColor}
                        size="sm"
                        isGroup={c.type === 'group'}
                        online={c.otherUser?.online}
                      />
                      <span className="text-sm font-medium truncate">{c.title}</span>
                    </button>
                  ))}
                </div>
              )}

              {searchResults.users.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase">
                    全局用户
                  </div>
                  {searchResults.users.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={async () => {
                        const res = await api.createDm(u.id);
                        setSearchQuery('');
                        await refreshChats();
                        selectChat(res.chat.id);
                      }}
                      className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer"
                    >
                      <Avatar name={u.displayName} color={u.avatarColor} size="sm" online={u.online} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{u.displayName}</div>
                        <div className="text-xs text-slate-400 truncate">@{u.username}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {searchResults.messages.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase">
                    历史消息
                  </div>
                  {searchResults.messages.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        selectChat(m.chatId);
                        setTimeout(() => jumpToMessage(m.id), 250);
                      }}
                      className="w-full p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-sky-500 truncate">{m.chatTitle}</span>
                        <span className="text-[11px] text-slate-400">
                          {formatChatListTime(m.createdAt)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">
                        {m.sender.displayName}: {m.content}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {searchResults.chats.length === 0 &&
                searchResults.users.length === 0 &&
                searchResults.messages.length === 0 && (
                  <div className="text-center py-10 text-xs text-slate-400">没有找到相关结果</div>
                )}
            </div>
          ) : (
            chats.map((chat) => {
              const isActive = chat.id === activeChatId;
              const lastMsg = chat.lastMessage;
              const chatTypers = Object.values(typingByChat[chat.id] || {});

              let preview = '暂无消息';
              if (chatTypers.length > 0) {
                preview = `${chatTypers[0]} 正在输入...`;
              } else if (lastMsg) {
                const body =
                  lastMsg.type === 'image'
                    ? '[图片]'
                    : lastMsg.type === 'voice'
                      ? '[语音消息]'
                      : lastMsg.type === 'file'
                        ? `[文件] ${lastMsg.attachment?.fileName || ''}`
                        : lastMsg.content;
                preview =
                  chat.type === 'group'
                    ? `${lastMsg.sender.displayName}: ${body}`
                    : body;
              }

              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => selectChat(chat.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition text-left cursor-pointer ${
                    isActive
                      ? 'bg-sky-500 text-white shadow-xs'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <Avatar
                    name={chat.title}
                    color={chat.avatarColor}
                    size="md"
                    isGroup={chat.type === 'group'}
                    online={chat.otherUser?.online}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold truncate">{chat.title}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {lastMsg && lastMsg.senderId === user.id && (
                          <span>
                            {lastMsg.isRead ? (
                              <CheckCheck
                                className={`h-3.5 w-3.5 ${
                                  isActive ? 'text-white' : 'text-sky-500'
                                }`}
                              />
                            ) : (
                              <Check
                                className={`h-3.5 w-3.5 ${
                                  isActive ? 'text-sky-100' : 'text-slate-400'
                                }`}
                              />
                            )}
                          </span>
                        )}
                        {lastMsg && (
                          <span
                            className={`text-[11px] ${
                              isActive ? 'text-sky-100' : 'text-slate-400'
                            }`}
                          >
                            {formatChatListTime(lastMsg.createdAt)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span
                        className={`text-xs truncate ${
                          chatTypers.length > 0
                            ? isActive
                              ? 'text-white font-medium'
                              : 'text-sky-500 font-medium'
                            : isActive
                              ? 'text-sky-100'
                              : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {preview}
                      </span>

                      {chat.unreadCount > 0 && !isActive && (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-sky-500 text-white text-[11px] font-semibold">
                          {chat.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* RIGHT MAIN CHAT AREA */}
      <main
        className={`${
          activeChatId ? 'flex' : 'hidden md:flex'
        } flex-1 flex-col min-w-0 bg-slate-50 dark:bg-slate-950`}
      >
        {activeChat ? (
          <>
            {/* Chat Header */}
            <header className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setActiveChatId(null)}
                  className="md:hidden p-1.5 -ml-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowChatInfo(true)}
                  className="flex items-center gap-3 min-w-0 text-left hover:opacity-85 transition cursor-pointer"
                >
                  <Avatar
                    name={activeChat.title}
                    color={activeChat.avatarColor}
                    size="sm"
                    isGroup={activeChat.type === 'group'}
                    online={activeChat.otherUser?.online}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{activeChat.title}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {activeTypers.length > 0 ? (
                        <span className="text-sky-500 font-medium">
                          {activeTypers.join('、')} 正在输入...
                        </span>
                      ) : activeChat.type === 'group' ? (
                        `${activeChat.memberCount} 位成员`
                      ) : activeChat.otherUser ? (
                        formatLastSeen(activeChat.otherUser.online, activeChat.otherUser.lastSeenAt)
                      ) : (
                        ''
                      )}
                    </div>
                  </div>
                </button>
              </div>

              <button
                type="button"
                title="会话详情"
                onClick={() => setShowChatInfo(true)}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <Info className="h-5 w-5" />
              </button>
            </header>

            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto py-4 space-y-2">
              {hasMore && (
                <div className="text-center pb-2">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    className="text-xs px-3 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-sky-500 cursor-pointer"
                  >
                    加载更早的消息
                  </button>
                </div>
              )}

              {loadingMsgs && messages.length === 0 && (
                <div className="text-center py-10 text-xs text-slate-400">正在加载消息...</div>
              )}

              {messages.map((msg, idx) => {
                const prev = idx > 0 ? messages[idx - 1] : null;
                const showDate =
                  !prev ||
                  new Date(prev.createdAt).toDateString() !==
                    new Date(msg.createdAt).toDateString();
                const showSender = !prev || prev.senderId !== msg.senderId || showDate;

                return (
                  <React.Fragment key={msg.id}>
                    {showDate && (
                      <div className="flex justify-center py-2">
                        <span className="px-3 py-0.5 rounded-full text-[11px] bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {formatDateDivider(msg.createdAt)}
                        </span>
                      </div>
                    )}
                    <MessageBubble
                      message={msg}
                      isOwn={msg.senderId === user.id}
                      isGroup={activeChat.type === 'group'}
                      showSender={showSender}
                      myRole={activeChat.myRole}
                      onReply={(m) => {
                        setEditingMsg(null);
                        setReplyTo(m);
                      }}
                      onForward={(m) => setForwardingMsg(m)}
                      onEdit={(m) => {
                        setReplyTo(null);
                        setEditingMsg(m);
                        setComposerText(m.content);
                      }}
                      onDelete={async (m) => {
                        await api.deleteMessage(m.id);
                      }}
                      onJumpToMessage={jumpToMessage}
                      onPreviewImage={setPreviewImageUrl}
                    />
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-3">
              {(replyTo || editingMsg) && (
                <div className="flex items-center justify-between mb-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border-l-2 border-sky-500">
                  <div className="flex items-center gap-2 min-w-0 text-xs">
                    {editingMsg ? (
                      <Pencil className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                    ) : (
                      <Reply className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-sky-500">
                        {editingMsg ? '编辑消息' : `回复 ${replyTo?.sender.displayName}`}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 truncate">
                        {editingMsg
                          ? editingMsg.content
                          : replyTo?.type === 'text'
                            ? replyTo.content
                            : `[${replyTo?.type}]`}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyTo(null);
                      setEditingMsg(null);
                      if (editingMsg) setComposerText('');
                    }}
                    className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {recording ? (
                <div className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
                  <div className="flex items-center gap-2 text-rose-500 text-sm font-medium">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse" />
                    <span>正在录音 {formatDuration(recordSec)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => stopRecording(true)}
                      className="p-2 rounded-lg text-slate-500 hover:text-rose-500 cursor-pointer"
                      title="取消录音"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => stopRecording(false)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium cursor-pointer"
                    >
                      <Square className="h-3 w-3 fill-current" />
                      <span>发送语音</span>
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSend} className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <button
                    type="button"
                    title="发送图片或文件"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <Paperclip className="h-5 w-5" />
                  </button>

                  <textarea
                    rows={1}
                    value={composerText}
                    onChange={(e) => {
                      setComposerText(e.target.value);
                      emitTyping();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="输入消息...（Enter 发送，Shift+Enter 换行）"
                    className="flex-1 max-h-32 rounded-xl bg-slate-100 dark:bg-slate-800 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500/30 resize-none"
                  />

                  {composerText.trim() ? (
                    <button
                      type="submit"
                      className="p-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white transition cursor-pointer"
                    >
                      <Send className="h-5 w-5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      title="录制语音消息"
                      onClick={startRecording}
                      className="p-2.5 rounded-xl text-slate-500 hover:text-sky-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                      <Mic className="h-5 w-5" />
                    </button>
                  )}
                </form>
              )}
            </footer>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-3">
            <div className="px-4 py-2 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400 shadow-xs">
              选择一个会话开始聊天，或点击左上角新建会话
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onSelectChat={async (chat) => {
            await refreshChats();
            selectChat(chat.id);
          }}
        />
      )}

      {showChatInfo && activeChatId && (
        <ChatInfoModal
          chatId={activeChatId}
          currentUserId={user.id}
          onClose={() => setShowChatInfo(false)}
          onLeftGroup={(leftId) => {
            if (activeChatId === leftId) setActiveChatId(null);
            refreshChats();
          }}
          onUpdated={refreshChats}
        />
      )}

      {forwardingMsg && (
        <ForwardModal
          message={forwardingMsg}
          chats={chats}
          onClose={() => setForwardingMsg(null)}
          onForward={async (targetChatId) => {
            await api.sendMessage(targetChatId, {
              forwardFromMessageId: forwardingMsg.id,
            });
            selectChat(targetChatId);
          }}
        />
      )}

      {showProfile && (
        <ProfileModal
          user={user}
          onClose={() => setShowProfile(false)}
          onUpdated={(updated) => setUser(updated)}
          onLogout={handleLogout}
        />
      )}

      {previewImageUrl && (
        <ImageLightbox url={previewImageUrl} onClose={() => setPreviewImageUrl(null)} />
      )}
    </div>
  );
}

export default App;
