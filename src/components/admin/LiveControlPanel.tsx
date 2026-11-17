import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Plus, Square, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLotteryStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { DEFAULT_MODULE_COUNT, MAX_MODULE_COUNT } from '@/lib/defaults';
import {
  getAvailableImages, getDefaultImagePoolIds, getRemainingSlots, NO_PRIZE_ERROR,
  validateNameRollStart, validatePrizeRollStart, type RollStartInput,
} from '@/lib/draw-engine';
import { describeImagePool, describeNamePool, formatLayoutHint } from '@/lib/pool-summary';
import { ADVANCE_LABELS } from '@/lib/phase-labels';
import { isAdvanceTooSoon, isSpaceOwnedByControl } from '@/lib/advance-guard';
import type { ActionResult, CurrentRound, Prize } from '@/lib/types';
import { ImagePoolPicker } from '@/components/admin/ImagePoolPicker';
import { NamePoolPicker } from '@/components/admin/NamePoolPicker';
import { RoundResultCard } from '@/components/admin/RoundResultCard';

const QUICK_COUNTS = [1, 2, 3, 6, 10, 12];

const SCENES = [
  { mode: 'welcome', icon: '🎉', label: '欢迎页' },
  { mode: 'prize', icon: '🎁', label: '奖项页' },
  { mode: 'lottery', icon: '🎰', label: '抽奖页' },
] as const;

interface Props {
  controlledMode: boolean;
  onEditPrize: (prize: Prize) => void;
  onDeletePrize: (id: string) => void;
  onAddPrize: () => void;
}

const showFailure = (result: ActionResult) => {
  if (!result.ok) toast.error(result.reason);
};

