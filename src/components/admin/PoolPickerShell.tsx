import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export const PICKER_PAGE_SIZE = 200;

interface Props {
  title: string;
  description: string;
  unit: string;                 // 张 / 人
  filter: ReactNode;            // 筛选下拉
  keyword: string;
  onKeywordChange: (v: string) => void;
  searchPlaceholder: string;
  selectedCount: number;
  listCount: number;            // 当前筛选后的条数
  page: number;                 // 从 0 开始
  onPageChange: (page: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onRestoreAuto: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;          // 当前页列表
}

// 池选择器对话框的公共外壳：搜索、批量按钮、分页、底部计数与确定
export function PoolPickerShell(p: Props) {
  const pageCount = Math.max(1, Math.ceil(p.listCount / PICKER_PAGE_SIZE));
  return (
    <Dialog open onOpenChange={(open) => { if (!open) p.onCancel(); }}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{p.title}</DialogTitle>
          <DialogDescription>{p.description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          {p.filter}
          <Input
            value={p.keyword}
            onChange={(e) => p.onKeywordChange(e.target.value)}
            placeholder={p.searchPlaceholder}
            className="w-56"
          />
          <Button variant="outline" size="sm" onClick={p.onSelectAll} disabled={p.listCount === 0}>全选（当前筛选）</Button>
          <Button variant="outline" size="sm" onClick={p.onClear}>清空选择</Button>
          <Button variant="outline" size="sm" onClick={p.onRestoreAuto}>恢复自动</Button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-[200px] rounded-md border p-2">
          {p.listCount === 0 ? <div className="text-center text-muted-foreground py-10">没有可选项</div> : p.children}
        </div>
        {pageCount > 1 && (
          <div className="flex items-center justify-center gap-3 text-sm">
            <Button variant="outline" size="sm" disabled={p.page <= 0} onClick={() => p.onPageChange(p.page - 1)}>上一页</Button>
            <span className="text-muted-foreground">第 {p.page + 1} / {pageCount} 页（每页 {PICKER_PAGE_SIZE}）</span>
            <Button variant="outline" size="sm" disabled={p.page >= pageCount - 1} onClick={() => p.onPageChange(p.page + 1)}>下一页</Button>
          </div>
        )}
        <DialogFooter className="items-center sm:justify-between">
          <span className="text-sm text-muted-foreground">已选 {p.selectedCount} {p.unit}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={p.onCancel}>取消</Button>
            <Button onClick={p.onConfirm}>确定</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
