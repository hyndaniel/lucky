import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// 滚动节奏（沿用原 RollingBoard）：1s 内从 2 次/秒 ease-out 加速到 12 次/秒，停止后 1.5s ease-out 减速到 0
export const ROLL_MIN_SPEED = 2;
export const ROLL_MAX_SPEED = 12;
export const ROLL_ACCEL_MS = 1000;
export const ROLL_DECEL_MS = 1500;
// 减速末段速度趋近 0：换帧间隔最长按 0.5 次/秒计算
const SLOWEST_TICK_SPEED = 0.5;

export type RollPhase = 'accelerating' | 'decelerating';

// 某阶段经过 elapsedMs 时的换帧速度（次/秒）；加速满 1s 后保持最大速度，减速满 1.5s 后为 0
export function getRollSpeed(phase: RollPhase, elapsedMs: number, decelStartSpeed: number): number {
  const elapsed = Math.max(0, elapsedMs);
  if (phase === 'accelerating') {
    if (elapsed >= ROLL_ACCEL_MS) return ROLL_MAX_SPEED;
    const progress = elapsed / ROLL_ACCEL_MS;
    return ROLL_MIN_SPEED + (ROLL_MAX_SPEED - ROLL_MIN_SPEED) * (1 - (1 - progress) ** 2);
  }
  if (elapsed >= ROLL_DECEL_MS) return 0;
  const progress = elapsed / ROLL_DECEL_MS;
  return decelStartSpeed * (1 - progress) ** 2;
}

// active 为 true 时加速滚动、按速度调用 onTick（首帧立即调用一次）；变为 false 后减速，
// 减速结束 animating 才变为 false。减速中再次 active 则重新加速。onTick 总是读最新的那个。
export function useRollingTicker(active: boolean, onTick: () => void): { animating: boolean } {
  const onTickRef = useRef(onTick);
  const activeRef = useRef(active);
  // 渲染期间根据 active 的变化调整「停止后仍在减速」标记（React 推荐的「依据上次渲染调整状态」写法），
  // 这样停止的那次渲染里 animating 仍为 true，不会闪出一帧定格画面
  const [prevActive, setPrevActive] = useState(active);
  const [decelerating, setDecelerating] = useState(false);
  if (active !== prevActive) {
    setPrevActive(active);
    setDecelerating(!active);
  }
  const animating = active || decelerating;

  // 提交时同步，保证下一帧 rAF 读到的是已提交的值
  useLayoutEffect(() => {
    onTickRef.current = onTick;
    activeRef.current = active;
  });

  useEffect(() => {
    if (!animating) return;
    let frameId = 0;
    let phase: RollPhase | 'done' = 'accelerating';
    let phaseStart = -1;
    let speed = ROLL_MIN_SPEED;
    let decelStartSpeed = ROLL_MAX_SPEED;
    let lastTick = -Infinity;

    const loop = (now: number) => {
      frameId = requestAnimationFrame(loop);
      if (phaseStart < 0) phaseStart = now;
      if (activeRef.current && phase !== 'accelerating') {
        phase = 'accelerating';
        phaseStart = now;
      } else if (!activeRef.current && phase === 'accelerating') {
        phase = 'decelerating';
        phaseStart = now;
        decelStartSpeed = speed;
      }
      // 减速结束后只空转，等 animating 变 false 时由清理函数取消；
      // 若同一次渲染里又变回 active，空转的循环会在下一帧重新加速
      if (phase === 'done') return;
      const elapsed = now - phaseStart;
      if (phase === 'decelerating' && elapsed >= ROLL_DECEL_MS) {
        phase = 'done';
        setDecelerating(false);
        return;
      }
      speed = getRollSpeed(phase, elapsed, decelStartSpeed);
      if (now - lastTick >= 1000 / Math.max(speed, SLOWEST_TICK_SPEED)) {
        lastTick = now;
        onTickRef.current();
      }
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [animating]);

  return { animating };
}
