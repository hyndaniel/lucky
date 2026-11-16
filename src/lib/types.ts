export interface Participant {
  id: string;
  name: string;
  dept: string;
  mustWinPrizeId: string | null; // 内定中特定奖项 ID，null 为无内定
  bannedPrizes: string[];
  weight: number;
}

export interface Winner extends Participant {
  prizeId: string;
  roundId: string;
  wonAt: number;
}

export interface Prize {
  id: string;
  name: string;
  count: number;
  description?: string;  // 奖品描述（如：iPhone 16 Pro）
  image?: string;
}

export interface Settings {
  title: string;
  password: string; // simple local password
  welcomeTitle: string;
  welcomeSubtitle: string;
  prizePageTitle: string;  // 奖项页标题
  logo?: string;  // 公司 logo (base64)
  showDept?: boolean;  // 抽奖及中奖界面是否显示部门选项
  scrollMode?: 'none' | 'scroll' | 'page';  // 大屏显示多中奖者时的展示模式（none 为平铺，scroll 为滚动，page 为翻页）
  winnersPerPage?: number;                 // 翻页模式下每屏显示的最多数
  backgroundImage?: string;                // 大屏背景图（base64）
  fontFamily?: string;                     // 大屏展示字体 CSS font-family
}
