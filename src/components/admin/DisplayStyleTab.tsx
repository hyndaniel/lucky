import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { Play, Upload, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PrizeModule from '@/components/display/PrizeModule';
import { MediaUnavailableAlert } from '@/components/admin/MediaUnavailableAlert';
import { useLotteryStore } from '@/store/useStore';
import { useMediaStoreAvailable } from '@/hooks/useMediaStoreAvailable';
import { deleteMedia, putMedia } from '@/lib/media-store';
import { computeModuleLayout, effectiveGap, GRID_GAP } from '@/lib/grid-layout';
import { playCelebration } from '@/lib/effects';
import { soundEngine } from '@/lib/sound';
import { PageLayoutEditor } from '@/components/admin/PageLayoutEditor';
import { FontManager } from '@/components/admin/FontManager';
import { useCustomFonts } from '@/hooks/useCustomFonts';
import { createTextMeasurer } from '@/lib/text-measure';
import {
  PAGE_LABELS, PREVIEW_SAMPLE, fontOptions, fromSelectValue, previewFontSizes, toSelectValue, type LayoutPage,
} from '@/lib/layout-editor';
import type {
  EffectKind, LabelPosition, ModuleShape, RollSoundKind, SoundSettings, TextStyle, UploadedFont, WinSoundKind,
} from '@/lib/types';

const LAYOUT_PAGES: LayoutPage[] = ['welcome', 'prize', 'lottery'];
const SHAPE_OPTIONS: { value: ModuleShape; label: string }[] = [
  { value: 'square', label: '方形' },
  { value: 'rounded', label: '圆角' },
  { value: 'circle', label: '圆形' },
];
const LABEL_POSITION_OPTIONS: { value: LabelPosition; label: string }[] = [
  { value: 'above', label: '图片上方' },
  { value: 'below', label: '图片下方' },
];
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const PREVIEW_WIDTH = 300;
const PREVIEW_HEIGHT = 360;
const TICK_PREVIEW_COUNT = 6;
const TICK_PREVIEW_INTERVAL_MS = 160;
const LOOP_PREVIEW_MS = 3000;

const EFFECT_OPTIONS: { kind: EffectKind; label: string }[] = [
  { kind: 'confetti', label: '撒花' },
  { kind: 'stars', label: '星光' },
  { kind: 'rockets', label: '火箭' },
  { kind: 'emoji', label: 'Emoji' },
];

const ROLL_OPTIONS: { value: RollSoundKind; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'tick', label: '滴答声' },
  { value: 'countdown', label: '倒计时音乐' },
  { value: 'custom', label: '自定义' },
];

const WIN_OPTIONS: { value: WinSoundKind; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'win', label: '欢呼' },
  { value: 'custom', label: '自定义' },
];

