import { useEffect, useMemo, useRef, useState } from 'react';
import { useLotteryStore } from '@/store/useStore';
import { getRemainingSlots, resolveImagePool, resolveNamePool, sampleDistinct } from '@/lib/draw-engine';
import { computeModuleLayout, DEPT_RATIO } from '@/lib/grid-layout';
import { fitFontSize } from '@/lib/fit-text';
import { createTextMeasurer } from '@/lib/text-measure';
import { DEFAULT_MODULE_COUNT } from '@/lib/defaults';
import { soundEngine } from '@/lib/sound';
import type { RoundPhase } from '@/lib/types';
import { preloadImages, useMediaUrls } from '@/hooks/useMediaUrls';
import { useRollingTicker } from '@/hooks/useRollingTicker';
import { useStageFx } from '@/hooks/useStageFx';
import PrizeModule, { type PrizeModuleState } from '@/components/display/PrizeModule';

type RollKind = 'image' | 'name';

const PHASE_TEXT: Record<RoundPhase, string> = {
  idle: '准备抽取奖品',
  rollingPrizes: '奖品抽取中…',
  prizesRevealed: '本轮奖品已揭晓',
  rollingNames: '幸运儿抽取中…',
  completed: '恭喜以下获奖者',
};
const EXHAUSTED_TEXT = '该奖项已全部抽完';
const NO_PRIZE_TEXT = '请在后台选择奖项';

const GRID_GAP = 20;
// 颜色一律 inline（index.css 在 .hermes-display-board 下用 !important 覆盖了若干 Tailwind 颜色类）
const COLOR_ACCENT = '#d86632';
const COLOR_PRIMARY = '#b94d24';
const COLOR_MUTED = '#a66b52';

interface ModuleView {
  state: PrizeModuleState;
  rollingPart: RollKind;
  imageId: string | null;
  name: string | null;
  label: string | null;
  dept: string | null;
}

// 池不足 count 时循环补足；池为空返回 []（模块显示空白 "?"）
function cycle<T>(items: readonly T[], count: number): T[] {
  return items.length === 0 ? [] : Array.from({ length: count }, (_, i) => items[i % items.length]);
}

