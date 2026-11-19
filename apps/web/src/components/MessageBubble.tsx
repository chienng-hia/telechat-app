import React, { useState } from 'react';
import type { MemberRole, MessageDTO } from '@telechat/shared';
import {
  Check,
  CheckCheck,
  Copy,
  Download,
  FileText,
  Forward,
  Pencil,
  Reply,
  Trash2,
} from 'lucide-react';
import { Avatar } from './Avatar';
import { VoicePlayer } from './VoicePlayer';
import { formatBytes, formatTime } from '../lib/format';

interface MessageBubbleProps {
  message: MessageDTO;
  isOwn: boolean;
  isGroup: boolean;
  showSender: boolean;
  myRole: MemberRole;
  onReply: (message: MessageDTO) => void;
  onForward: (message: MessageDTO) => void;
  onEdit: (message: MessageDTO) => void;
  onDelete: (message: MessageDTO) => void;
  onJumpToMessage: (messageId: string) => void;
  onPreviewImage: (url: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  isGroup,
  showSender,
  myRole,
  onReply,
  onForward,
  onEdit,
  onDelete,
  onJumpToMessage,
  onPreviewImage,
}) => {
  const [copied, setCopied] = useState(false);

  const canEdit = isOwn && message.type === 'text';
  const canDelete = isOwn || myRole === 'owner' || myRole === 'admin';

  const handleCopy = () => {
    if (!message.content) return;
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      id={`msg-${message.id}`}
      className={`group flex items-end gap-2 px-3 sm:px-5 ${
        isOwn ? 'justify-end' : 'justify-start'
      }`}
    >
      {!isOwn && isGroup && (
        <div className="w-8 shrink-0">
          {showSender && (
            <Avatar
              name={message.sender.displayName}
              color={message.sender.avatarColor}
              size="sm"
            />
          )}
        </div>
      )}

      {/* Action bar on left for own messages */}
      {isOwn && (
        <div className="hidden group-hover:flex items-center gap-0.5 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 px-1 py-0.5 shadow-xs self-center">
          <ActionButton title="回复" onClick={() => onReply(message)}>
            <Reply className="h-3.5 w-3.5" />
          </ActionButton>
          <ActionButton title="转发" onClick={() => onForward(message)}>
            <Forward className="h-3.5 w-3.5" />
          </ActionButton>
          {canEdit && (
            <ActionButton title="编辑" onClick={() => onEdit(message)}>
              <Pencil className="h-3.5 w-3.5" />
            </ActionButton>
          )}
          {message.content && (
            <ActionButton title={copied ? '已复制' : '复制'} onClick={handleCopy}>
              <Copy className="h-3.5 w-3.5" />
            </ActionButton>
          )}
          {canDelete && (
            <ActionButton title="删除" onClick={() => onDelete(message)} danger>
              <Trash2 className="h-3.5 w-3.5" />
            </ActionButton>
          )}
        </div>
      )}

      <div
        className={`relative max-w-[78%] sm:max-w-[65%] rounded-2xl px-3.5 py-2 shadow-xs transition-colors ${
          isOwn
            ? 'bg-sky-500 text-white rounded-br-sm'
            : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/70 dark:border-slate-700/70 rounded-bl-sm'
        }`}
      >
        {!isOwn && isGroup && showSender && (
          <div
            className="text-xs font-semibold mb-1"
            style={{ color: message.sender.avatarColor }}
          >
            {message.sender.displayName}
          </div>
        )}

        {message.forwardFrom && (
          <div
            className={`text-[11px] mb-1 flex items-center gap-1 ${
              isOwn ? 'text-sky-100' : 'text-sky-600 dark:text-sky-400'
            }`}
          >
            <Forward className="h-3 w-3" />
            <span>转发自 {message.forwardFrom.senderName}</span>
          </div>
        )}

        {message.replyTo && (
          <button
            type="button"
            onClick={() => onJumpToMessage(message.replyTo!.id)}
            className={`w-full text-left mb-1.5 pl-2.5 pr-2 py-1 rounded-lg border-l-2 text-xs transition cursor-pointer ${
              isOwn
                ? 'bg-white/15 border-white/80 text-white hover:bg-white/20'
                : 'bg-slate-100 dark:bg-slate-700/60 border-sky-500 text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-700'
            }`}
          >
            <div className="font-semibold truncate">{message.replyTo.senderName}</div>
            <div className="truncate opacity-85">
              {message.replyTo.type === 'image'
                ? '[图片]'
                : message.replyTo.type === 'voice'
                  ? '[语音消息]'
                  : message.replyTo.type === 'file'
                    ? '[文件]'
                    : message.replyTo.content}
            </div>
          </button>
        )}

        {/* Content by type */}
        {message.type === 'image' && message.attachment && (
          <div className="space-y-1.5">
            <img
              src={message.attachment.url}
              alt={message.attachment.fileName}
              onClick={() => onPreviewImage(message.attachment!.url)}
              className="max-h-72 rounded-xl object-cover cursor-pointer hover:opacity-95 transition"
            />
            {message.content && (
              <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
            )}
          </div>
        )}

        {message.type === 'file' && message.attachment && (
          <div className="space-y-1.5">
            <a
              href={message.attachment.url}
              download={message.attachment.fileName}
              target="_blank"
              rel="noreferrer"
              className={`flex items-center gap-3 p-2 rounded-xl transition ${
                isOwn
                  ? 'bg-white/15 hover:bg-white/20'
                  : 'bg-slate-100 dark:bg-slate-700/70 hover:bg-slate-200/80 dark:hover:bg-slate-700'
              }`}
            >
              <div
                className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                  isOwn ? 'bg-white/20 text-white' : 'bg-sky-500/15 text-sky-500'
                }`}
              >
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{message.attachment.fileName}</div>
                <div
                  className={`text-[11px] ${
                    isOwn ? 'text-sky-100' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {formatBytes(message.attachment.size)}
                </div>
              </div>
              <Download className="h-4 w-4 shrink-0 opacity-80" />
            </a>
            {message.content && (
              <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
            )}
          </div>
        )}

        {message.type === 'voice' && message.attachment && (
          <VoicePlayer
            url={message.attachment.url}
            durationSec={message.attachment.durationSec}
            isOwn={isOwn}
          />
        )}

        {message.type === 'text' && (
          <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </p>
        )}

        {/* Footer: edited, time, read receipt */}
        <div
          className={`mt-1 flex items-center justify-end gap-1 text-[10px] select-none ${
            isOwn ? 'text-sky-100' : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          {message.editedAt && <span>已编辑</span>}
          <span>{formatTime(message.createdAt)}</span>
          {isOwn &&
            (message.isRead ? (
              <CheckCheck className="h-3.5 w-3.5 text-white" />
            ) : (
              <Check className="h-3.5 w-3.5 text-sky-100/80" />
            ))}
        </div>
      </div>

      {/* Action bar on right for incoming messages */}
      {!isOwn && (
        <div className="hidden group-hover:flex items-center gap-0.5 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 px-1 py-0.5 shadow-xs self-center">
          <ActionButton title="回复" onClick={() => onReply(message)}>
            <Reply className="h-3.5 w-3.5" />
          </ActionButton>
          <ActionButton title="转发" onClick={() => onForward(message)}>
            <Forward className="h-3.5 w-3.5" />
          </ActionButton>
          {message.content && (
            <ActionButton title={copied ? '已复制' : '复制'} onClick={handleCopy}>
              <Copy className="h-3.5 w-3.5" />
            </ActionButton>
          )}
          {canDelete && (
            <ActionButton title="删除" onClick={() => onDelete(message)} danger>
              <Trash2 className="h-3.5 w-3.5" />
            </ActionButton>
          )}
        </div>
      )}
    </div>
  );
};

const ActionButton: React.FC<{
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ title, onClick, danger, children }) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    className={`p-1.5 rounded-md transition cursor-pointer ${
      danger
        ? 'text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50'
        : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700'
    }`}
  >
    {children}
  </button>
);
