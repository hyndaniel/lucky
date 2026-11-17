import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLotteryStore } from "@/store/useStore";
import hermesLogo from "@/assets/hermes-logo.jpg";
import { Maximize2, Settings } from "lucide-react";
import DrawStage from "@/components/display/DrawStage";

export default function RollingBoard() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { prizes, settings, viewMode } = useLotteryStore();
  // 未上传背景图时使用主题的暖白背景；上传后直接使用用户配置的图片。
  const backgroundImage = settings.backgroundImage || '';

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    handleFullscreenChange();
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  return (
    <div
      className="hermes-display-board relative w-full h-full flex flex-col items-center justify-center overflow-hidden"
      style={{ fontFamily: settings.fontFamily || undefined }}
    >
      {/* Background with overlay */}
      <div 
        className="hermes-background absolute inset-0 bg-cover bg-center z-0"
        style={backgroundImage ? { backgroundImage: `url("${backgroundImage}")` } : undefined}
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-black via-zinc-950/98 to-black" />
        
        {/* 2027 Neo-Luxury Ambient Aura Lighting */}
        <div className="absolute top-[10%] left-[5%] w-[60vw] h-[60vw] rounded-full bg-yellow-500/5 blur-[150px] animate-[pulse_12s_infinite_alternate] pointer-events-none" />
        <div className="absolute bottom-[5%] right-[5%] w-[65vw] h-[65vw] rounded-full bg-amber-500/5 blur-[160px] animate-[pulse_15s_infinite_alternate] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40vw] h-[40vw] rounded-full bg-red-950/15 blur-[120px] animate-[pulse_9s_infinite] pointer-events-none" />

        {/* Ambient Gold Particle Flow (CSS-only ultra-smooth sparkles) */}
        <div className="absolute inset-0 overflow-hidden opacity-40 pointer-events-none z-0">
          <div className="absolute w-2 h-2 rounded-full bg-yellow-500/40 blur-[1px] animate-[sparkle_10s_infinite] top-[90%] left-[15%]" />
          <div className="absolute w-3.5 h-3.5 rounded-full bg-amber-400/25 blur-[2.5px] animate-[sparkle_15s_infinite] top-[90%] left-[75%]" style={{ animationDelay: '2.5s' }} />
          <div className="absolute w-1.5 h-1.5 rounded-full bg-yellow-300/50 blur-[1px] animate-[sparkle_8s_infinite] top-[90%] left-[35%]" style={{ animationDelay: '4.5s' }} />
          <div className="absolute w-2.5 h-2.5 rounded-full bg-yellow-500/35 blur-[1.5px] animate-[sparkle_12s_infinite] top-[90%] left-[55%]" style={{ animationDelay: '1.2s' }} />
          <div className="absolute w-2 h-2 rounded-full bg-amber-500/45 blur-[1px] animate-[sparkle_18s_infinite] top-[90%] left-[85%]" style={{ animationDelay: '6s' }} />
          <div className="absolute w-3 h-3 rounded-full bg-yellow-400/30 blur-[2px] animate-[sparkle_14s_infinite] top-[90%] left-[25%]" style={{ animationDelay: '8s' }} />
        </div>
      </div>

      {/* Main Content */}
      <div className="z-10 w-full h-full flex items-center justify-center">
        <AnimatePresence mode="wait">
          
          {/* 模式 1: 欢迎页 */}
          {viewMode === 'welcome' && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.04 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center justify-center text-center p-8 relative"
            >
              {/* Golden circular backdrop glow */}
              <div className="absolute w-[500px] h-[500px] bg-gradient-to-tr from-yellow-500/10 to-transparent blur-[120px] rounded-full pointer-events-none -z-10" />

              {(settings.logo || hermesLogo) && (
                <motion.div
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 50 }}
                  className="relative mb-10 group"
                >
                  <div className="absolute inset-0 bg-yellow-500/15 blur-2xl rounded-full group-hover:bg-yellow-500/25 transition-all duration-700 pointer-events-none" />
                  <img
                    src={settings.logo || hermesLogo}
                    alt="Logo"
                    className="max-h-36 md:max-h-48 w-auto relative drop-shadow-[0_4px_30px_rgba(255,215,0,0.25)] transition-transform duration-700 group-hover:scale-105"
                  />
                </motion.div>
              )}
              
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="relative"
              >
                <h2 className="text-yellow-500/90 text-2xl md:text-4xl font-cinzel tracking-[0.4em] uppercase mb-4 drop-shadow-[0_0_15px_rgba(234,179,8,0.25)] font-bold">
                  BONDING
                </h2>
                
                {/* Horizontal Divider Line */}
                <div className="w-32 h-[1px] bg-gradient-to-r from-transparent via-yellow-500/60 to-transparent mx-auto my-6" />

                <h1 className="text-6xl md:text-9xl font-black text-white font-cinzel tracking-wider drop-shadow-[0_0_40px_rgba(255,215,0,0.5)] leading-none select-none bg-gradient-to-b from-white via-white to-amber-200 bg-clip-text text-transparent py-2">
                  {settings.welcomeTitle || "ANNUAL PARTY"}
                </h1>
              </motion.div>
            </motion.div>
          )}

          {/* 模式 2: 奖项展示页 */}
          {viewMode === 'prize' && (
            <motion.div
              key="prize"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="w-full max-w-7xl px-8 flex flex-col items-center"
            >
              <motion.h2
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-yellow-500 text-3xl md:text-5xl font-cinzel tracking-[0.3em] uppercase mb-12 drop-shadow-[0_0_20px_rgba(255,215,0,0.5)]"
              >
                {settings.prizePageTitle || "今日奖项"}
              </motion.h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full">
                {prizes.map((prize, idx) => (
                  <motion.div
                    key={prize.id}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + idx * 0.1, type: "spring" }}
                    className="relative group"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-yellow-600/30 to-red-900/40 blur-2xl rounded-3xl group-hover:blur-3xl transition-all" />
                    <div className="relative bg-black/60 backdrop-blur-md border-2 border-yellow-500/40 p-8 rounded-3xl flex flex-col items-center justify-center text-center hover:border-yellow-500/80 transition-all shadow-[0_0_40px_rgba(255,215,0,0.15)] min-h-[280px]">
                      {prize.image && (
                        <img
                          src={prize.image}
                          alt={prize.name}
                          className="mb-5 h-28 w-full rounded-2xl object-contain bg-black/20"
                        />
                      )}
                      <div className="text-4xl md:text-5xl font-bold text-white font-cinzel mb-3 drop-shadow-lg">{prize.name}</div>
                      <div className="text-yellow-400 text-2xl font-bold mb-4">× {prize.count} 名</div>
                      {prize.description && (
                        <div className="mt-4 pt-4 border-t-2 border-yellow-500/30 w-full">
                          <div className="text-yellow-100 text-xl md:text-2xl font-medium drop-shadow-md">
                            {prize.description}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* 模式 3: 抽奖页（两阶段：奖品滚动 → 名字滚动） */}
          {viewMode === 'lottery' && (
            <motion.div
              key="lottery"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full"
            >
              <DrawStage />
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {!isFullscreen && (
        <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-3">
          <button
            type="button"
            title="全屏显示"
            onClick={() => {
              if (document.fullscreenElement) {
                document.exitFullscreen?.();
                return;
              }
              document.documentElement.requestFullscreen?.();
            }}
            className="h-10 w-10 rounded-full bg-white/10 text-white border border-white/20 backdrop-blur hover:bg-white/20 hover:border-white/40 flex items-center justify-center"
          >
            <Maximize2 className="h-5 w-5" />
          </button>
          <a
            href="#/admin"
            title="进入后台管理"
            className="h-10 w-10 rounded-full bg-white/10 text-white border border-white/20 backdrop-blur hover:bg-white/20 hover:border-white/40 flex items-center justify-center"
          >
            <Settings className="h-5 w-5" />
          </a>
        </div>
      )}
    </div>
  );
}
