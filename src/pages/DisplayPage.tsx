import { useEffect, useRef } from "react";
import { useLotteryStore } from "@/store/useStore";
import RollingBoard from "@/components/RollingBoard";

export default function DisplayPage() {
  const {
    participants, winners, currentPrizeId, currentRound, settings, setViewMode
  } = useLotteryStore();
  // 旧抽奖页过渡适配：从轮次推导滚动状态与本轮中奖者（只读，不写 store）
  const phase = currentRound?.phase ?? 'idle';
  const isRolling = phase === 'rollingPrizes' || phase === 'rollingNames';
  const roundWinners = winners.filter(winner => winner.roundId === currentRound?.id);

  useEffect(() => {
    setViewMode('welcome');
  }, [setViewMode]);

  // 本地用于状态判断的 ref
  const prevRollingRef = useRef(isRolling);

  // 强制轮询同步 localStorage (解决 file:// 协议下跨窗口不同步问题)
  useEffect(() => {
    const timer = setInterval(() => {
      useLotteryStore.persist.rehydrate();
    }, 500);
    return () => clearInterval(timer);
  }, []);

  // 大屏滚动名单与实际抽奖候选池保持一致：已中奖者不会再次出现。
  const winnerIds = new Set(winners.map(winner => winner.id));
  const candidates = participants.filter(participant => {
    if (winnerIds.has(participant.id)) return false;
    if (!currentPrizeId) return true;

    return !participant.bannedPrizes.includes(currentPrizeId)
      && (!participant.mustWinPrizeId || participant.mustWinPrizeId === currentPrizeId);
  });

  // 监听 Store 变化 (仅保留状态更新，不再播放音效)
  useEffect(() => {
    prevRollingRef.current = isRolling;
  }, [isRolling]);

  // 全局标题同步
  useEffect(() => {
    document.title = settings.title;
  }, [settings.title]);

  return (
    <div className="hermes-display w-full h-screen overflow-hidden bg-white text-[#d95b2b] font-sans">
      <RollingBoard 
        isRolling={isRolling} 
        candidates={candidates} 
        currentWinners={roundWinners} 
      />
    </div>
  );
}
