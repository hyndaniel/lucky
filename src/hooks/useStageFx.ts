import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { playCelebration } from '@/lib/effects';
import { soundEngine } from '@/lib/sound';
import type { EffectSettings, RoundPhase, SoundSettings } from '@/lib/types';

interface StageFxInput {
  stageKey: string;            // `${round.id}:${phase}`，无轮次为 ''
  phase: RoundPhase | null;
  animating: boolean;          // 滚动（含减速）是否仍在进行
  sound: SoundSettings;
  effects: EffectSettings;
  rollAudioRef: RefObject<boolean>; // 本次滚动是否由亲眼看到的转换开启（决定逐帧滴答是否出声）
}

const ROLL_PHASES: (RoundPhase | null)[] = ['rollingPrizes', 'rollingNames'];

function splitStage(key: string): [string, string] {
  const at = key.lastIndexOf(':');
  return at < 0 ? ['', ''] : [key.slice(0, at), key.slice(at + 1)];
}

// 同一轮次内「滚动 → 自然停止」的转换（取消回 idle / prizesRevealed、换轮次都不算）。
// image-only 的奖品滚动直接进入 completed，与名字滚动 → completed 一样要等减速结束后放特效
export function isNaturalStop(prevId: string, prevPhase: string, id: string, nextPhase: string): boolean {
  return prevId !== '' && prevId === id && (
    (prevPhase === 'rollingPrizes' && (nextPhase === 'prizesRevealed' || nextPhase === 'completed'))
    || (prevPhase === 'rollingNames' && nextPhase === 'completed')
  );
}

function stopCelebration(ref: RefObject<(() => void) | null>): void {
  ref.current?.();
  ref.current = null;
}

// 大屏特效与音效（spec §7）：只在亲眼看到的状态转换上触发。首次挂载只记录当前阶段；
// 依赖只用原始值（stageKey / phase / animating），500ms rehydrate 换掉对象引用不会重复触发
export function useStageFx({ stageKey, phase, animating, sound, effects, rollAudioRef }: StageFxInput): void {
  const prevStageRef = useRef<string | null>(null);
  const settleKeyRef = useRef<string | null>(null);   // 等减速结束后定格出声的 stageKey
  const stopFxRef = useRef<(() => void) | null>(null);
  const soundRef = useRef(sound);
  const effectsRef = useRef(effects);

  useLayoutEffect(() => {
    soundRef.current = sound;
    effectsRef.current = effects;
  });

  useEffect(() => {
    const prev = prevStageRef.current;
    if (prev === stageKey) return;
    prevStageRef.current = stageKey;
    const [id, nextPhase] = splitStage(stageKey);
    if (prev === null) {
      // 首次挂载只记录，不放特效。例外：已在滚动阶段且音频已解锁——大屏刚打开时音频必然未解锁，
      // 已解锁说明大屏早已打开、本组件是切到抽奖页才挂载（startPrizeRoll 会同时切页），滚动是亲眼看到开始的
      if (ROLL_PHASES.includes(nextPhase as RoundPhase) && soundEngine.isUnlocked()) {
        soundEngine.startRoll(soundRef.current);
        rollAudioRef.current = true;
      }
      return;
    }

    const [prevId, prevPhase] = splitStage(prev);
    if (isNaturalStop(prevId, prevPhase, id, nextPhase)) {
      settleKeyRef.current = stageKey; // 减速结束再 stopRoll + 特效
      return;
    }
    // 开始新滚动、取消、换轮次 / 换奖项：先停掉残留的滚动音效与特效
    settleKeyRef.current = null;
    rollAudioRef.current = false;
    soundEngine.stopRoll();
    stopCelebration(stopFxRef);
    if (ROLL_PHASES.includes(nextPhase as RoundPhase)) {
      soundEngine.startRoll(soundRef.current);
      rollAudioRef.current = true;
    }
  }, [stageKey, rollAudioRef]);

  // 减速结束：停滚动音效；名字定格必放，奖品定格仅在 onPrizeReveal 时放
  useEffect(() => {
    if (animating || settleKeyRef.current === null || settleKeyRef.current !== stageKey) return;
    settleKeyRef.current = null;
    rollAudioRef.current = false;
    soundEngine.stopRoll();
    const current = effectsRef.current;
    if (phase !== 'completed' && !current.onPrizeReveal) return;
    stopCelebration(stopFxRef); // 先停旧的再放新的：stop 内的 confetti.reset() 会清空共享画布
    soundEngine.playWin(soundRef.current);
    stopFxRef.current = playCelebration(current);
  }, [animating, stageKey, phase, rollAudioRef]);

  // 卸载：停掉所有声音与特效；记录一并清空（开发模式 StrictMode 重新挂载时按首次挂载处理）
  useEffect(() => () => {
    prevStageRef.current = null;
    settleKeyRef.current = null;
    rollAudioRef.current = false;
    soundEngine.stopAll();
    stopCelebration(stopFxRef);
  }, [rollAudioRef]);
}
