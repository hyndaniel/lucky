import type { EffectSettings, ModuleStyle, PageLayout, Prize, SoundSettings, TextBlockStyle } from '@/lib/types';

export const DEFAULT_MODULE_STYLE: ModuleStyle = {
  showImageLabel: false, showName: true,
  nameStyle:  { fontFamily: '', fontSize: 40, color: '#b94d24' },
  labelStyle: { fontFamily: '', fontSize: 22, color: '#a66b52' },
  moduleScale: 100, columns: 0, backgroundColor: '#ffffff', backgroundOpacity: 90,
  shape: 'rounded', labelPosition: 'below',
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

// 默认配色取自大屏米白底（#fffdfb，见 index.css）上可读的主题色，字号对应各页改版前的视觉权重：
// 欢迎页大标题 ~128px、奖项页标题 48px、抽奖页奖项名 ~72px（原 clamp(40px, 7vh, 88px) 在 1080p 下约 76px）
const makeLayout = (
  verticalAlign: PageLayout['verticalAlign'],
  title: Pick<TextBlockStyle, 'fontSize' | 'color'>,
  subtitle: Pick<TextBlockStyle, 'fontSize' | 'color'>,
): PageLayout => ({
  verticalAlign,
  title: { fontFamily: '', align: 'center', ...title },
  subtitle: { fontFamily: '', align: 'center', ...subtitle },
  decor: { imageKey: '', imageName: '', widthPct: 20, position: 'top-right' },
});

export const DEFAULT_WELCOME_LAYOUT: PageLayout = makeLayout(
  'center', { fontSize: 128, color: '#b94d24' }, { fontSize: 36, color: '#d86632' },
);
export const DEFAULT_PRIZE_LAYOUT: PageLayout = makeLayout(
  'top', { fontSize: 48, color: '#d86632' }, { fontSize: 28, color: '#a66b52' },
);
export const DEFAULT_LOTTERY_LAYOUT: PageLayout = makeLayout(
  'top', { fontSize: 72, color: '#b94d24' }, { fontSize: 26, color: '#a66b52' },
);

// 大屏字体预设（系统设置、页面排版与模块文字样式共用）。只有字体族名称，不打包字体文件
export const FONT_PRESETS: { label: string; value: string }[] = [
  { label: '系统无衬线（推荐）', value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  // 中文
  { label: '中文 / 微软雅黑', value: "'Microsoft YaHei', 微软雅黑, sans-serif" },
  { label: '中文 / 苹方', value: "'PingFang SC', 'PingFang TC', sans-serif" },
  { label: '中文 / 微软雅黑 + 苹方', value: "'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif" },
  { label: '中文 / 黑体', value: "SimHei, 黑体, 'Heiti SC', sans-serif" },
  { label: '中文 / 华文黑体', value: "'STHeiti', 'Heiti SC', 'Heiti TC', sans-serif" },
  { label: '中文 / 思源黑体', value: "'Source Han Sans SC', 'Noto Sans SC', 'Noto Sans CJK SC', sans-serif" },
  { label: '中文 / 文泉驿微米黑', value: "'WenQuanYi Micro Hei', 'WenQuanYi Zen Hei', sans-serif" },
  { label: '中文 / 方正兰亭黑', value: "'FZLanTingHei-R-GBK', 'Lantinghei SC', sans-serif" },
  { label: '中文 / 冬青黑体', value: "'Hiragino Sans GB', 'STHeiti', sans-serif" },
  { label: '中文 / 宋体', value: "'Noto Serif SC', 'Songti SC', SimSun, serif" },
  { label: '中文 / 新宋体', value: "NSimSun, 新宋体, SimSun, serif" },
  { label: '中文 / 思源宋体', value: "'Source Han Serif SC', 'Noto Serif SC', 'Noto Serif CJK SC', serif" },
  { label: '中文 / 华文宋体', value: "STSong, 华文宋体, 'Songti SC', serif" },
  { label: '中文 / 华文中宋', value: "STZhongsong, 华文中宋, 'Songti SC', serif" },
  { label: '中文 / 仿宋', value: "FangSong, 仿宋, STFangsong, serif" },
  { label: '中文 / 楷体', value: 'KaiTi, STKaiti, serif' },
  { label: '中文 / 华文行楷', value: "STXingkai, 华文行楷, 'Xingkai SC', cursive" },
  { label: '中文 / 华文隶书', value: "STLiti, 华文隶书, LiSu, 隶书, 'Libian SC', serif" },
  { label: '中文 / 幼圆', value: "YouYuan, 幼圆, 'Yuanti SC', sans-serif" },
  { label: '中文 / 圆体', value: "'Yuanti SC', 'Yuanti TC', 'Hanzipen SC', sans-serif" },
  { label: '中文 / 手札体', value: "'Hannotate SC', 'Hannotate TC', 'Xingkai SC', cursive" },
  // English
  { label: 'English / Arial', value: "Arial, 'Helvetica Neue', Helvetica, sans-serif" },
  { label: 'English / Helvetica', value: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { label: 'English / Verdana', value: "Verdana, Geneva, sans-serif" },
  { label: 'English / Tahoma', value: "Tahoma, Geneva, Verdana, sans-serif" },
  { label: 'English / Trebuchet MS', value: "'Trebuchet MS', 'Lucida Grande', sans-serif" },
  { label: 'English / Segoe UI', value: "'Segoe UI', Roboto, 'Helvetica Neue', sans-serif" },
  { label: 'English / Roboto', value: "Roboto, 'Helvetica Neue', Arial, sans-serif" },
  { label: 'English / Open Sans', value: "'Open Sans', 'Segoe UI', Arial, sans-serif" },
  { label: 'English / Lato', value: "Lato, 'Helvetica Neue', Arial, sans-serif" },
  { label: 'English / Montserrat', value: "Montserrat, 'Helvetica Neue', Arial, sans-serif" },
  { label: 'English / Impact', value: "Impact, 'Arial Narrow Bold', 'Haettenschweiler', sans-serif" },
  { label: 'English / Arial Black', value: "'Arial Black', 'Arial Bold', Gadget, sans-serif" },
  { label: 'English / Georgia', value: "Georgia, 'Times New Roman', serif" },
  { label: 'English / Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'English / Palatino', value: "'Palatino Linotype', Palatino, 'Book Antiqua', serif" },
  { label: 'English / Garamond', value: "Garamond, 'Baskerville', 'Times New Roman', serif" },
  { label: 'English / Didot', value: "Didot, 'Bodoni MT', 'Playfair Display', serif" },
  { label: 'English / Courier New', value: "'Courier New', Courier, monospace" },
  { label: 'English / Consolas', value: "Consolas, Monaco, 'Lucida Console', monospace" },
  { label: 'English / Brush Script', value: "'Brush Script MT', 'Segoe Script', cursive" },
  { label: 'English / Comic Sans', value: "'Comic Sans MS', 'Comic Neue', cursive" },
];
