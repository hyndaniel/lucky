import { useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMediaUrls } from '@/hooks/useMediaUrls';
import { getAvailableImages } from '@/lib/draw-engine';
import { collectGroups, filterImages, UNGROUPED } from '@/lib/image-pool-filter';
import { formatSerial } from '@/lib/serial';
import type { PrizeImage, Winner } from '@/lib/types';
import { PICKER_PAGE_SIZE, PoolPickerShell } from '@/components/admin/PoolPickerShell';

interface Props {
  images: PrizeImage[];
  winners: Winner[];
  imagePoolIds: string[] | null;
  onConfirm: (ids: string[] | null) => void;
  onCancel: () => void;
}

// 图片池选择器：只列可用图片。挂载时按当前配置初始化（null = 自动 = 全部可用）
export function ImagePoolPicker({ images, winners, imagePoolIds, onConfirm, onCancel }: Props) {
  const available = useMemo(() => getAvailableImages(images, winners), [images, winners]);
  const [auto, setAuto] = useState(imagePoolIds === null);
  const [selected, setSelected] = useState<Set<string>>(() => {
    const ids = imagePoolIds === null ? available.map((i) => i.id) : imagePoolIds;
    const availableIds = new Set(available.map((i) => i.id));
    return new Set(ids.filter((id) => availableIds.has(id)));
  });
  const [group, setGroup] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);

  const groups = useMemo(() => collectGroups(available), [available]);
  const list = useMemo(
    () => filterImages(available, new Map(), { group, status: 'all', keyword }),
    [available, group, keyword],
  );
  const pageItems = list.slice(page * PICKER_PAGE_SIZE, (page + 1) * PICKER_PAGE_SIZE);
  const urls = useMediaUrls(pageItems.map((i) => i.id));

  const change = (next: Set<string>) => { setSelected(next); setAuto(false); };
  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id); else next.delete(id);
    change(next);
  };

  return (
    <PoolPickerShell
      title="选择本轮图片池"
      description="只列出尚未被抽中的图片。未做修改直接确定会保持当前设置。"
      unit="张"
      filter={(
        <Select value={group} onValueChange={(v) => { setGroup(v); setPage(0); }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分组</SelectItem>
            <SelectItem value={UNGROUPED}>未分组</SelectItem>
            {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      keyword={keyword}
      onKeywordChange={(v) => { setKeyword(v); setPage(0); }}
      searchPlaceholder="搜索说明或编号"
      selectedCount={selected.size}
      listCount={list.length}
      page={page}
      onPageChange={setPage}
      onSelectAll={() => change(new Set([...selected, ...list.map((i) => i.id)]))}
      onClear={() => change(new Set())}
      onRestoreAuto={() => { setAuto(true); setSelected(new Set(available.map((i) => i.id))); }}
      onConfirm={() => onConfirm(auto ? null : [...selected])}
      onCancel={onCancel}
    >
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {pageItems.map((img) => (
          <label
            key={img.id}
            className="rounded-md border p-2 flex flex-col gap-1 cursor-pointer hover:bg-muted/40 [content-visibility:auto] [contain-intrinsic-size:auto_170px]"
            data-testid="picker-item"
          >
            <div className="relative w-full h-24 rounded bg-muted flex items-center justify-center overflow-hidden">
              {urls[img.id] ? <img src={urls[img.id]} alt={img.label} className="w-full h-full object-contain" /> : <span className="text-muted-foreground">?</span>}
              <Checkbox
                className="absolute top-1 left-1 bg-background"
                checked={selected.has(img.id)}
                onCheckedChange={(v) => toggle(img.id, v === true)}
              />
            </div>
            <span className="font-mono text-xs text-muted-foreground">{formatSerial('IMG', img.serial)}</span>
            <span className="text-xs truncate" title={img.label}>{img.label}</span>
            <span className="text-xs text-muted-foreground truncate">{img.group || '未分组'}</span>
          </label>
        ))}
      </div>
    </PoolPickerShell>
  );
}
