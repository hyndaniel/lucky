import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import Papa from 'papaparse';
import type { Participant, Winner, Prize, Settings } from '../lib/types';
import { drawWinners } from '../lib/lottery-logic';
import bondingLogo from '../assets/bonding-logo.svg';
import hermesLogo from '../assets/hermes-logo.jpg';
import { DEFAULT_PARTICIPANTS } from '../assets/default-participants';

const INITIAL_PRIZES: Prize[] = [
  { id: '1', name: '特等奖', count: 2 },
  { id: '2', name: '一等奖', count: 6 },
  { id: '3', name: '二等奖', count: 10 },
  { id: '4', name: '三等奖', count: 20 },
  { id: '5', name: '四等奖', count: 30 },
  { id: '6', name: '五等奖', count: 40 },
];

const isLegacyDefaultPrizes = (prizes: Prize[]) => (
  prizes.length === 3
  && prizes[0]?.id === '1' && prizes[0]?.name === '三等奖' && prizes[0]?.count === 5
  && prizes[1]?.id === '2' && prizes[1]?.name === '二等奖' && prizes[1]?.count === 3
  && prizes[2]?.id === '3' && prizes[2]?.name === '一等奖' && prizes[2]?.count === 1
);

const cloneDefaultParticipants = (): Participant[] => DEFAULT_PARTICIPANTS.map((participant) => ({
  ...participant,
  bannedPrizes: [...participant.bannedPrizes],
}));

interface LotteryState {
  participants: Participant[];
  winners: Winner[]; // 历史所有中奖记录
  prizes: Prize[];
  
  // 实时状态（用于多屏同步）
  currentPrizeId: string | null;
  isRolling: boolean;
  roundWinners: Participant[]; // 当前轮次已计算出的中奖者（等待展示）
  viewMode: 'welcome' | 'lottery' | 'prize';  // prize: 奖项展示页
  
  settings: Settings;
  
  // Actions
  importParticipants: (csvText: string, includeControlledFields?: boolean) => { success: boolean; count: number; error?: string };
  addPrize: (prize: Omit<Prize, 'id'>) => void;
  updatePrize: (id: string, updates: Partial<Prize>) => void;
  removePrize: (id: string) => void;
  selectPrize: (id: string | null) => void;
  setViewMode: (mode: 'welcome' | 'lottery' | 'prize') => void;
  
  // 控制逻辑
  startRolling: () => void;
  stopRolling: () => void; // 执行抽奖算法，并更新 roundWinners

  resetWinners: () => void;
  fullReset: () => void;
  restoreDefaultPrizes: () => void;
  setSettings: (settings: Partial<Settings>) => void;
  // CRUD
  addParticipant: (p: Omit<Participant, 'id'>) => void;
  updateParticipant: (id: string, updates: Partial<Participant>) => void;
  removeParticipant: (id: string) => void;
}

// 兼容 Unicode 的 Base64 编码与解码函数（用于混淆 LocalStorage 敏感数据，防 F12 窥视）
const obfuscateData = (str: string): string => {
  try {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => {
      return String.fromCharCode(parseInt(p1, 16));
    }));
  } catch (e) {
    return str;
  }
};

