import Papa from 'papaparse';
import type { Participant, Prize } from '@/lib/types';

export type ImportedParticipant = Omit<Participant, 'id' | 'serial'>;

export interface NameListResult {
  rows: ImportedParticipant[];
  error?: string;
}

const NAME_HEADERS = ['姓名', 'name', '名字'];

// 表头列名别名（按优先级），比较时忽略首尾空格与大小写
const COLUMN_ALIASES = {
  name: NAME_HEADERS,
  dept: ['部门', 'dept'],
  mustWin: ['必中奖项(奖项名称)', '必中奖项', 'mustWinPrize'],
  banned: ['禁止奖项', 'bannedPrizes'],
  weight: ['权重(1-10)', 'weight'],
};

type Field = keyof typeof COLUMN_ALIASES;
type ColumnIndex = Record<Field, number>;

// 无表头：第 1 列姓名、第 2 列部门
const NO_HEADER_COLUMNS: ColumnIndex = { name: 0, dept: 1, mustWin: -1, banned: -1, weight: -1 };

const normalize = (cell: unknown) => String(cell ?? '').trim().toLowerCase();

function findColumns(header: string[]): ColumnIndex {
  const cells = header.map(normalize);
  const indexOf = (aliases: string[]) => {
    for (const alias of aliases) {
      const index = cells.indexOf(alias.toLowerCase());
      if (index !== -1) return index;
    }
    return -1;
  };
  return {
    name: indexOf(COLUMN_ALIASES.name),
    dept: indexOf(COLUMN_ALIASES.dept),
    mustWin: indexOf(COLUMN_ALIASES.mustWin),
    banned: indexOf(COLUMN_ALIASES.banned),
    weight: indexOf(COLUMN_ALIASES.weight),
  };
}

function parseWeight(raw: string): number {
  const weight = parseInt(raw, 10);
  return Number.isFinite(weight) && weight > 0 ? weight : 1;
}

// 解析名单文本：自动识别分隔符（逗号/制表符等）；首行含姓名列名时按表头取列
export function parseNameList(text: string, includeControlled: boolean, prizes: Prize[]): NameListResult {
  const { data, errors } = Papa.parse<string[]>(text, { header: false, skipEmptyLines: 'greedy' });
  // 引号错误会把后续多行吞进一个单元格，必须报错；分隔符无法识别（单列名单）可忽略
  const quoteError = errors.find((e) => e.type === 'Quotes');
  if (quoteError) return { rows: [], error: `CSV解析错误: ${quoteError.message}` };
  const isHeader = data.length > 0 && data[0].some((cell) => NAME_HEADERS.includes(normalize(cell)));
  const columns = isHeader ? findColumns(data[0]) : NO_HEADER_COLUMNS;
  const body = isHeader ? data.slice(1) : data;

  const cell = (row: string[], index: number) => (index >= 0 ? String(row[index] ?? '').trim() : '');
  const findPrizeId = (name: string) => (name ? prizes.find((p) => p.name === name)?.id ?? null : null);

  const rows: ImportedParticipant[] = [];
  for (const row of body) {
    const name = cell(row, columns.name);
    if (!name) continue;
    const person: ImportedParticipant = {
      name, dept: cell(row, columns.dept), mustWinPrizeId: null, bannedPrizes: [], weight: 1,
    };
    if (includeControlled) {
      person.mustWinPrizeId = findPrizeId(cell(row, columns.mustWin));
      const bannedIds = cell(row, columns.banned)
        .split(/[,，、]/)
        .map((prizeName) => findPrizeId(prizeName.trim()))
        .filter((id): id is string => id !== null);
      person.bannedPrizes = [...new Set(bannedIds)];
      person.weight = parseWeight(cell(row, columns.weight));
    }
    rows.push(person);
  }

  return rows.length > 0 ? { rows } : { rows, error: '未识别到任何姓名' };
}

// 读取 .csv/.txt：去 BOM，先按 UTF-8（严格）解码，失败再按 GBK（Excel 中文版默认另存编码）
export function decodeTextFile(buf: ArrayBuffer): string {
  let bytes = new Uint8Array(buf);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) bytes = bytes.subarray(3);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('gbk').decode(bytes);
  }
}