// 大屏抽奖页：标题区 + 模块网格。只读 store，从不写入（后台是唯一写入方）
export default function DrawStage() {
  const round = useLotteryStore((s) => s.currentRound);
  const currentPrizeId = useLotteryStore((s) => s.currentPrizeId);
  const prizes = useLotteryStore((s) => s.prizes);
  const prizeImages = useLotteryStore((s) => s.prizeImages);
  const participants = useLotteryStore((s) => s.participants);
  const winners = useLotteryStore((s) => s.winners);
  const settings = useLotteryStore((s) => s.settings);
  const style = settings.moduleStyle;
  const showDept = settings.showDept === true;

  const roundId = round?.id ?? '';
  const phase = round?.phase ?? null;
  const prize = prizes.find((p) => p.id === currentPrizeId);
  const remaining = prize ? getRemainingSlots(prize, winners) : 0;
  // 名额已抽完且尚未开始本轮：只显示标题区
  const exhausted = Boolean(prize) && remaining === 0 && (phase === null || phase === 'idle');
  const moduleCount = !prize || exhausted ? 0 : round ? round.moduleCount : Math.min(DEFAULT_MODULE_COUNT, remaining);

  // 滚动用的池按「本轮之前」的中奖记录计算：名字定格后的减速期间仍用同一批池
  const { imagePool, namePool, roundWinners } = useMemo(() => {
    const prior = winners.filter((w) => w.roundId !== roundId);
    return {
      imagePool: round ? resolveImagePool(prizeImages, prior, round.imagePoolIds) : [],
      namePool: round && prize ? resolveNamePool(participants, prior, prize.id, round.namePoolIds) : [],
      roundWinners: winners.filter((w) => w.roundId === roundId),
    };
  }, [winners, roundId, round, prize, prizeImages, participants]);
  const imageById = useMemo(() => new Map(prizeImages.map((img) => [img.id, img])), [prizeImages]);
  const resultImageIds = round?.resultImageIds ?? [];

  // 本轮图片池 + 结果图片的 URL（在长生命周期的这一层加载，模块挂载时不闪空）
  const mediaKeys = [...new Set([...imagePool.map((img) => img.id), ...resultImageIds])];
  const mediaUrls = useMediaUrls(mediaKeys);

  // 正在滚动的部分；停止后若是本轮同一次滚动的自然结束，则减速期间继续滚动
  const liveKind: RollKind | null = phase === 'rollingPrizes' ? 'image' : phase === 'rollingNames' ? 'name' : null;
  const [lastRollKey, setLastRollKey] = useState<string | null>(null);
  const liveRollKey = liveKind ? `${roundId}:${liveKind}` : null;
  if (liveRollKey !== null && liveRollKey !== lastRollKey) setLastRollKey(liveRollKey);
  const settlingKind: RollKind | null =
    phase === 'prizesRevealed' && lastRollKey === `${roundId}:image` ? 'image'
      : phase === 'completed' && lastRollKey === `${roundId}:name` ? 'name'
        : null;
  const tickerKind = liveKind ?? settlingKind;
  const rollKey = tickerKind ? `${roundId}:${tickerKind}` : null;
  const rollItems = tickerKind === 'image' ? imagePool.map((img) => img.id)
    : tickerKind === 'name' ? namePool.map((p) => p.name)
      : [];

  // 滚动帧只在 rAF 回调里随机生成，渲染期间不调用随机数
  const [frame, setFrame] = useState<{ key: string; items: string[] }>({ key: '', items: [] });
  const rollAudioRef = useRef(false);
  const { animating } = useRollingTicker(liveKind !== null, () => {
    if (!rollKey) return; // 被取消的滚动仍在减速：不再换帧、不出声
    setFrame({ key: rollKey, items: sampleDistinct(rollItems, moduleCount) });
    if (rollAudioRef.current) soundEngine.tick(settings.sound);
  });
  useStageFx({
    stageKey: round ? `${round.id}:${round.phase}` : '',
    phase,
    animating,
    sound: settings.sound,
    effects: settings.effects,
    rollAudioRef,
  });

  const rollingKind = liveKind ?? (animating ? settlingKind : null);
  const rollingItems = rollingKind
    ? frame.key === rollKey ? frame.items : cycle(rollItems, moduleCount)
    : [];

  // rollingPrizes 开始时预解码本轮图片，避免滚动中闪白
  const preloadKey = phase === 'rollingPrizes'
    ? imagePool.map((img) => mediaUrls[img.id]).filter(Boolean).join('|')
    : '';
  useEffect(() => {
    if (preloadKey) void preloadImages(preloadKey.split('|'));
  }, [preloadKey]);

  // 量网格容器尺寸（ResizeObserver 首次 observe 即回调）
  const gridRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const layout = computeModuleLayout({
    containerWidth: size.width,
    containerHeight: size.height,
    count: moduleCount,
    columns: style.columns,
    gap: GRID_GAP,
    scale: Math.min(2, Math.max(0.4, style.moduleScale / 100)) || 1, // 0.4..2；>1 可放大，受格子与间距限制
    nameFontSize: style.nameStyle.fontSize,
    labelFontSize: style.labelStyle.fontSize,
    showName: style.showName,
    showLabel: style.showImageLabel,
    showDept: showDept && style.showName,
  });

  const viewFor = (i: number): ModuleView => {
    if (!round || phase === 'idle') {
      return { state: 'blank', rollingPart: 'image', imageId: null, name: null, label: null, dept: null };
    }
    if (rollingKind === 'image') {
      const imageId = rollingItems[i] ?? null;
      return { state: 'rolling', rollingPart: 'image', imageId, name: null, label: imageId ? imageById.get(imageId)?.label ?? null : null, dept: null };
    }
    // 奖品已定格：图片固定为本轮结果
    const imageId = resultImageIds[i] ?? null;
    const winner = phase === 'completed' ? roundWinners[i] : undefined;
    const label = (imageId ? imageById.get(imageId)?.label : undefined) ?? winner?.imageLabel ?? null;
    if (rollingKind === 'name') {
      return { state: 'rolling', rollingPart: 'name', imageId, name: rollingItems[i] ?? null, label, dept: null };
    }
    return { state: 'revealed', rollingPart: 'name', imageId, name: winner?.name ?? null, label, dept: winner?.dept ?? null };
  };

  // 统一字号：全体模块当前显示的文字合并测算一次，所有模块共用（避免各模块各自缩小导致字号参差）。
  // 无 canvas（jsdom 等）时 createTextMeasurer 返回 null，退回布局字号。
  const views = Array.from({ length: moduleCount }, (_, i) => viewFor(i));
  const textWidth = Math.max(0, layout.cardWidth - 2 * layout.padding);
  const fitShared = (texts: (string | null)[], base: number, family: string, weight: number) => {
    const measure = createTextMeasurer(family, weight);
    if (!measure || base <= 0) return base;
    return fitFontSize(texts.filter((t): t is string => !!t), textWidth, base, measure);
  };
  const nameFontSize = fitShared(
    views.map((v) => v.name), layout.nameFontSize, style.nameStyle.fontFamily || settings.fontFamily || '', 700,
  );
  const labelFontSize = fitShared(
    views.map((v) => v.label), layout.labelFontSize, style.labelStyle.fontFamily || settings.fontFamily || '', 500,
  );
  // 部门字号以统一后的名字字号为基准（约 0.7×），再按部门文字统一缩小
  const deptFontSize = showDept
    ? fitShared(views.map((v) => v.dept), Math.floor(nameFontSize * DEPT_RATIO), style.labelStyle.fontFamily || settings.fontFamily || '', 500)
    : 0;

  const rows: number[][] = [];
  for (let i = 0; i < moduleCount; i += layout.columns) {
    rows.push(Array.from({ length: Math.min(layout.columns, moduleCount - i) }, (_, k) => i + k));
  }

  // 阶段提示跟随画面：减速期间仍显示「抽取中」
  const shownPhase: RoundPhase = rollingKind === 'image' ? 'rollingPrizes'
    : rollingKind === 'name' ? 'rollingNames'
      : phase ?? 'idle';
  const statusText = !prize ? null : exhausted ? EXHAUSTED_TEXT : PHASE_TEXT[shownPhase];
  const subtitle = round && prize && !exhausted ? `第 ${round.roundNo} 轮 · 本轮 ${round.moduleCount} 份` : null;

  return (
    // 底部与两侧至少留 72px：避开左下音频提示与右下全屏 / 后台按钮（距边 24px）
    <div
      style={{
        width: '100%', height: '100%', boxSizing: 'border-box', padding: '4vh max(3vw, 72px) max(4vh, 72px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2.5vh',
      }}
    >
      <header style={{ flexShrink: 0, textAlign: 'center', maxWidth: '100%' }}>
        {settings.title && (
          <div style={{ color: COLOR_ACCENT, fontSize: 'clamp(16px, 2.2vh, 26px)', fontWeight: 600, letterSpacing: '0.3em' }}>
            {settings.title}
          </div>
        )}
        <h1 style={{ margin: '0.15em 0 0', color: COLOR_PRIMARY, fontSize: 'clamp(40px, 7vh, 88px)', fontWeight: 900, lineHeight: 1.15 }}>
          {prize ? prize.name : NO_PRIZE_TEXT}
        </h1>
        {subtitle && (
          <div style={{ marginTop: '0.4em', color: COLOR_MUTED, fontSize: 'clamp(16px, 2.4vh, 28px)', letterSpacing: '0.08em' }}>
            {subtitle}
          </div>
        )}
        {statusText && (
          <div
            style={{
              display: 'inline-block', marginTop: '0.8em', padding: '0.3em 1.2em', borderRadius: 999,
              color: COLOR_ACCENT, background: 'rgba(216, 102, 50, 0.08)', boxShadow: '0 0 0 1px rgba(216, 102, 50, 0.25)',
              fontSize: 'clamp(16px, 2.6vh, 30px)', fontWeight: 600, letterSpacing: '0.1em',
            }}
          >
            {statusText}
          </div>
        )}
      </header>

      <div ref={gridRef} style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%' }}>
        {size.width > 0 && size.height > 0 && moduleCount > 0 && (
          // 绝对定位：内容不反过来影响测得的容器尺寸
          <div
            style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: GRID_GAP,
            }}
          >
            {rows.map((row, r) => (
              // 每排单独居中，最后一排不足时也居中
              <div key={r} style={{ display: 'flex', justifyContent: 'center', gap: GRID_GAP }}>
                {row.map((i) => {
                  const view = views[i];
                  return (
                    <div
                      key={i}
                      style={{
                        width: layout.cellWidth, height: layout.cellHeight,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <PrizeModule
                        layout={layout}
                        style={style}
                        state={view.state}
                        rollingPart={view.rollingPart}
                        imageUrl={view.imageId ? mediaUrls[view.imageId] ?? null : null}
                        label={view.label}
                        name={view.name}
                        fontFamily={settings.fontFamily}
                        dept={view.dept}
                        showDept={showDept}
                        nameFontSize={nameFontSize}
                        labelFontSize={labelFontSize}
                        deptFontSize={deptFontSize}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
