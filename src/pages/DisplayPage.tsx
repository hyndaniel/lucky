import { useEffect } from "react";
import { useLotteryStore } from "@/store/useStore";
import RollingBoard from "@/components/RollingBoard";
import AudioUnlockHint from "@/components/display/AudioUnlockHint";

export default function DisplayPage() {
  const title = useLotteryStore((state) => state.settings.title);
  const setViewMode = useLotteryStore((state) => state.setViewMode);

  useEffect(() => {
    setViewMode('welcome');
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
