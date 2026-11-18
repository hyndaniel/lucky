import { useEffect, useState } from 'react';
import { useLotteryStore } from '@/store/useStore';
import { soundEngine } from '@/lib/sound';

const HINT_TEXT = '🔈 点击任意位置启用音效';

// 音频解锁提示（R9）：音效未全为 none 且尚未解锁时显示在左下角；点击页面任意处解锁后消失
export default function AudioUnlockHint() {
  const sound = useLotteryStore((s) => s.settings.sound);
  const [unlocked, setUnlocked] = useState(() => soundEngine.isUnlocked());

  // window 级一次性监听：pointerdown 属于浏览器认可的用户手势，可在其中 resume AudioContext
  useEffect(() => {
    if (unlocked) return;
    let cancelled = false;
    const handle = () => {
      void soundEngine.unlock().then(() => {
        if (cancelled) return;
        if (soundEngine.isUnlocked()) setUnlocked(true);
        else window.addEventListener('pointerdown', handle, { once: true }); // 被拒绝时下次点击再试
      });
    };
    window.addEventListener('pointerdown', handle, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', handle);
    };
  }, [unlocked]);

  const silent = sound.roll === 'none' && sound.win === 'none';
  if (unlocked || silent) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed', left: 24, bottom: 24, zIndex: 30, pointerEvents: 'none',
        padding: '8px 16px', borderRadius: 999, fontSize: 15, lineHeight: '22px',
        color: '#b94d24', background: 'rgba(255, 255, 255, 0.92)',
        boxShadow: '0 0 0 1px rgba(216, 102, 50, 0.28), 0 6px 18px rgba(150, 61, 25, 0.12)',
      }}
    >
      {HINT_TEXT}
    </div>
  );
}
