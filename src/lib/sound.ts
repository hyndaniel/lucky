// 大屏音效：滚动音效（滴答 / 倒计时循环 / 自定义循环）与中奖音效，只在大屏窗口使用（R9）。
// 浏览器自动播放策略要求先在用户点击中调用 unlock()；未解锁时播放调用均为空操作。
// 所有播放失败（文件缺失、解码失败、play() 被拒）都静默忽略。
// 模块顶层不访问 window / AudioContext，node 下可安全 import。
import countdownUrl from '@/assets/countdown.mp3';
import winUrl from '@/assets/win.mp3';
import { getMediaUrl } from '@/lib/media-store';
import type { SoundSettings } from '@/lib/types';

const TICK_SECONDS = 0.03;
const TICK_PEAK_GAIN = 0.3;

// 一路音频（滚动 / 中奖）。generation 每次停止或重新播放时 +1，用来作废尚未返回的自定义音频查询
interface Channel {
  audio: HTMLAudioElement | null;
  generation: number;
}

// volume 0..100 → 0..1
function toGain(volume: number): number {
  return Math.min(1, Math.max(0, volume / 100)) || 0;
}

function createSoundEngine() {
  let context: AudioContext | null = null;
  const roll: Channel = { audio: null, generation: 0 };
  const win: Channel = { audio: null, generation: 0 };

  const isUnlocked = (): boolean => context !== null && context.state === 'running';

  function stop(channel: Channel): void {
    channel.generation += 1;
    channel.audio?.pause();
    channel.audio = null;
  }

  function playUrl(channel: Channel, url: string, loop: boolean, volume: number): void {
    try {
      const audio = new Audio(url);
      audio.loop = loop;
      audio.volume = toGain(volume);
      channel.audio = audio;
      audio.play().catch(() => {});
    } catch {
      // 静默忽略
    }
  }

  // 自定义音频要先异步取 object URL；期间被停止或被新的播放取代，就不再播放
  function playCustom(channel: Channel, key: string, loop: boolean, volume: number): void {
    if (!key) return;
    const generation = channel.generation;
    getMediaUrl(key).then(
      (url) => {
        if (url && channel.generation === generation) playUrl(channel, url, loop, volume);
      },
      () => {},
    );
  }

  return {
    // 必须在用户点击等手势中调用；被浏览器拒绝时保持未解锁
    async unlock(): Promise<void> {
      try {
        if (!context) {
          if (typeof AudioContext === 'undefined') return;
          context = new AudioContext();
        }
        if (context.state !== 'running') await context.resume();
      } catch {
        // 静默忽略，下次点击再试
      }
    },

    isUnlocked,

    startRoll(sound: SoundSettings): void {
      if (!isUnlocked()) return;
      stop(roll);
      if (sound.roll === 'countdown') playUrl(roll, countdownUrl, true, sound.volume);
      else if (sound.roll === 'custom') playCustom(roll, sound.customRollKey, true, sound.volume);
    },

    // 滚动每帧调用：合成约 30ms 的短促「嗒」（方波 + 指数衰减）
    tick(sound: SoundSettings): void {
      const ctx = context;
      if (!ctx || ctx.state !== 'running' || sound.roll !== 'tick') return;
      const peak = toGain(sound.volume) * TICK_PEAK_GAIN;
      if (peak <= 0) return;
      try {
        const now = ctx.currentTime;
        const end = now + TICK_SECONDS;
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(1600, now);
        oscillator.frequency.exponentialRampToValueAtTime(800, end);
        gain.gain.setValueAtTime(peak, now);
        gain.gain.exponentialRampToValueAtTime(0.001, end);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(now);
        oscillator.stop(end);
      } catch {
        // 静默忽略
      }
    },

    stopRoll(): void {
      stop(roll);
    },

    // 不停止滚动音效：调用方在停止转换时自行 stopRoll()
    playWin(sound: SoundSettings): void {
      if (!isUnlocked()) return;
      stop(win);
      if (sound.win === 'win') playUrl(win, winUrl, false, sound.volume);
      else if (sound.win === 'custom') playCustom(win, sound.customWinKey, false, sound.volume);
    },

    stopAll(): void {
      stop(roll);
      stop(win);
    },
  };
}

export const soundEngine = createSoundEngine();
