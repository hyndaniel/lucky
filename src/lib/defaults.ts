import type { EffectSettings, ModuleStyle, Prize, SoundSettings } from '@/lib/types';

export const DEFAULT_MODULE_STYLE: ModuleStyle = {
  showImageLabel: false, showName: true,
  nameStyle:  { fontFamily: '', fontSize: 40, color: '#b94d24' },
  labelStyle: { fontFamily: '', fontSize: 22, color: '#a66b52' },
  moduleScale: 100, columns: 0, backgroundColor: '#ffffff', backgroundOpacity: 90,
};

export const DEFAULT_EFFECTS: EffectSettings = { kinds: ['confetti'], emojis: '🎉🧧✨', durationSec: 4, onPrizeReveal: false };

export const DEFAULT_SOUND: SoundSettings = {
  roll: 'tick', win: 'win', volume: 80,
  customRollKey: '', customRollName: '', customWinKey: '', customWinName: '',
};

export const INITIAL_PRIZES: Prize[] = [
  { id: '1', name: '特等奖', count: 2 },  { id: '2', name: '一等奖', count: 6 },
  { id: '3', name: '二等奖', count: 10 }, { id: '4', name: '三等奖', count: 20 },
  { id: '5', name: '四等奖', count: 30 }, { id: '6', name: '五等奖', count: 58 },
  { id: '7', name: '阳光普照奖', count: 54 },
];

export const DEFAULT_MODULE_COUNT = 12;
export const MAX_MODULE_COUNT = 60;

// 大屏字体预设（系统设置与模块文字样式共用）
export const FONT_PRESETS: { label: string; value: string }[] = [
  { label: '系统无衬线（推荐）', value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { label: '微软雅黑 / 苹方', value: "'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif" },
  { label: '宋体风格', value: "'Noto Serif SC', 'Songti SC', SimSun, serif" },
  { label: '楷体风格', value: 'KaiTi, STKaiti, serif' },
];
