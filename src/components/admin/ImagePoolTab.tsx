import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { ImagePlus, Loader2, Search, Trash, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MediaUnavailableAlert } from '@/components/admin/MediaUnavailableAlert';
import { ImagePoolCard } from '@/components/admin/ImagePoolCard';
import { useLotteryStore } from '@/store/useStore';
import { useMediaUrls } from '@/hooks/useMediaUrls';
import { useMediaStoreAvailable } from '@/hooks/useMediaStoreAvailable';
import { deleteMedia, putMedia } from '@/lib/media-store';
import { labelFromFileName, MAX_IMAGE_FILE_BYTES, prepareImageBlob } from '@/lib/image-processing';
import { getFrozenImageIds } from '@/lib/draw-engine';
import {
  UNGROUPED, collectGroups, countByStatus, deriveImageStatuses, filterImages, clearGroupUpdates, setGroupUpdates,
  type ImageStatus,
} from '@/lib/image-pool-filter';

const STATUS_OPTIONS: { value: ImageStatus | 'all'; label: string }[] = [
  { value: 'all', label: '全部状态' },
  { value: 'available', label: '可用' },
  { value: 'used', label: '已抽中' },
  { value: 'frozen', label: '本轮已定格' },
];

type Confirm = 'delete' | 'clear' | null;