// 预览用示例图（内联 SVG，不依赖图片池）；不含任何编号
const SAMPLE_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
  + '<rect width="100" height="100" rx="14" fill="#ffe3d1"/>'
  + '<rect x="26" y="44" width="48" height="34" rx="4" fill="#d86632"/>'
  + '<rect x="22" y="36" width="56" height="12" rx="3" fill="#f08a52"/>'
  + '<rect x="46" y="36" width="8" height="42" fill="#ffd36b"/>'
  + '<path d="M50 36c-10-14-24-6-14 0zM50 36c10-14 24-6 14 0z" fill="#ffd36b"/>'
  + '</svg>',
)}`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
}

function SliderRow({ label, value, min, max, unit, onChange }: SliderRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs font-mono text-muted-foreground">{value}{unit}</span>
      </div>
      <Slider min={min} max={max} step={1} value={[value]} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

function ChoiceRow<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1">
      {options.map((o) => (
        <Button key={o.value} type="button" size="sm" variant={value === o.value ? 'default' : 'outline'} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </Button>
      ))}
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-muted-foreground">{value}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-12 cursor-pointer rounded border bg-transparent p-0.5"
          aria-label={label}
        />
      </div>
    </div>
  );
}

interface TextStyleEditorProps {
  title: string;
  style: TextStyle;
  fonts: UploadedFont[];
  onChange: (patch: Partial<TextStyle>) => void;
}

// 字体 / 字号 / 颜色；fontFamily '' = 跟随大屏字体
function TextStyleEditor({ title, style, fonts, onChange }: TextStyleEditorProps) {
  const options = fontOptions(fonts, style.fontFamily);
  return (
    <Section title={title}>
      <div className="space-y-2">
        <Label>字体</Label>
        <Select
          value={toSelectValue(style.fontFamily)}
          onValueChange={(v) => onChange({ fontFamily: fromSelectValue(v) })}
        >
          <SelectTrigger className="w-full"><SelectValue placeholder="选择字体" /></SelectTrigger>
          <SelectContent>
            {options.map((font) => (
              <SelectItem key={font.value} value={font.value}>{font.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SliderRow label="字号" value={style.fontSize} min={12} max={120} unit="px" onChange={(fontSize) => onChange({ fontSize })} />
      <ColorRow label="颜色" value={style.color} onChange={(color) => onChange({ color })} />
    </Section>
  );
}

type AudioSlot = 'roll' | 'win';

interface CustomAudioFieldProps {
  slot: AudioSlot;
  fileName: string;
  mediaAvailable: boolean | null;
}

// 自定义音频上传：先写入 IndexedDB，成功后更新设置，再删除旧文件
function CustomAudioField({ slot, fileName, mediaAvailable }: CustomAudioFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (file.size > MAX_AUDIO_BYTES) {
      toast.error('音频文件不能超过 10MB');
      return;
    }
    const key = `audio-${slot}-${nanoid()}`;
    setUploading(true);
    try {
      await putMedia(key, file);
    } catch {
      toast.error('音频保存失败，请重试');
      setUploading(false);
      return;
    }
    const { updateSound } = useLotteryStore.getState();
    const before = useLotteryStore.getState().settings.sound;
    const oldKey = slot === 'roll' ? before.customRollKey : before.customWinKey;
    updateSound(
      slot === 'roll'
        ? { customRollKey: key, customRollName: file.name }
        : { customWinKey: key, customWinName: file.name },
    );
    // 旧 key 若仍被任一槽位引用则不删除
    const after = useLotteryStore.getState().settings.sound;
    const stillUsed = oldKey === after.customRollKey || oldKey === after.customWinKey;
    if (oldKey && !stillUsed) {
      try {
        await deleteMedia([oldKey]);
      } catch {
        // 旧文件清理失败不影响使用
      }
    }
    setUploading(false);
    toast.success('已上传自定义音频');
  };

  return (
    <div className="space-y-2">
      {mediaAvailable === false && <MediaUnavailableAlert />}
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void handleFile(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={mediaAvailable === false || uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="w-4 h-4 mr-1.5" />
          {uploading ? '上传中…' : '上传音频'}
        </Button>
        <span className="text-xs text-muted-foreground truncate">
          {fileName ? `当前文件：${fileName}` : '未上传（音频 ≤10MB）'}
        </span>
      </div>
    </div>
  );
}

export function DisplayStyleTab() {
  const moduleStyle = useLotteryStore((s) => s.settings.moduleStyle);
  const effects = useLotteryStore((s) => s.settings.effects);
  const sound = useLotteryStore((s) => s.settings.sound);
  const displayFont = useLotteryStore((s) => s.settings.fontFamily);
  const showDept = useLotteryStore((s) => s.settings.showDept) === true;
  const fonts = useLotteryStore((s) => s.settings.fonts);
  const welcomeLayout = useLotteryStore((s) => s.settings.welcomeLayout);
  const prizeLayout = useLotteryStore((s) => s.settings.prizeLayout);
  const lotteryLayout = useLotteryStore((s) => s.settings.lotteryLayout);
  const updateModuleStyle = useLotteryStore((s) => s.updateModuleStyle);
  const updateEffects = useLotteryStore((s) => s.updateEffects);
  const updateSound = useLotteryStore((s) => s.updateSound);
  const mediaAvailable = useMediaStoreAvailable();
  useCustomFonts(fonts); // 让字体下拉与预览能用已上传字体
  const pageLayouts = { welcome: welcomeLayout, prize: prizeLayout, lottery: lotteryLayout };

  const stopEffectRef = useRef<(() => void) | null>(null);
  const soundTimersRef = useRef<number[]>([]);

  const clearSoundTimers = () => {
    soundTimersRef.current.forEach((t) => window.clearTimeout(t));
    soundTimersRef.current = [];
  };

  // 离开 Tab 时停止预览特效与试听
  useEffect(() => () => {
    stopEffectRef.current?.();
    soundTimersRef.current.forEach((t) => window.clearTimeout(t));
    soundEngine.stopAll();
  }, []);

  // 预览与大屏同一套：同样的格间距、部门行高度、统一字号（对样例文字测算，不再被省略号截断）
  const layout = useMemo(() => computeModuleLayout({
    containerWidth: PREVIEW_WIDTH, containerHeight: PREVIEW_HEIGHT, count: 1, columns: 0, gap: GRID_GAP,
    scale: moduleStyle.moduleScale / 100, shape: moduleStyle.shape,
    nameFontSize: moduleStyle.nameStyle.fontSize, labelFontSize: moduleStyle.labelStyle.fontSize,
    showName: moduleStyle.showName, showLabel: moduleStyle.showImageLabel,
    showDept: showDept && moduleStyle.showName,
  }), [
    moduleStyle.moduleScale, moduleStyle.shape, moduleStyle.nameStyle.fontSize, moduleStyle.labelStyle.fontSize,
    moduleStyle.showName, moduleStyle.showImageLabel, showDept,
  ]);
  const nameFamily = moduleStyle.nameStyle.fontFamily || displayFont || '';
  const labelFamily = moduleStyle.labelStyle.fontFamily || displayFont || '';
  // 字体晚加载完成（上传字体读 IndexedDB 是异步的）后重新测算，否则预览字号停在回退字体的测量结果
  const [fontsVersion, setFontsVersion] = useState(0);
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    const bump = () => setFontsVersion((v) => v + 1);
    document.fonts.addEventListener('loadingdone', bump);
    return () => document.fonts.removeEventListener('loadingdone', bump);
  }, []);
  const previewShowDept = showDept && moduleStyle.showName;
  const previewSizes = useMemo(
    () => previewFontSizes(
      layout,
      previewShowDept,
      (weight) => createTextMeasurer(weight === 700 ? nameFamily : labelFamily, weight),
    ),
    // fontsVersion 只用来在字体加载完成时触发重新测算
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, previewShowDept, nameFamily, labelFamily, fontsVersion],
  );
  const previewGap = effectiveGap(GRID_GAP, moduleStyle.moduleScale / 100);

  const toggleKind = (kind: EffectKind) => {
    const kinds = effects.kinds.includes(kind)
      ? effects.kinds.filter((k) => k !== kind)
      : [...effects.kinds, kind];
    updateEffects({ kinds });
  };

  const previewEffects = () => {
    stopEffectRef.current?.();
    stopEffectRef.current = playCelebration(effects);
  };

  // 试听：先解锁音频；滚动音效按类型播放一小段
  const previewRoll = async () => {
    await soundEngine.unlock();
    clearSoundTimers();
    soundEngine.stopAll();
    if (sound.roll === 'none') return;
    if (sound.roll === 'tick') {
      for (let i = 0; i < TICK_PREVIEW_COUNT; i += 1) {
        soundTimersRef.current.push(window.setTimeout(() => soundEngine.tick(sound), i * TICK_PREVIEW_INTERVAL_MS));
      }
      return;
    }
    soundEngine.startRoll(sound);
    soundTimersRef.current.push(window.setTimeout(() => soundEngine.stopRoll(), LOOP_PREVIEW_MS));
  };

  const previewWin = async () => {
    await soundEngine.unlock();
    clearSoundTimers();
    soundEngine.stopAll();
    soundEngine.playWin(sound);
  };

  const patchSound = (patch: Partial<SoundSettings>) => updateSound(patch);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
      <div className="space-y-4 min-w-0">
        <Section title="显示">
          <SwitchRow label="图片下方显示名字" checked={moduleStyle.showName} onChange={(showName) => updateModuleStyle({ showName })} />
          <SwitchRow label="图片下方显示图片说明" checked={moduleStyle.showImageLabel} onChange={(showImageLabel) => updateModuleStyle({ showImageLabel })} />
          <p className="text-xs text-muted-foreground">图片说明在「图片池」里编辑；只有开启上面的开关，大屏才会显示。</p>
        </Section>

        <div className="grid gap-4 md:grid-cols-2">
          <TextStyleEditor title="名字文字" style={moduleStyle.nameStyle} fonts={fonts} onChange={(nameStyle) => updateModuleStyle({ nameStyle })} />
          <TextStyleEditor title="说明文字" style={moduleStyle.labelStyle} fonts={fonts} onChange={(labelStyle) => updateModuleStyle({ labelStyle })} />
        </div>

        <Section title="模块">
          <SliderRow label="大小" value={moduleStyle.moduleScale} min={40} max={200} unit="%" onChange={(moduleScale) => updateModuleStyle({ moduleScale })} />
          <div className="space-y-2">
            <Label>每排数量</Label>
            <Select
              value={String(moduleStyle.columns)}
              onValueChange={(v) => updateModuleStyle({ columns: Number(v) })}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">自动</SelectItem>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label>模块外形</Label>
            <ChoiceRow label="模块外形" value={moduleStyle.shape} options={SHAPE_OPTIONS} onChange={(shape) => updateModuleStyle({ shape })} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label>文字位置</Label>
            <ChoiceRow label="文字位置" value={moduleStyle.labelPosition} options={LABEL_POSITION_OPTIONS} onChange={(labelPosition) => updateModuleStyle({ labelPosition })} />
          </div>
          <ColorRow label="背景颜色" value={moduleStyle.backgroundColor} onChange={(backgroundColor) => updateModuleStyle({ backgroundColor })} />
          <SliderRow label="背景透明度" value={moduleStyle.backgroundOpacity} min={0} max={100} unit="%" onChange={(backgroundOpacity) => updateModuleStyle({ backgroundOpacity })} />
        </Section>

        {LAYOUT_PAGES.map((page) => (
          <Section key={page} title={`${PAGE_LABELS[page]}排版`}>
            <PageLayoutEditor page={page} layout={pageLayouts[page]} fonts={fonts} />
          </Section>
        ))}

        <Section title="自定义字体">
          <FontManager fonts={fonts} />
        </Section>

        <Section title="中奖特效">
          <div className="flex flex-wrap gap-2">
            {EFFECT_OPTIONS.map(({ kind, label }) => {
              const active = effects.kinds.includes(kind);
              return (
                <Button
                  key={kind}
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  aria-pressed={active}
                  onClick={() => toggleKind(kind)}
                >
                  {label}
                </Button>
              );
            })}
          </div>
          {effects.kinds.includes('emoji') && (
            <div className="space-y-2">
              <Label>Emoji</Label>
              <Input value={effects.emojis} onChange={(e) => updateEffects({ emojis: e.target.value })} placeholder="🎉🧧✨" />
            </div>
          )}
          <SliderRow label="时长" value={effects.durationSec} min={1} max={10} unit="秒" onChange={(durationSec) => updateEffects({ durationSec })} />
          <SwitchRow label="定格奖品时也播放特效与音效" checked={effects.onPrizeReveal} onChange={(onPrizeReveal) => updateEffects({ onPrizeReveal })} />
          <Button type="button" variant="outline" size="sm" onClick={previewEffects}>
            <Play className="w-4 h-4 mr-1.5" /> 预览特效
          </Button>
        </Section>

        <Section title="音效">
          <div className="space-y-2">
            <Label>滚动音效</Label>
            <div className="flex items-center gap-2">
              <Select value={sound.roll} onValueChange={(v) => patchSound({ roll: v as RollSoundKind })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" onClick={() => void previewRoll()}>
                <Volume2 className="w-4 h-4 mr-1.5" /> 试听
              </Button>
            </div>
            {sound.roll === 'custom' && (
              <CustomAudioField slot="roll" fileName={sound.customRollName} mediaAvailable={mediaAvailable} />
            )}
          </div>
          <div className="space-y-2">
            <Label>中奖音效</Label>
            <div className="flex items-center gap-2">
              <Select value={sound.win} onValueChange={(v) => patchSound({ win: v as WinSoundKind })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WIN_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" onClick={() => void previewWin()}>
                <Volume2 className="w-4 h-4 mr-1.5" /> 试听
              </Button>
            </div>
            {sound.win === 'custom' && (
              <CustomAudioField slot="win" fileName={sound.customWinName} mediaAvailable={mediaAvailable} />
            )}
          </div>
          <SliderRow label="音量" value={sound.volume} min={0} max={100} unit="" onChange={(volume) => patchSound({ volume })} />
          <p className="text-xs text-muted-foreground">音效只在大屏窗口播放；大屏需点击一次页面解锁音频。试听在本窗口播放。</p>
        </Section>
      </div>

      <div className="lg:sticky lg:top-4">
        <Section title="预览">
          <div
            className="flex items-center justify-center rounded-md border"
            style={{ width: '100%', minHeight: PREVIEW_HEIGHT, background: '#fff7ef', padding: previewGap / 2 }}
          >
            <PrizeModule
              layout={layout}
              imageUrl={SAMPLE_IMAGE}
              label={PREVIEW_SAMPLE.label}
              name={PREVIEW_SAMPLE.name}
              dept={PREVIEW_SAMPLE.dept}
              showDept={showDept && moduleStyle.showName}
              nameFontSize={previewSizes.nameFontSize}
              labelFontSize={previewSizes.labelFontSize}
              deptFontSize={previewSizes.deptFontSize}
              style={moduleStyle}
              state="revealed"
              fontFamily={displayFont}
            />
          </div>
          <p className="text-xs text-muted-foreground">示例模块，与大屏使用同一组件；修改即时生效，无需保存。</p>
        </Section>
      </div>
    </div>
  );
}
