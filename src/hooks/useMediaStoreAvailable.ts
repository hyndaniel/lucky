import { useEffect, useState } from 'react';
import { isMediaStoreAvailable } from '@/lib/media-store';

// 本地媒体库（IndexedDB）是否可用；探测完成前为 null。永不抛错
export function useMediaStoreAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void isMediaStoreAvailable().then((ok) => {
      if (!cancelled) setAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return available;
}
