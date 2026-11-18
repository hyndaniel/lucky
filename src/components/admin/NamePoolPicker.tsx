import { useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getEligibleParticipants } from '@/lib/draw-engine';
import { collectDepts, filterParticipants, NO_DEPT } from '@/lib/name-pool-filter';
import { formatSerial } from '@/lib/serial';
import type { Participant, Winner } from '@/lib/types';
import { PICKER_PAGE_SIZE, PoolPickerShell } from '@/components/admin/PoolPickerShell';

interface Props {
  participants: Participant[];
  winners: Winner[];
  prizeId: string;
  namePoolIds: string[] | null;
  onConfirm: (ids: string[] | null) => void;
  onCancel: () => void;
}

// 名字池选择器：只列合格名字。内定本奖项的人不受选择限制（resolveNamePool 会补入），列表中照常显示
export function NamePoolPicker({ participants, winners, prizeId, namePoolIds, onConfirm, onCancel }: Props) {
  const eligible = useMemo(() => getEligibleParticipants(participants, winners, prizeId), [participants, winners, prizeId]);
  const [auto, setAuto] = useState(namePoolIds === null);
  const [selected, setSelected] = useState<Set<string>>(() => {
    const ids = namePoolIds === null ? eligible.map((p) => p.id) : namePoolIds;
    const eligibleIds = new Set(eligible.map((p) => p.id));
    return new Set(ids.filter((id) => eligibleIds.has(id)));
  });
  const [dept, setDept] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);

  const depts = useMemo(() => collectDepts(eligible), [eligible]);
  const list = useMemo(() => filterParticipants(eligible, dept, keyword), [eligible, dept, keyword]);
  const pageItems = list.slice(page * PICKER_PAGE_SIZE, (page + 1) * PICKER_PAGE_SIZE);

  const change = (next: Set<string>) => { setSelected(next); setAuto(false); };
  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id); else next.delete(id);
    change(next);
  };

  return (
    <PoolPickerShell
      title="选择本轮名字池"
      description="只列出尚未中奖且可参与本奖项的名字。内定本奖项的人不受选择限制。"
      unit="人"
      filter={(
        <Select value={dept} onValueChange={(v) => { setDept(v); setPage(0); }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部部门</SelectItem>
            <SelectItem value={NO_DEPT}>无部门</SelectItem>
            {depts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      keyword={keyword}
      onKeywordChange={(v) => { setKeyword(v); setPage(0); }}
      searchPlaceholder="搜索姓名或编号"
      selectedCount={selected.size}
      listCount={list.length}
      page={page}
      onPageChange={setPage}
      onSelectAll={() => change(new Set([...selected, ...list.map((p) => p.id)]))}
      onClear={() => change(new Set())}
      onRestoreAuto={() => { setAuto(true); setSelected(new Set(eligible.map((p) => p.id))); }}
      onConfirm={() => onConfirm(auto ? null : [...selected])}
      onCancel={onCancel}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
        {pageItems.map((p) => (
          <label key={p.id} className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/40" data-testid="picker-item">
            <Checkbox checked={selected.has(p.id)} onCheckedChange={(v) => toggle(p.id, v === true)} />
            <span className="font-medium truncate">{p.name}</span>
            <span className="font-mono text-xs text-muted-foreground">{formatSerial('N', p.serial)}</span>
            {p.dept && <span className="text-xs text-muted-foreground truncate">{p.dept}</span>}
          </label>
        ))}
      </div>
    </PoolPickerShell>
  );
}
