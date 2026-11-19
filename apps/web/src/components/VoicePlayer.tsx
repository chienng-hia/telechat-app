import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { formatDuration } from '../lib/format';

interface VoicePlayerProps {
  url: string;
  durationSec: number | null;
  isOwn: boolean;
}

export const VoicePlayer: React.FC<VoicePlayerProps> = ({ url, durationSec, isOwn }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState<number>(durationSec || 0);

  useEffect(() => {
    const audio = new Audio(url);
    audioRef.current = audio;

    const onLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const onTimeUpdate = () => {
      if (audio.duration > 0) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, [url]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().catch(() => {});
      setPlaying(true);
    }
  };

  return (
    <div className="flex items-center gap-2.5 min-w-[180px] py-0.5">
      <button
        type="button"
        onClick={togglePlay}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition cursor-pointer ${
          isOwn
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-sky-500 hover:bg-sky-600 text-white'
        }`}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="flex-1 space-y-1">
        <div
          className={`h-1.5 w-full rounded-full overflow-hidden ${
            isOwn ? 'bg-white/25' : 'bg-slate-200 dark:bg-slate-700'
          }`}
        >
          <div
            className={`h-full transition-all duration-100 ${
              isOwn ? 'bg-white' : 'bg-sky-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div
          className={`text-[11px] ${
            isOwn ? 'text-sky-100' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          语音消息 · {formatDuration(duration)}
        </div>
      </div>
    </div>
  );
};
