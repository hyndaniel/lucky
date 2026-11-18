import { useEffect } from "react";
import { useLotteryStore } from "@/store/useStore";
import RollingBoard from "@/components/RollingBoard";
import AudioUnlockHint from "@/components/display/AudioUnlockHint";

export default function DisplayPage() {
  const title = useLotteryStore((state) => state.settings.title);
  const setViewMode = useLotteryStore((state) => state.setViewMode);

  // 仅在没有进行中的轮次时回到欢迎页；抽奖中途刷新大屏要继续显示抽奖画面
  useEffect(() => {
    const phase = useLotteryStore.getState().currentRound?.phase;
    if (!phase || phase === 'idle' || phase === 'completed') setViewMode('welcome');
  }, [setViewMode]);

  // 强制轮询同步 localStorage (解决 file:// 协议下跨窗口不同步问题)
  useEffect(() => {
    const timer = setInterval(() => {
      useLotteryStore.persist.rehydrate();
    }, 500);
    return () => clearInterval(timer);
  }, []);

  // 全局标题同步
  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div className="hermes-display w-full h-screen overflow-hidden bg-white text-[#d95b2b] font-sans">
      <RollingBoard />
      <AudioUnlockHint />
    </div>
  );
}
