import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MediaUnavailableAlert } from '@/components/admin/MediaUnavailableAlert';
import { useLotteryStore } from '@/store/useStore';
import { useMediaStoreAvailable } from '@/hooks/useMediaStoreAvailable';
import { deleteMedia, putMedia } from '@/lib/media-store';
import { FONT_ACCEPT, MAX_FONT_BYTES, createUploadedFont, usesFont, validateFontFile } from '@/lib/layout-editor';
import type { UploadedFont } from '@/lib/types';

// 自定义字体：上传（先写 IndexedDB 再登记元数据）与删除（清掉引用、元数据与 blob）。
// 字体本体只在 IndexedDB；IndexedDB 不可用时禁用上传，不抛错
export function FontManager({ fonts }: { fonts: UploadedFont[] }) {
  const mediaAvailable = useMediaStoreAvailable();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    const error = validateFontFile(file);
    if (error) {
      toast.error(error);
      return;
    }
    const font = createUploadedFont(nanoid(), file.name);
    setUploading(true);
    try {
      await putMedia(font.key, file);
    } catch {
      toast.error('字体保存失败，请重试');
      setUploading(false);
      return;
    }
    useLotteryStore.getState().addFont(font);
    setUploading(false);
    toast.success(`已上传字体「${file.name}」，可在各处字体下拉中选择`);
  };

  // 删除前把仍引用该字体的排版 / 模块文字样式改回「跟随全局」，避免留下悬空的 family
  const handleRemove = (font: UploadedFont) => {
    const store = useLotteryStore.getState();
    const { settings } = store;
    for (const page of ['welcome', 'prize', 'lottery'] as const) {
      const layout = settings[`${page}Layout`];
      if (usesFont(layout.title.fontFamily, font)) store.updatePageLayout(page, { title: { fontFamily: '' } });
      if (usesFont(layout.subtitle.fontFamily, font)) store.updatePageLayout(page, { subtitle: { fontFamily: '' } });
    }
    if (usesFont(settings.moduleStyle.nameStyle.fontFamily, font)) store.updateModuleStyle({ nameStyle: { fontFamily: '' } });
    if (usesFont(settings.moduleStyle.labelStyle.fontFamily, font)) store.updateModuleStyle({ labelStyle: { fontFamily: '' } });
    store.removeFont(font.key);
    void deleteMedia([font.key]).catch(() => undefined);
    toast.success(`已删除字体「${font.name}」`);
  };

  return (
    <div className="space-y-3">
      {mediaAvailable === false && <MediaUnavailableAlert />}
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={FONT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void handleFile(file);
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={mediaAvailable === false || uploading} onClick={() => inputRef.current?.click()}>
          <Upload className="w-4 h-4 mr-1.5" />{uploading ? '上传中…' : '上传字体'}
        </Button>
        <span className="text-xs text-muted-foreground">.ttf / .otf / .woff / .woff2，单个不超过 {MAX_FONT_BYTES / 1024 / 1024}MB</span>
      </div>
      {fonts.length > 0 && (
        <ul className="space-y-1">
          {fonts.map((font) => (
            <li key={font.key} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-sm">
              <span className="truncate">{font.name}</span>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="删除字体" aria-label={`删除字体 ${font.name}`} onClick={() => handleRemove(font)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">字体保存在本机浏览器，换电脑需重新上传。</p>
    </div>
  );
}