// 现场控制：场景、奖项、本轮配置、主按钮与本轮结果
export function LiveControlPanel({ controlledMode, onEditPrize, onDeletePrize, onAddPrize }: Props) {
  const {
    prizes, prizeImages, participants, winners, settings, currentPrizeId, currentRound, viewMode,
    setViewMode, selectPrize, setRoundConfig, cancelRound,
  } = useLotteryStore();
  const [picker, setPicker] = useState<'image' | 'name' | null>(null);
  const lastAdvanceAt = useRef(0); // 上一次成功推进的时间；用 ref 避免重渲染

  const phase = currentRound?.phase ?? 'idle'; // round 为 null 时按 idle 处理
  const settled = phase === 'idle' || phase === 'completed';
  const configEditable = phase === 'idle';
  const currentPrize = prizes.find((p) => p.id === currentPrizeId);
  const remaining = currentPrize ? getRemainingSlots(currentPrize, winners) : 0;

  // round 为 null（自动创建失败未持久化）时，用与 store 创建轮次一致的默认值展示和校验
  const round: CurrentRound | null = useMemo(() => {
    if (currentRound || !currentPrize) return currentRound;
    return {
      id: '', roundNo: 0, phase: 'idle', namePoolIds: null, resultImageIds: [], resultNameIds: [], drawMode: 'image-then-name',
      moduleCount: Math.max(1, Math.min(DEFAULT_MODULE_COUNT, getRemainingSlots(currentPrize, winners))),
      imagePoolIds: getDefaultImagePoolIds(getAvailableImages(prizeImages, winners), currentPrize.name),
    };
  }, [currentRound, currentPrize, winners, prizeImages]);

  // 开始前的校验原因，显示在主按钮下方
  const validationReason = useMemo(() => {
    if (!currentPrize || !round) return NO_PRIZE_ERROR;
    const input: RollStartInput = { prize: currentPrize, winners, prizeImages, participants, round };
    if (round.phase === 'idle') return validatePrizeRollStart(input);
    if (round.phase === 'prizesRevealed') return validateNameRollStart(input);
    return null;
  }, [round, currentPrize, winners, prizeImages, participants]);

  // 点击与空格共用的推进入口：距上次成功推进不足冷却时间则忽略，失败时 toast 原因且不更新时间戳
  const tryAdvance = useCallback(() => {
    const now = Date.now();
    if (isAdvanceTooSoon(lastAdvanceAt.current, now)) return;
    const result = useLotteryStore.getState().advanceRound();
    if (result.ok) lastAdvanceAt.current = now;
    else toast.error(result.reason);
  }, []);

  // 空格键推进（全页面唯一的空格监听）。输入控件/复选框/开关/标签页聚焦、对话框打开、长按重复时不触发
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isSpaceOwnedByControl(e.target) || document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      // 焦点在按钮上时，松开空格会再触发一次点击；先失焦避免重复推进
      if ((e.target as HTMLElement | null)?.tagName === 'BUTTON') (e.target as HTMLElement).blur();
      tryAdvance();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tryAdvance]);

  const moduleCount = round?.moduleCount ?? DEFAULT_MODULE_COUNT;
  const layoutHint = formatLayoutHint(moduleCount, settings.moduleStyle.columns);
  const rolling = phase === 'rollingPrizes' || phase === 'rollingNames';
  const canCancel = rolling || phase === 'prizesRevealed';
  const noPrize = !currentPrize;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2 border-primary/20 shadow-md">
        <CardHeader><CardTitle>现场控制 (Live Control)</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          {/* 场景切换 */}
          <div className="space-y-2">
            <Label>大屏场景</Label>
            <div className="flex gap-3 p-2 bg-muted/30 rounded-xl w-fit border-2 border-dashed border-muted-foreground/20">
              {SCENES.map(({ mode, icon, label }) => (
                <Button
                  key={mode}
                  variant={viewMode === mode ? 'default' : 'outline'}
                  onClick={() => setViewMode(mode)}
                  className={cn('w-24 h-24 flex flex-col gap-2 text-base', viewMode === mode && 'ring-2 ring-primary ring-offset-2')}
                >
                  <span className="text-3xl">{icon}</span>
                  <span>{label}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* 奖项切换：名称 已抽/总数 */}
          <div className="space-y-2">
            <Label>当前抽取的奖项 <span className="text-xs text-muted-foreground">(点击选择，双击编辑)</span></Label>
            <div className="flex flex-wrap gap-2">
              {prizes.map((p) => {
                const left = getRemainingSlots(p, winners);
                return (
                  <Button
                    key={p.id}
                    variant={currentPrizeId === p.id ? 'default' : 'outline'}
                    onClick={() => showFailure(selectPrize(p.id))}
                    onDoubleClick={() => settled && onEditPrize(p)}
                    className="min-w-[100px] relative group"
                    disabled={!settled}
                  >
                    {p.name} {p.count - left}/{p.count}
                    {left === 0 && <span className="ml-1 text-xs opacity-80">已抽完</span>}
                    {settled && (
                      <span
                        className="absolute -top-1 -right-1 hidden group-hover:flex w-4 h-4 bg-destructive text-destructive-foreground rounded-full items-center justify-center text-xs cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); onDeletePrize(p.id); }}
                      >
                        ×
                      </span>
                    )}
                  </Button>
                );
              })}
              <Button variant="ghost" size="icon" onClick={onAddPrize} title="添加奖项" disabled={!settled}><Plus className="w-4 h-4" /></Button>
            </div>
          </div>

          {/* 本轮配置：仅 idle 可改 */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="mr-1">本轮模块数</Label>
              <Input
                key={moduleCount}
                type="number"
                min={1}
                max={MAX_MODULE_COUNT}
                defaultValue={moduleCount}
                disabled={!configEditable || noPrize}
                aria-label="本轮模块数"
                className="w-20 h-8"
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (n === moduleCount) return;
                  const result = setRoundConfig({ moduleCount: n });
                  if (!result.ok) { toast.error(result.reason); e.target.value = String(moduleCount); }
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              />
              {QUICK_COUNTS.map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant={moduleCount === n ? 'default' : 'outline'}
                  disabled={!configEditable || noPrize}
                  onClick={() => showFailure(setRoundConfig({ moduleCount: n }))}
                >
                  {n}
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                disabled={!configEditable || remaining < 1}
                onClick={() => showFailure(setRoundConfig({ moduleCount: Math.min(remaining, MAX_MODULE_COUNT) }))}
              >
                剩余全部
              </Button>
              {layoutHint && <span className="text-sm text-muted-foreground font-mono" title="每排数量 × 排数">布局 {layoutHint}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground w-14">图片池</span>
              <span data-testid="image-pool-summary">{describeImagePool(prizeImages, winners, round?.imagePoolIds ?? null, currentPrize?.name ?? '')}</span>
              <Button size="sm" variant="outline" disabled={!configEditable || noPrize} onClick={() => setPicker('image')}>选择图片</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground w-14">名字池</span>
              <span data-testid="name-pool-summary">{describeNamePool(participants, winners, currentPrize?.id, round?.namePoolIds ?? null)}</span>
              <Button size="sm" variant="outline" disabled={noPrize || !(phase === 'idle' || phase === 'prizesRevealed')} onClick={() => setPicker('name')}>选择名字</Button>
            </div>
          </div>

          {/* 主按钮：不禁用，点击失败时 toast 同一原因 */}
          <div className="flex flex-col items-center gap-2 py-4 bg-muted/30 rounded-lg border border-dashed">
            <div className="flex items-center gap-4">
              <div className="text-center space-y-1">
                <div className="text-sm text-muted-foreground">当前奖项</div>
                <div className="text-2xl font-bold">{currentPrize?.name || '未选择'}</div>
                {round && round.roundNo > 0 && <div className="text-xs text-muted-foreground">第 {round.roundNo} 轮</div>}
              </div>
              <div className="h-10 w-px bg-border mx-4" />
              <Button
                size="lg"
                className={cn('h-20 text-2xl px-12 transition-all', rolling ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700')}
                onClick={tryAdvance}
              >
                {rolling ? <Square className="w-6 h-6 mr-3 fill-current" /> : <Play className="w-6 h-6 mr-3 fill-current" />}
                {ADVANCE_LABELS[phase]}
              </Button>
              {canCancel && (
                <Button variant="outline" onClick={() => { lastAdvanceAt.current = 0; showFailure(cancelRound()); }}><Undo2 className="w-4 h-4 mr-1" /> 取消本轮</Button>
              )}
            </div>
            {validationReason && <div className="text-sm text-red-500" data-testid="validation-reason">{validationReason}</div>}
            <div className="text-xs text-muted-foreground">按空格键同样可以推进</div>
          </div>
        </CardContent>
      </Card>

      <RoundResultCard round={currentRound} prizeImages={prizeImages} winners={winners} controlledMode={controlledMode} />

      {picker === 'image' && (
        <ImagePoolPicker
          images={prizeImages}
          winners={winners}
          imagePoolIds={round?.imagePoolIds ?? null}
          onCancel={() => setPicker(null)}
          onConfirm={(ids) => { showFailure(setRoundConfig({ imagePoolIds: ids })); setPicker(null); }}
        />
      )}
      {picker === 'name' && currentPrize && (
        <NamePoolPicker
          participants={participants}
          winners={winners}
          prizeId={currentPrize.id}
          namePoolIds={round?.namePoolIds ?? null}
          onCancel={() => setPicker(null)}
          onConfirm={(ids) => { showFailure(setRoundConfig({ namePoolIds: ids })); setPicker(null); }}
        />
      )}
    </div>
  );
}
