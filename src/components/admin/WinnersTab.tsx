import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useLotteryStore } from '@/store/useStore';
import { useMediaUrls } from '@/hooks/useMediaUrls';
import { getRemainingSlots } from '@/lib/draw-engine';
import { formatSerial } from '@/lib/serial';
import { sortWinnersForDisplay } from '@/lib/winner-records';
import type { Prize, Winner } from '@/lib/types';

const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif';

// 图片列文本：编号 + 说明；旧记录无图片时为 '-'
function imageText(w: Winner): string {
  if (w.imageSerial === undefined) return '-';
  return w.imageLabel ? `${formatSerial('IMG', w.imageSerial)} ${w.imageLabel}` : formatSerial('IMG', w.imageSerial);
}

// 按列宽截断文本，超出加省略号
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end -= 1;
  return `${text.slice(0, end)}…`;
}

// 导出中奖记录为 PNG（按时间顺序，最多 60 条）
function exportWinnersImage(winners: Winner[], prizes: Prize[], title: string) {
  if (winners.length === 0) {
    toast.error('暂无中奖记录');
    return;
  }

  const prizeNameMap = new Map(prizes.map((p) => [p.id, p.name]));
  const sortedWinners = [...winners].sort((a, b) => a.wonAt - b.wonAt);
  const maxRows = 60;
  const truncated = sortedWinners.length > maxRows;
  const rows = sortedWinners.slice(0, maxRows);

  const width = 1080;
  const rowHeight = 48;
  const headerHeight = 260;
  const footerHeight = 80;
  const tableHeaderHeight = 56;
  const extraNoteHeight = truncated ? 32 : 0;
  const height = Math.min(4000, headerHeight + tableHeaderHeight + rows.length * rowHeight + extraNoteHeight + footerHeight);

  const canvas = document.createElement('canvas');
  const scale = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#0b0b0f');
  gradient.addColorStop(1, '#1a0f0a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255, 215, 0, 0.08)';
  for (let i = 0; i < 80; i++) {
    const x = (i * 137) % width;
    const y = (i * 83) % height;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#f5d76e';
  ctx.font = `700 44px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(title || 'Lucky Draw', 64, 88);

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 56px ${FONT}`;
  ctx.fillText('中奖记录', 64, 150);

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `16px ${FONT}`;
  ctx.fillText(`导出时间：${new Date().toLocaleString()}`, 64, 190);
  ctx.fillText(`记录总数：${winners.length}`, 64, 216);

  const tableTop = headerHeight;
  ctx.fillStyle = 'rgba(255, 215, 0, 0.12)';
  ctx.fillRect(48, tableTop, width - 96, tableHeaderHeight);

  ctx.fillStyle = '#f5d76e';
  ctx.font = `600 18px ${FONT}`;
  const colXs = { idx: 72, name: 130, dept: 280, prize: 450, image: 590, time: 850 };
  ctx.fillText('序号', colXs.idx, tableTop + 34);
  ctx.fillText('姓名', colXs.name, tableTop + 34);
  ctx.fillText('部门', colXs.dept, tableTop + 34);
  ctx.fillText('奖项', colXs.prize, tableTop + 34);
  ctx.fillText('奖品', colXs.image, tableTop + 34);
  ctx.fillText('时间', colXs.time, tableTop + 34);

  ctx.font = `16px ${FONT}`;
  rows.forEach((w, i) => {
    const y = tableTop + tableHeaderHeight + i * rowHeight;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)';
    ctx.fillRect(48, y, width - 96, rowHeight);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(i + 1), colXs.idx, y + 30);
    ctx.fillText(fitText(ctx, w.name, colXs.dept - colXs.name - 12), colXs.name, y + 30);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(fitText(ctx, w.dept || '-', colXs.prize - colXs.dept - 12), colXs.dept, y + 30);
    ctx.fillStyle = '#f5d76e';
    ctx.fillText(fitText(ctx, prizeNameMap.get(w.prizeId) || '-', colXs.image - colXs.prize - 12), colXs.prize, y + 30);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(fitText(ctx, imageText(w), colXs.time - colXs.image - 12), colXs.image, y + 30);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(fitText(ctx, new Date(w.wonAt).toLocaleString(), width - 56 - colXs.time), colXs.time, y + 30);
  });

  let footerTop = tableTop + tableHeaderHeight + rows.length * rowHeight;
  if (truncated) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(`仅导出前 ${maxRows} 条记录`, 64, footerTop + 22);
    footerTop += extraNoteHeight;
  }

  ctx.strokeStyle = 'rgba(255,215,0,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(48, tableTop, width - 96, footerTop - tableTop);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `winners-${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
}

