import { memo } from 'react';
import { Trash } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { formatSerial } from '@/lib/serial';
import type { ImageStatusInfo } from '@/lib/image-pool-filter';
import type { PrizeImage } from '@/lib/types';

interface Props {
  image: PrizeImage;
  url: string | undefined;
  info: ImageStatusInfo;
  prizeName: (prizeId: string) => string;
  selected: boolean;
  groupListId: string;
  onSelect: (id: string, checked: boolean) => void;
  onEdit: (id: string, updates: { label?: string; group?: string }) => void;
  onRemove: (id: string) => void;
}

function statusText(info: ImageStatusInfo, prizeName: Props['prizeName']): string {
  if (info.status === 'frozen') return '本轮已定格';
  if (info.status === 'available') return '可用';
  const { prizeId, roundNo } = info.winner;
  return ['已抽中', prizeName(prizeId), roundNo ? `第${roundNo}轮` : ''].filter(Boolean).join(' · ');
}

// 单张图片卡片：固定尺寸缩略图，说明/分组失焦保存。memo 避免 200+ 张时整页重渲染
function ImagePoolCardImpl({ image, url, info, prizeName, selected, groupListId, onSelect, onEdit, onRemove }: Props) {
  const locked = info.status !== 'available';
  const text = statusText(info, prizeName);
  return (
    <div
      className="rounded-md border bg-card p-2 flex flex-col items-start gap-2 [content-visibility:auto] [contain-intrinsic-size:auto_300px]"
      data-testid="image-card"
    >
      <div className="relative w-full">
        <div className="w-full h-32 rounded bg-muted flex items-center justify-center overflow-hidden">
          {url ? (
            <img src={url} alt={image.label} width={160} height={128} loading="lazy" decoding="async" className="w-full h-full object-contain" />
          ) : (
            <span className="text-2xl text-muted-foreground">?</span>
          )}
        </div>
        <Checkbox
          className="absolute top-1 left-1 bg-background"
          checked={selected}
          onCheckedChange={(v) => onSelect(image.id, v === true)}
          aria-label={`选择 ${formatSerial('IMG', image.serial)}`}
        />
      </div>
      <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">{formatSerial('IMG', image.serial)}</span>
      <Badge variant={info.status === 'available' ? 'secondary' : 'outline'} className="max-w-full truncate" title={text}>{text}</Badge>
      {/* key 随已保存值变化，保存后输入框以新值重建 */}
      <Input
        key={`label:${image.label}`}
        defaultValue={image.label}
        placeholder="图片说明"
        className="h-8 text-sm w-full"
        onBlur={(e) => onEdit(image.id, { label: e.target.value })}
      />
      <div className="flex items-center gap-1 w-full">
        <Input
          key={`group:${image.group}`}
          defaultValue={image.group}
          list={groupListId}
          placeholder="未分组"
          className="h-8 text-sm"
          onBlur={(e) => onEdit(image.id, { group: e.target.value })}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={locked}
          title={locked ? '已被抽中或本轮已定格，不能删除' : '删除'}
          onClick={() => onRemove(image.id)}
        >
          <Trash className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export const ImagePoolCard = memo(ImagePoolCardImpl);