const deobfuscateData = (str: string): string => {
  try {
    return decodeURIComponent(Array.prototype.map.call(atob(str), (c) => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
  } catch (e) {
    return str;
  }
};

export const useLotteryStore = create<LotteryState>()(
  persist(
    (set, get) => ({
      participants: cloneDefaultParticipants(),
      winners: [],
      prizes: INITIAL_PRIZES,
      currentPrizeId: '1',
      isRolling: false,
      roundWinners: [],
      viewMode: 'welcome',
      
      settings: {
        title: '2027 年会大屏抽奖',
        password: 'appinn',
        welcomeTitle: '2027 NEW YEAR PARTY',
        welcomeSubtitle: 'BONDING',
        prizePageTitle: '奖项',
        logo: hermesLogo,
        showDept: false,
        scrollMode: 'none',
        winnersPerPage: 24,
        backgroundImage: '',
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      },

      importParticipants: (csvText: string, includeControlledFields: boolean = false) => {
        try {
          const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });
          if (result.errors.length > 0) {
            return { success: false, count: 0, error: 'CSV解析错误: ' + result.errors[0].message };
          }

          const rawData = result.data as any[];
          const currentPrizes = get().prizes;
          const newParticipants: Participant[] = rawData.map((row: any) => {
            // 基础字段（始终读取）
            const participant: Participant = {
              id: nanoid(),
              name: row['姓名'] || row['name'] || 'Unknown',
              dept: row['部门'] || row['dept'] || '',
              mustWinPrizeId: null,
              bannedPrizes: [],
              weight: 1,
            };

            // 受控字段：仅在解锁模式下读取
            if (includeControlledFields) {
              const prizeName = row['必中奖项(奖项名称)'] || row['必中奖项'] || row['mustWinPrize'];
              if (prizeName) {
                const prize = currentPrizes.find(p => p.name === prizeName);
                if (prize) participant.mustWinPrizeId = prize.id;
              }
              // 解析奖项黑名单：逗号分隔的奖项名称
              const bannedPrizeNames = row['禁止奖项'] || row['bannedPrizes'] || '';
              if (bannedPrizeNames) {
                const names = bannedPrizeNames.split(',').map((n: string) => n.trim());
                participant.bannedPrizes = names.map((name: string) => {
                  const prize = currentPrizes.find(p => p.name === name);
                  return prize ? prize.id : '';
                }).filter(id => id);
              }
              participant.weight = parseInt(row['权重(1-10)'] || row['weight'] || '1') || 1;
            }

            return participant;
          }).filter(p => p.name !== 'Unknown');

          set({ participants: newParticipants });
          return { success: true, count: newParticipants.length };
        } catch (e: any) {
          return { success: false, count: 0, error: e.message };
        }
      },

      addPrize: (prize) => set(state => ({
        prizes: [...state.prizes, { id: nanoid(), ...prize }]
      })),

      updatePrize: (id, updates) => set(state => ({
        prizes: state.prizes.map(p => p.id === id ? { ...p, ...updates } : p)
      })),

      removePrize: (id) => set(state => ({
        prizes: state.prizes.filter(p => p.id !== id),
        currentPrizeId: state.currentPrizeId === id ? null : state.currentPrizeId
      })),

      selectPrize: (id) => set({ currentPrizeId: id, roundWinners: [], isRolling: false }),

      setViewMode: (mode) => set({ viewMode: mode }),

      startRolling: () => {
        const state = get();
        const { participants, winners, currentPrizeId, prizes } = state;
        if (!currentPrizeId) {
          set({ isRolling: false, roundWinners: [] });
          return;
        }
        const currentPrize = prizes.find(p => p.id === currentPrizeId);
        if (!currentPrize) {
          set({ isRolling: false, roundWinners: [] });
          return;
        }

        const winnerIds = new Set(winners.map(w => w.id));
        const validPool = participants.filter(p => !winnerIds.has(p.id) && !p.bannedPrizes.includes(currentPrizeId));
        const finalPool = validPool.filter(p => !p.mustWinPrizeId || p.mustWinPrizeId === currentPrizeId);
        if (finalPool.length === 0) {
          set({ isRolling: false, roundWinners: [] });
          return;
        }

        set({ isRolling: true, roundWinners: [], viewMode: 'lottery' });
      },

      stopRolling: () => {
        const state = get();
        const { participants, winners, currentPrizeId, prizes } = state;
        
        if (!currentPrizeId) {
          set({ isRolling: false });
          return;
        }
        const currentPrize = prizes.find(p => p.id === currentPrizeId);
        if (!currentPrize) {
          set({ isRolling: false });
          return;
        }

        // 1. 排除历史已中奖
        const winnerIds = new Set(winners.map(w => w.id));
        // 2. 排除黑名单
        const validPool = participants.filter(p => !winnerIds.has(p.id) && !p.bannedPrizes.includes(currentPrizeId));
        // 3. 找出当前奖项的内定者
        const mustWinCandidates = participants.filter(p => 
            p.mustWinPrizeId === currentPrizeId && !winnerIds.has(p.id) && !p.bannedPrizes.includes(currentPrizeId)
        );

        // 4. 执行算法
        // 确保 validPool 排除掉内定了其他奖项的人
        const finalPool = validPool.filter(p => !p.mustWinPrizeId || p.mustWinPrizeId === currentPrizeId);
        
        const newWinners = drawWinners(finalPool, currentPrize.count, mustWinCandidates);

        set({ 
          isRolling: false, 
          roundWinners: newWinners 
        });
        
        // 自动将本轮结果存入历史记录（防止刷新丢失）
        // 也可以选择在UI上手动确认。为了方便，这里直接存。
        // 但为了防止状态更新冲突，最好分开？ 
        // 考虑到用户体验，停止滚动即视为“结果已出”，应该立即持久化
        
        if (newWinners.length > 0) {
            const roundId = nanoid();
            const timestamp = Date.now();
            const winnersToAdd: Winner[] = newWinners.map(p => ({
                ...p,
                prizeId: currentPrizeId,
                roundId,
                wonAt: timestamp
            }));
            set(state => ({ winners: [...state.winners, ...winnersToAdd] }));
        }
      },

      resetWinners: () => set({ winners: [], roundWinners: [], isRolling: false }),
      
      fullReset: () => set({ participants: cloneDefaultParticipants(), winners: [], prizes: INITIAL_PRIZES, roundWinners: [], isRolling: false, currentPrizeId: '1' }),

      restoreDefaultPrizes: () => set({ participants: cloneDefaultParticipants(), prizes: INITIAL_PRIZES, currentPrizeId: '1', roundWinners: [], isRolling: false }),

      setSettings: (newSettings) => set(state => ({
        settings: { ...state.settings, ...newSettings, welcomeSubtitle: 'BONDING' },
      })),

      addParticipant: (p) => set(state => ({
        participants: [...state.participants, { ...p, id: nanoid() }]
      })),

      updateParticipant: (id, updates) => set(state => ({
        participants: state.participants.map(p => p.id === id ? { ...p, ...updates } : p)
      })),

      removeParticipant: (id) => set(state => ({
        participants: state.participants.filter(p => p.id !== id)
      }))
    }),
    {
      name: 'lucky-draw-storage',
      version: 7,
      migrate: (persistedState, version) => {
        const state = persistedState as LotteryState;
        // 将旧演示奖项或空奖项恢复为当前默认奖项，保留已有真实配置。
        const hasNoDrawData = state.participants.length === 0 && state.winners.length === 0;
        const persistedLogo = state.settings?.logo;
        const fixedSettings = {
          ...state.settings,
          welcomeSubtitle: 'BONDING',
          logo: !persistedLogo || persistedLogo === bondingLogo ? hermesLogo : persistedLogo,
        };
        const hasBundledParticipants = state.participants.length === DEFAULT_PARTICIPANTS.length
          && state.participants.every((participant) => participant.id.startsWith('default-'));
        if (hasNoDrawData && (isLegacyDefaultPrizes(state.prizes) || state.prizes.length === 0)) {
          return { ...state, participants: cloneDefaultParticipants(), prizes: INITIAL_PRIZES, settings: fixedSettings };
        }
        if (hasNoDrawData && (state.participants.length === 0 || hasBundledParticipants)) {
          return { ...state, participants: cloneDefaultParticipants(), settings: fixedSettings };
        }
        return { ...state, settings: fixedSettings };
      },
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          const val = localStorage.getItem(name);
          if (!val) return null;
          try {
            // 平滑兼容历史明文 JSON 结构，避免升级丢失用户已有配置
            const trimmed = val.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              return val;
            }
            return deobfuscateData(val);
          } catch (e) {
            return val;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, obfuscateData(value));
          } catch (e) {
            localStorage.setItem(name, value);
          }
        },
        removeItem: (name) => localStorage.removeItem(name),
      })),
    }
  )
);
