import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMediaUrls } from '@/hooks/useMediaUrls';
import { formatSerial } from '@/lib/serial';
import type { CurrentRound, PrizeImage, Winner } from '@/lib/types';

interface Props {
  round: CurrentRound | null;
  prizeImages: PrizeImage[];
  winners: Winner[];
  controlledMode: boolean;
}

// 「本轮结果」：按模块序号列出图片，名字定格后追加名字与编号
export function RoundResultCard({ round, prizeImages, winners, controlledMode }: Props) {
  const imageIds = round?.resultImageIds ?? [];
  const urls = useMediaUrls(imageIds);
  const roundWinners = round ? winners.filter((w) => w.roundId === round.id) : [];
  const imageById = new Map(prizeImages.map((img) => [img.id, img]));

  return (
    <Card className="h-full flex flex-col">
      <CardHeader><CardTitle>本轮结果</CardTitle></CardHeader>
      <CardContent className="flex-1 overflow-y-auto max-h-[480px]">
        {imageIds.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">等待开奖...</div>
        ) : (
          <ol className="space-y-2">
            {imageIds.map((imageId, i) => {
              const image = imageById.get(imageId);
              const winner = roundWinners[i];
              // 图片已被删除时回退到中奖记录里的快照
              const serial = image?.serial ?? winner?.imageSerial;
              const label = image?.label ?? winner?.imageLabel ?? '';
              return (
                <li key={imageId} className="flex items-center gap-3 rounded-md border p-2" data-testid="result-item">
                  <span className="w-5 text-xs text-muted-foreground text-right">{i + 1}</span>
                  <div className="w-14 h-14 shrink-0 rounded bg-muted flex items-center justify-center overflow-hidden">
                    {urls[imageId] ? (
                      <img src={urls[imageId]} alt={label} className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-muted-foreground">?</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex items-center gap-2">
                      {serial !== undefined && <span className="font-mono text-xs text-muted-foreground">{formatSerial('IMG', serial)}</span>}
                      <span className="truncate">{label}</span>
                    </div>
                    {winner && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-bold">{winner.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{formatSerial('N', winner.serial)}</span>
                        {winner.dept && <span className="text-xs text-muted-foreground truncate">{winner.dept}</span>}
                        {controlledMode && winner.mustWinPrizeId && <Badge variant="secondary" className="scale-75">内定</Badge>}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
