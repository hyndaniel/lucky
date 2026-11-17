export interface Participant {
  id: string;
  serial: number;               // 后台唯一编号（N-0001），不在大屏显示
  name: string;
  dept: string;
  mustWinPrizeId: string | null; // 内定中特定奖项 ID，null 为无内定
  bannedPrizes: string[];
  weight: number;
}

export interface Winner extends Participant {   // 一条 = 一个模块的结果（名字 + 图片）
  prizeId: string;
  roundId: string;
  wonAt: number;
  roundNo?: number;             // 第几轮
  imageId?: string;             // 抽中的奖品图片 id
  imageSerial?: number;         // 图片编号快照
  imageLabel?: string;          // 图片说明快照
}

export interface PrizeImage {
  id: string;                   // nanoid，同时是 IndexedDB key
  serial: number;               // IMG-0001
  label: string;                // 图片说明，默认 = 文件名去扩展名
  group: string;                // 分组（如 "一等奖"），'' = 未分组
  createdAt: number;
}

export type HAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'center' | 'bottom';
export type ModuleShape = 'square' | 'rounded' | 'circle';
export type LabelPosition = 'above' | 'below';
export type DrawMode = 'image-then-name' | 'image-only' | 'name-only';
export type DecorPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export type RoundPhase = 'idle' | 'rollingPrizes' | 'prizesRevealed' | 'rollingNames' | 'completed';

export interface CurrentRound {
  id: string;                   // nanoid，写入 Winner.roundId
  roundNo: number;              // 从 1 开始
  moduleCount: number;          // 1..60
  phase: RoundPhase;
  imagePoolIds: string[] | null; // null = 自动选择
  namePoolIds: string[] | null;  // null = 自动选择
  resultImageIds: string[];     // 阶段一结果，长度 = moduleCount
  resultNameIds: string[];      // 阶段二结果，与 resultImageIds 下标一一对应
  drawMode: DrawMode;           // 本轮抽奖模式，仅 idle 时可改
}

export interface TextStyle { fontFamily: string; fontSize: number; color: string; } // fontFamily '' = 跟随大屏字体
export interface ModuleStyle {
  showImageLabel: boolean;      // 图片下方显示图片说明
  showName: boolean;            // 图片下方显示名字
  nameStyle: TextStyle;
  labelStyle: TextStyle;
  moduleScale: number;          // 40..200，自动适配尺寸的百分比
  columns: number;              // 0 = 自动；>0 固定每排数量
  backgroundColor: string;      // '#rrggbb'
  backgroundOpacity: number;    // 0..100
  shape: ModuleShape;           // 模块外形
  labelPosition: LabelPosition; // 文字在图片上方 / 下方
}
// updateModuleStyle 的参数：嵌套的 TextStyle 也按字段浅合并
export type ModuleStylePatch = Partial<Omit<ModuleStyle, 'nameStyle' | 'labelStyle'>> & {
  nameStyle?: Partial<TextStyle>;
  labelStyle?: Partial<TextStyle>;
};
// 页面标题 / 副标题的文字样式；fontFamily '' = 跟随大屏字体
export interface TextBlockStyle { fontFamily: string; fontSize: number; color: string; align: HAlign; }
// 页面装饰图；imageKey '' = 无图片（图片本体在 IndexedDB）
export interface PageDecor { imageKey: string; imageName: string; widthPct: number; position: DecorPosition; }
export interface PageLayout { verticalAlign: VAlign; title: TextBlockStyle; subtitle: TextBlockStyle; decor: PageDecor; }
// 上传字体：key 为 IndexedDB 键（font-<id>），family 为 @font-face 使用的 CSS 名
export interface UploadedFont { key: string; family: string; name: string; }

export type EffectKind = 'confetti' | 'stars' | 'rockets' | 'emoji';
export interface EffectSettings { kinds: EffectKind[]; emojis: string; durationSec: number; onPrizeReveal: boolean; }
export type RollSoundKind = 'none' | 'tick' | 'countdown' | 'custom';
export type WinSoundKind = 'none' | 'win' | 'custom';
export interface SoundSettings {
  roll: RollSoundKind; win: WinSoundKind; volume: number;   // volume 0..100
  customRollKey: string; customRollName: string;            // IndexedDB key（带随机后缀）与原文件名
  customWinKey: string; customWinName: string;
}

export type ActionResult = { ok: true } | { ok: false; reason: string };

export interface Prize {
  id: string;
  name: string;
  count: number;
  description?: string;  // 奖品描述（如：iPhone 16 Pro）
  image?: string;
}

export interface Settings {
  title: string;
  password: string; // simple local password
  welcomeTitle: string;
  welcomeSubtitle: string;
  prizePageTitle: string;  // 奖项页标题
  logo?: string;  // 公司 logo (base64)
  showDept?: boolean;  // 抽奖及中奖界面是否显示部门选项
  backgroundImage?: string;                // 大屏背景图（base64）
  fontFamily?: string;                     // 大屏展示字体 CSS font-family
  moduleStyle: ModuleStyle;                // 抽奖模块样式
  effects: EffectSettings;                 // 中奖特效
  sound: SoundSettings;                    // 音效
  welcomeLayout: PageLayout;               // 欢迎页排版
  prizeLayout: PageLayout;                 // 奖项页排版
  lotteryLayout: PageLayout;               // 抽奖页排版
  fonts: UploadedFont[];                   // 已上传字体（字体本体在 IndexedDB）
}