export function ImagePoolTab() {
  const prizeImages = useLotteryStore((s) => s.prizeImages);
  const winners = useLotteryStore((s) => s.winners);
  const prizes = useLotteryStore((s) => s.prizes);
  const currentRound = useLotteryStore((s) => s.currentRound);
  const showImageLabel = useLotteryStore((s) => s.settings.moduleStyle.showImageLabel);

  const mediaAvailable = useMediaStoreAvailable();
  const groupListId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadGroup, setUploadGroup] = useState('');
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [groupFilter, setGroupFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<ImageStatus | 'all'>('all');
  const [keyword, setKeyword] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchGroup, setBatchGroup] = useState('');
  const [confirm, setConfirm] = useState<Confirm>(null);

  // 状态一律由 draw-engine 的函数与 winners 推导
  const statuses = useMemo(
    () => deriveImageStatuses(prizeImages, winners, getFrozenImageIds(currentRound)),
    [prizeImages, winners, currentRound],
  );
  const counts = useMemo(() => countByStatus(prizeImages, statuses), [prizeImages, statuses]);
  const groups = useMemo(() => collectGroups(prizeImages), [prizeImages]);
  const visible = useMemo(
    () => filterImages(prizeImages, statuses, { group: groupFilter, status: statusFilter, keyword }),
    [prizeImages, statuses, groupFilter, statusFilter, keyword],
  );
  const allIds = useMemo(() => prizeImages.map((img) => img.id), [prizeImages]);
  const urls = useMediaUrls(allIds);

  // 已不存在的图片自动退出选择
  const selected = useMemo(() => {
    const known = new Set(allIds);
    return [...selectedIds].filter((id) => known.has(id));
  }, [allIds, selectedIds]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allVisibleSelected = visible.length > 0 && visible.every((img) => selectedSet.has(img.id));

  const prizeName = useCallback(
    (prizeId: string) => prizes.find((p) => p.id === prizeId)?.name ?? '已删除奖项',
    [prizes],
  );
  const groupSuggestions = useMemo(
    () => [...new Set([...prizes.map((p) => p.name), ...groups])],
    [prizes, groups],
  );

  const uploadDisabled = busy !== null || mediaAvailable === false;

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0 || uploadDisabled) return;
    const group = uploadGroup.trim();
    const stored: { id: string; label: string; group: string }[] = [];
    let skipped = 0;
    let failed = 0;
    setBusy({ done: 0, total: files.length });
    try {
      for (const [index, file] of files.entries()) {
        try {
          if (file.size > MAX_IMAGE_FILE_BYTES) {
            skipped += 1;
          } else if (!file.type.startsWith('image/') && !/\.(svg|png|jpe?g|gif|webp|avif|bmp)$/i.test(file.name)) {
            failed += 1;
          } else {
            const id = nanoid();
            const blob = await prepareImageBlob(file);
            // 必须先落库再登记元数据，大屏才读得到
            await putMedia(id, blob);
            stored.push({ id, label: labelFromFileName(file.name), group });
          }
        } catch {
          failed += 1;
        }
        setBusy({ done: index + 1, total: files.length });
      }
      if (stored.length > 0) useLotteryStore.getState().addPrizeImages(stored);
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    const extras = [skipped > 0 && `${skipped} 张超过 20MB 已跳过`, failed > 0 && `${failed} 张处理失败`].filter(Boolean);
    const message = `已导入 ${stored.length} 张图片${extras.length ? `（${extras.join('，')}）` : ''}`;
    if (stored.length === 0 && extras.length > 0) toast.error(message);
    else toast.success(message);
  };

  const handleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // 失焦保存：去空白，未变化则不写入
  const handleEdit = useCallback((id: string, updates: { label?: string; group?: string }) => {
    const store = useLotteryStore.getState();
    const target = store.prizeImages.find((img) => img.id === id);
    if (!target) return;
    const next: { label?: string; group?: string } = {};
    if (updates.label !== undefined && updates.label.trim() !== target.label) next.label = updates.label.trim();
    if (updates.group !== undefined && updates.group.trim() !== target.group) next.group = updates.group.trim();
    if (Object.keys(next).length === 0) return;
    store.updatePrizeImage(id, next);
    toast.success(next.label !== undefined ? `已保存图片说明「${next.label}」` : next.group ? `已设为分组「${next.group}」` : '已清除分组');
  }, []);

  // 删除：store 拒绝的不动 blob，成功的才清理 IndexedDB
  const removeImages = useCallback((ids: string[]) => {
    const { removed, blocked } = useLotteryStore.getState().removePrizeImages(ids);
    if (removed.length > 0) void deleteMedia(removed).catch(() => undefined);
    setSelectedIds((prev) => new Set([...prev].filter((id) => !removed.includes(id))));
    if (blocked.length > 0) toast.warning(`${blocked.length} 张图片已被抽中或本轮已定格，未删除`);
    if (removed.length > 0) toast.success(`已删除 ${removed.length} 张图片`);
  }, []);
  const removeOne = useCallback((id: string) => removeImages([id]), [removeImages]);

  // 以 store 当前值计算差异后逐张写入；不走 handleEdit，避免每张各弹一条 toast
  const applyGroupUpdates = (updates: { id: string; group: string }[]) => {
    const store = useLotteryStore.getState();
    for (const u of updates) store.updatePrizeImage(u.id, { group: u.group });
  };
  const handleBatchGroup = () => {
    const group = batchGroup.trim();
    if (!group) return; // 按钮在输入为空时已禁用；这里再兜底，空输入绝不清分组
    const updates = setGroupUpdates(useLotteryStore.getState().prizeImages, selected, group);
    applyGroupUpdates(updates);
    toast.success(updates.length > 0 ? `已将 ${updates.length} 张图片设为分组「${group}」` : `所选图片已在分组「${group}」，无需修改`);
  };
  const handleBatchClearGroup = () => {
    const updates = clearGroupUpdates(useLotteryStore.getState().prizeImages, selected);
    applyGroupUpdates(updates);
    toast.success(updates.length > 0 ? `已清除 ${updates.length} 张图片的分组` : '所选图片本来就没有分组');
  };

  const handleClear = () => {
    const ids = useLotteryStore.getState().prizeImages.map((img) => img.id);
    const result = useLotteryStore.getState().clearPrizeImages();
    if (!result.ok) {
      toast.error(result.reason);
      return;
    }
    void deleteMedia(ids).catch(() => undefined);
    setSelectedIds(new Set());
    toast.success(`已清空图片池（${ids.length} 张）`);
  };

  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const img of visible) {
        if (checked) next.add(img.id);
        else next.delete(img.id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {mediaAvailable === false && <MediaUnavailableAlert />}

      {!showImageLabel && (
        <Alert data-testid="label-hidden-alert">
          <TriangleAlert />
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>大屏当前不显示图片说明，下面修改的说明不会出现在抽奖页上。</span>
            <Button size="sm" variant="outline" onClick={() => useLotteryStore.getState().updateModuleStyle({ showImageLabel: true })}>开启显示</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* 上传区 */}
      <div
        className={`rounded-md border-2 border-dashed p-4 flex flex-wrap items-center gap-3 transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-border'} ${uploadDisabled ? 'opacity-60' : ''}`}
        onDragOver={(e) => { e.preventDefault(); if (!uploadDisabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={fileInputRef}
          id="image-pool-file-input"
          type="file"
          multiple
          accept="image/*"
          className="sr-only"
          disabled={uploadDisabled}
          onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); }}
        />
        <Button type="button" disabled={uploadDisabled} onClick={() => fileInputRef.current?.click()}>
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImagePlus className="w-4 h-4 mr-2" />}
          {busy ? `处理中 ${busy.done}/${busy.total}` : '批量上传图片'}
        </Button>
        <div className="flex items-center gap-2">
          <Label htmlFor="image-pool-upload-group" className="whitespace-nowrap">上传到分组</Label>
          <Input
            id="image-pool-upload-group"
            list={groupListId}
            value={uploadGroup}
            onChange={(e) => setUploadGroup(e.target.value)}
            placeholder="可选，如 一等奖"
            className="w-44"
            disabled={busy !== null}
          />
        </div>
        <span className="text-sm text-muted-foreground">可多选，或将图片拖到此处；单张不超过 20MB，会自动压缩（长边 1920px）。说明在输入框中修改，回车或点击别处即保存；大屏需开启「图片下方显示图片说明」才会显示</span>
        <datalist id={groupListId}>
          {groupSuggestions.map((name) => <option key={name} value={name} />)}
        </datalist>
      </div>

      {/* 统计与筛选 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex gap-4 text-sm">
          <span>总数 <b>{counts.total}</b></span>
          <span>可用 <b>{counts.available}</b></span>
          <span>已抽中 <b>{counts.used}</b></span>
          {counts.frozen > 0 && <span>本轮已定格 <b>{counts.frozen}</b></span>}
        </div>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索说明或编号" className="pl-8 w-44" />
          </div>
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分组</SelectItem>
              <SelectItem value={UNGROUPED}>未分组</SelectItem>
              {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ImageStatus | 'all')}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 批量操作 */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={allVisibleSelected} onCheckedChange={(v) => toggleAllVisible(v === true)} disabled={visible.length === 0} />
          全选当前筛选（{visible.length}）
        </label>
        <span className="text-sm text-muted-foreground">已选 {selected.length} 张</span>
        <Input
          list={groupListId}
          value={batchGroup}
          onChange={(e) => setBatchGroup(e.target.value)}
          placeholder="目标分组，如 一等奖"
          className="w-52"
          disabled={selected.length === 0}
        />
        <Button variant="outline" size="sm" disabled={selected.length === 0 || batchGroup.trim() === ''} onClick={handleBatchGroup}>批量设分组</Button>
        <Button variant="outline" size="sm" disabled={selected.length === 0} onClick={handleBatchClearGroup}>清除分组</Button>
        <Button variant="outline" size="sm" disabled={selected.length === 0} onClick={() => setConfirm('delete')}>
          <Trash className="w-4 h-4 mr-1" />批量删除
        </Button>
        <Button variant="destructive" size="sm" className="ml-auto" disabled={prizeImages.length === 0} onClick={() => setConfirm('clear')}>
          清空图片池
        </Button>
      </div>

      {/* 图片网格 */}
      {visible.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground border rounded-md">
          {prizeImages.length === 0 ? '图片池为空，请先上传奖品图片' : '没有符合筛选条件的图片'}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
          {visible.map((img) => (
            <ImagePoolCard
              key={img.id}
              image={img}
              url={urls[img.id]}
              info={statuses.get(img.id) ?? { status: 'available' }}
              prizeName={prizeName}
              selected={selectedSet.has(img.id)}
              groupListId={groupListId}
              onSelect={handleSelect}
              onEdit={handleEdit}
              onRemove={removeOne}
            />
          ))}
        </div>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === 'clear' ? '清空图片池' : '批量删除图片'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'clear'
                ? `将删除全部 ${prizeImages.length} 张图片，编号重新从 IMG-0001 开始。已有抽奖记录或本轮正在进行时无法清空。此操作不可撤销，确定继续？`
                : `将删除已选的 ${selected.length} 张图片。已被抽中或本轮已定格的图片会被跳过。此操作不可撤销，确定继续？`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => (confirm === 'clear' ? handleClear() : removeImages(selected))}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
