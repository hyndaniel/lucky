import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

// IndexedDB 不可用警告：图片池与自定义音效上传共用
export const MEDIA_UNAVAILABLE_TEXT =
  '当前浏览器环境无法使用本地图片库（IndexedDB）。请使用 Chrome / Edge 打开，或通过 pnpm preview 以 http 方式访问。';

export function MediaUnavailableAlert({ className }: { className?: string }) {
  return (
    <Alert variant="destructive" className={cn('border-destructive/50', className)}>
      <TriangleAlert />
      <AlertDescription>{MEDIA_UNAVAILABLE_TEXT}</AlertDescription>
    </Alert>
  );
}