export function WinnersTab() {
  const winners = useLotteryStore((s) => s.winners);
  const prizes = useLotteryStore((s) => s.prizes);
  const title = useLotteryStore((s) => s.settings.title);
  const resetWinners = useLotteryStore((s) => s.resetWinners);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const rows = useMemo(() => sortWinnersForDisplay(winners), [winners]);
  const imageKeys = useMemo(() => [...new Set(winners.flatMap((w) => (w.imageId ? [w.imageId] : [])))], [winners]);
  const urls = useMediaUrls(imageKeys);
  const prizeNameMap = useMemo(() => new Map(prizes.map((p) => [p.id, p.name])), [prizes]);

  const handleReset = () => {
    resetWinners();
    toast.success('已重置清零');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div className="space-y-2">
          <h3 className="font-bold text-lg">历史中奖记录</h3>
          <div className="flex flex-wrap gap-2">
            {prizes.map((prize) => (
              <Badge key={prize.id} variant="secondary">
                {prize.name} {prize.count - getRemainingSlots(prize, winners)}/{prize.count}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportWinnersImage(winners, prizes, title)}>导出图片</Button>
          <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>重置清零</Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>轮次</TableHead>
            <TableHead>奖项</TableHead>
            <TableHead>奖品图片</TableHead>
            <TableHead>姓名</TableHead>
            <TableHead>编号</TableHead>
            <TableHead>部门</TableHead>
            <TableHead>时间</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">暂无中奖记录</TableCell>
            </TableRow>
          ) : rows.map((w) => {
            const url = w.imageId ? urls[w.imageId] : undefined;
            return (
              <TableRow key={`${w.roundId}-${w.id}`}>
                <TableCell>{w.roundNo !== undefined ? `第 ${w.roundNo} 轮` : '-'}</TableCell>
                <TableCell><Badge variant="outline">{prizeNameMap.get(w.prizeId) ?? '-'}</Badge></TableCell>
                <TableCell>
                  {w.imageSerial === undefined ? (
                    <span className="text-muted-foreground">-</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      {url ? (
                        <img src={url} alt={w.imageLabel || formatSerial('IMG', w.imageSerial)} className="h-10 w-10 rounded border object-contain bg-muted" />
                      ) : (
                        <div className="h-10 w-10 rounded border bg-muted" />
                      )}
                      <div className="text-xs leading-tight">
                        <div className="font-mono text-muted-foreground">{formatSerial('IMG', w.imageSerial)}</div>
                        {w.imageLabel && <div>{w.imageLabel}</div>}
                      </div>
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-medium">{w.name}</TableCell>
                <TableCell className="font-mono text-muted-foreground">{w.serial ? formatSerial('N', w.serial) : '-'}</TableCell>
                <TableCell>{w.dept || '-'}</TableCell>
                <TableCell className="font-mono text-muted-foreground">{new Date(w.wonAt).toLocaleTimeString()}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重置清零</AlertDialogTitle>
            <AlertDialogDescription>
              {`将清空全部 ${winners.length} 条抽奖记录和当前轮次，所有图片和名字恢复为可抽状态。图片池、名单、奖项与设置会保留。此操作不可撤销，确定继续？`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
