import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MediaUnavailableAlert } from '@/components/admin/MediaUnavailableAlert';
import { useLotteryStore } from '@/store/useStore';
import { useMediaStoreAvailable } from '@/hooks/useMediaStoreAvailable';
import { deleteMedia, putMedia } from '@/lib/media-store';
import { MAX_IMAGE_FILE_BYTES, prepareImageBlob } from '@/lib/image-processing';
import {
  DECOR_POSITIONS, DECOR_POSITION_LABELS, PAGE_LABELS, displayVerticalAlign, fontOptions, fromSelectValue,
  pageEditorSections, toSelectValue, type LayoutPage,
} from '@/lib/layout-editor';
import { cn } from '@/lib/utils';
import type { DecorPosition, HAlign, PageLayout, TextBlockStyle, UploadedFont, VAlign } from '@/lib/types';

const H_ALIGNS: { value: HAlign; label: string }[] = [
  { value: 'left', label: '左' },
  { value: 'center', label: '中' },
  { value: 'right', label: '右' },
];

interface ChoiceProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}

// 少量互斥选项：按钮组，选中项高亮
function Choice<T extends string>({ value, options, onChange, label }: ChoiceProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex gap-1">
      {options.map((o) => (
        <Button
          key={o.value}
          type="button"
          size="sm"
          variant={value === o.value ? 'default' : 'outline'}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

interface TextBlockEditorProps {
  testId: string;
  title: string;
  block: TextBlockStyle;
  fonts: UploadedFont[];
  onChange: (patch: Partial<TextBlockStyle>) => void;
}

// 标题 / 副标题：字体、字号、颜色、对齐
function TextBlockEditor({ testId, title, block, fonts, onChange }: TextBlockEditorProps) {
  const options = fontOptions(fonts, block.fontFamily);
  return (
    <div className="space-y-3 rounded-md border p-3" data-testid={testId}>
      <div className="text-sm font-medium">{title}</div>
      <div className="space-y-2">
        <Label>字体</Label>
        <Select value={toSelectValue(block.fontFamily)} onValueChange={(v) => onChange({ fontFamily: fromSelectValue(v) })}>
          <SelectTrigger className="w-full"><SelectValue placeholder="选择字体" /></SelectTrigger>
          <SelectContent>
            {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>字号</Label>
          <span className="text-xs font-mono text-muted-foreground">{block.fontSize}px</span>
        </div>
        <Slider min={12} max={240} step={1} value={[block.fontSize]} onValueChange={([fontSize]) => onChange({ fontSize })} />
      </div>
      <div className="flex items-center justify-between gap-4">
        <Label>颜色</Label>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">{block.color}</span>
          <input
            type="color"
            value={block.color}
            onChange={(e) => onChange({ color: e.target.value })}
            className="h-8 w-12 cursor-pointer rounded border bg-transparent p-0.5"
            aria-label={`${title}颜色`}
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <Label>对齐</Label>
        <Choice label={`${title}对齐`} value={block.align} options={H_ALIGNS} onChange={(align) => onChange({ align })} />
      </div>
    </div>
  );
}

// 3×3 九宫格位置选择
function PositionPicker({ value, onChange }: { value: DecorPosition; onChange: (p: DecorPosition) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1 w-fit" role="group" aria-label="装饰图位置">
      {DECOR_POSITIONS.flat().map((position) => (
        <button
          key={position}
          type="button"
          data-testid="decor-position"
          title={DECOR_POSITION_LABELS[position]}
          aria-label={DECOR_POSITION_LABELS[position]}
          aria-pressed={value === position}
          onClick={() => onChange(position)}
          className={cn(
            'h-8 w-10 rounded border text-xs transition-colors',
            value === position ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted',
          )}
        >
          {DECOR_POSITION_LABELS[position]}
        </button>
      ))}
    </div>
  );
}

interface DecorEditorProps {
  page: LayoutPage;
  decor: PageLayout['decor'];
  mediaAvailable: boolean | null;
}

// 装饰图：先写 IndexedDB 再登记元数据，成功后清理旧文件；IndexedDB 不可用时禁用上传
function DecorEditor({ page, decor, mediaAvailable }: DecorEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const update = useLotteryStore.getState;

  const handleFile = async (file: File) => {
    if (file.size > MAX_IMAGE_FILE_BYTES) {
      toast.error('装饰图不能超过 20MB');
      return;
    }
    if (!file.type.startsWith('image/') && !/\.(svg|png|jpe?g|gif|webp|avif|bmp)$/i.test(file.name)) {
      toast.error('请选择图片文件');
      return;
    }
    const key = `decor-${page}-${nanoid()}`;
    setUploading(true);
    try {
      await putMedia(key, await prepareImageBlob(file));
    } catch {
      toast.error('装饰图保存失败，请重试');
      setUploading(false);
      return;
    }
    const oldKey = update().settings[`${page}Layout`].decor.imageKey;
    update().updatePageLayout(page, { decor: { imageKey: key, imageName: file.name } });
    if (oldKey) void deleteMedia([oldKey]).catch(() => undefined);
    setUploading(false);
    toast.success('已设置装饰图');
  };

  const handleRemove = () => {
    const oldKey = decor.imageKey;
    update().updatePageLayout(page, { decor: { imageKey: '', imageName: '' } });
    if (oldKey) void deleteMedia([oldKey]).catch(() => undefined);
  };

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid={`${page}-decor`}>
      <div className="text-sm font-medium">装饰图</div>
      {mediaAvailable === false && <MediaUnavailableAlert />}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void handleFile(file);
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={mediaAvailable === false || uploading} onClick={() => inputRef.current?.click()}>
          <ImagePlus className="w-4 h-4 mr-1.5" />{uploading ? '上传中…' : decor.imageKey ? '更换图片' : '上传图片'}
        </Button>
        {decor.imageKey && (
          <Button type="button" variant="ghost" size="sm" onClick={handleRemove}>
            <Trash2 className="w-4 h-4 mr-1.5" />移除
          </Button>
        )}
        <span className="text-xs text-muted-foreground truncate">{decor.imageName ? `当前：${decor.imageName}` : '未设置'}</span>
      </div>
      {decor.imageKey && (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>宽度（占页面宽度）</Label>
              <span className="text-xs font-mono text-muted-foreground">{decor.widthPct}%</span>
            </div>
            <Slider
              min={1}
              max={100}
              step={1}
              value={[decor.widthPct]}
              onValueChange={([widthPct]) => update().updatePageLayout(page, { decor: { widthPct } })}
            />
          </div>
          <div className="space-y-2">
            <Label>位置</Label>
            <PositionPicker value={decor.position} onChange={(position) => update().updatePageLayout(page, { decor: { position } })} />
          </div>
        </>
      )}
    </div>
  );
}

interface PageLayoutEditorProps {
  page: LayoutPage;
  layout: PageLayout;
  fonts: UploadedFont[];
}

// 一页的排版编辑块：标题 / 副标题（奖项页没有副标题）、纵向位置、装饰图。
// 所有修改经 updatePageLayout 即时生效，没有保存按钮
export function PageLayoutEditor({ page, layout, fonts }: PageLayoutEditorProps) {
  const mediaAvailable = useMediaStoreAvailable();
  const sections = pageEditorSections(page);
  const patch = useLotteryStore.getState().updatePageLayout;
  return (
    <div className="space-y-3" data-testid={`${page}-layout`}>
      <TextBlockEditor
        testId={`${page}-title`}
        title={sections.titleLabel}
        block={layout.title}
        fonts={fonts}
        onChange={(title) => patch(page, { title })}
      />
      {sections.subtitle && (
        <TextBlockEditor
          testId={`${page}-subtitle`}
          title={sections.subtitleLabel}
          block={layout.subtitle}
          fonts={fonts}
          onChange={(subtitle) => patch(page, { subtitle })}
        />
      )}
      <div className="flex items-center justify-between gap-4">
        <Label>{PAGE_LABELS[page]}文字纵向位置</Label>
        <Choice<VAlign>
          label="纵向位置"
          value={displayVerticalAlign(page, layout.verticalAlign)}
          options={sections.verticalOptions}
          onChange={(verticalAlign) => patch(page, { verticalAlign })}
        />
      </div>
      <DecorEditor page={page} decor={layout.decor} mediaAvailable={mediaAvailable} />
    </div>
  );
}
