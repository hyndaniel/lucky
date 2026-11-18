import { describe, expect, it } from 'vitest';
import type { Prize } from '@/lib/types';
import { decodeTextFile, parseNameList } from '@/lib/name-import';

const prizes: Prize[] = [
  { id: 'p1', name: '一等奖', count: 6 },
  { id: 'p2', name: '二等奖', count: 10 },
  { id: 'p3', name: '三等奖', count: 20 },
];

const plain = (name: string, dept = '') => ({ name, dept, mustWinPrizeId: null, bannedPrizes: [], weight: 1 });

describe('parseNameList', () => {
  it('每行一个姓名', () => {
    const { rows, error } = parseNameList('张三\n李四\r\n王五', false, prizes);
    expect(error).toBeUndefined();
    expect(rows).toEqual([plain('张三'), plain('李四'), plain('王五')]);
  });

  it('姓名,部门 无表头', () => {
    const { rows } = parseNameList('张三,技术部\n李四,市场部', false, prizes);
    expect(rows).toEqual([plain('张三', '技术部'), plain('李四', '市场部')]);
  });

  it('带表头的 CSV，按列名取值（列顺序可变、英文列名不区分大小写）', () => {
    expect(parseNameList('姓名,部门\n张三,技术部', false, prizes).rows).toEqual([plain('张三', '技术部')]);
    expect(parseNameList('部门,姓名\n技术部,张三', false, prizes).rows).toEqual([plain('张三', '技术部')]);
    expect(parseNameList('Dept,Name\n技术部,张三', false, prizes).rows).toEqual([plain('张三', '技术部')]);
    expect(parseNameList('名字\n张三', false, prizes).rows).toEqual([plain('张三')]);
  });

  it('制表符分隔（从 Excel 复制）', () => {
    expect(parseNameList('张三\t技术部\n李四\t市场部', false, prizes).rows)
      .toEqual([plain('张三', '技术部'), plain('李四', '市场部')]);
    expect(parseNameList('姓名\t部门\n张三\t技术部', false, prizes).rows).toEqual([plain('张三', '技术部')]);
  });

  it('跳过空行与空姓名，姓名与部门去首尾空格', () => {
    const { rows } = parseNameList('  张三 , 技术部 \n\n   \n,市场部\n李四,\n', false, prizes);
    expect(rows).toEqual([plain('张三', '技术部'), plain('李四')]);
  });

  it('重名保留为不同的行', () => {
    expect(parseNameList('张三\n张三', false, prizes).rows).toHaveLength(2);
  });

  const controlledCsv = [
    '姓名,部门,必中奖项(奖项名称),禁止奖项,权重(1-10)',
    '张三,技术部,二等奖,"一等奖,三等奖",5',
    '李四,市场部,不存在的奖项,不存在的奖项,abc',
  ].join('\n');

  it('includeControlled 时读取受控字段，奖项名映射为 id', () => {
    const { rows } = parseNameList(controlledCsv, true, prizes);
    expect(rows).toEqual([
      { name: '张三', dept: '技术部', mustWinPrizeId: 'p2', bannedPrizes: ['p1', 'p3'], weight: 5 },
      { name: '李四', dept: '市场部', mustWinPrizeId: null, bannedPrizes: [], weight: 1 },
    ]);
  });

  it('受控字段支持英文列名别名；禁止奖项也可用顿号分隔', () => {
    const csv = 'name,dept,mustWinPrize,bannedPrizes,weight\n张三,技术部,一等奖,二等奖、三等奖,3';
    expect(parseNameList(csv, true, prizes).rows).toEqual([
      { name: '张三', dept: '技术部', mustWinPrizeId: 'p1', bannedPrizes: ['p2', 'p3'], weight: 3 },
    ]);
  });

  it('未开启 includeControlled 时忽略受控字段', () => {
    expect(parseNameList(controlledCsv, false, prizes).rows).toEqual([plain('张三', '技术部'), plain('李四', '市场部')]);
  });

  it('0 行时返回错误', () => {
    for (const text of ['', '   \n\n', '姓名,部门', ',技术部']) {
      expect(parseNameList(text, false, prizes)).toEqual({ rows: [], error: '未识别到任何姓名' });
    }
  });

  it('引号错误时报错且不导入任何行（避免后续名字被静默吞掉）', () => {
    expect(parseNameList('张三,"技术部\n李四,市场部\n王五,财务部', false, prizes))
      .toEqual({ rows: [], error: 'CSV解析错误: Quoted field unterminated' });
    expect(parseNameList('张三,"技术"部\n李四,市场部', false, prizes))
      .toEqual({ rows: [], error: 'CSV解析错误: Trailing quote on quoted field is malformed' });
  });

  it('无法识别分隔符（单列名单）不算错误', () => {
    expect(parseNameList('张三\n李四', false, prizes)).toEqual({ rows: [plain('张三'), plain('李四')] });
  });
});

describe('decodeTextFile', () => {
  const toBuffer = (bytes: number[]) => new Uint8Array(bytes).buffer;
  const utf8 = (text: string) => Array.from(new TextEncoder().encode(text));

  it('UTF-8（无 BOM）', () => {
    expect(decodeTextFile(toBuffer(utf8('张三,技术部')))).toBe('张三,技术部');
  });

  it('UTF-8 带 BOM 时去掉 BOM', () => {
    expect(decodeTextFile(toBuffer([0xef, 0xbb, 0xbf, ...utf8('张三,技术部')]))).toBe('张三,技术部');
  });

  it('UTF-8 解码失败时按 GBK 解码', () => {
    const gbk = [0xd5, 0xc5, 0xc8, 0xfd, 0x2c, 0xbc, 0xbc, 0xca, 0xf5, 0xb2, 0xbf];
    expect(decodeTextFile(toBuffer(gbk))).toBe('张三,技术部');
  });
});
