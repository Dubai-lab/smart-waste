import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

/**
 * Invalidate React Query keys whenever rows change in the given tables.
 * Reconnects automatically after errors; removes the channel on unmount / route change.
 */
export function useRealtimeInvalidate(tables: string[], keys: unknown[][], onChange?: (table: string, payload: unknown) => void) {
  const qc = useQueryClient();
  const cb = useRef(onChange);
  cb.current = onChange;
  const tableKey = tables.join(',');
  const keysKey = JSON.stringify(keys);

  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | undefined;
    let channel = subscribe();

    function subscribe() {
      const ch = supabase.channel(`rt-${tableKey}-${Math.random().toString(36).slice(2)}`);
      for (const table of tables) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
          for (const k of keys) void qc.invalidateQueries({ queryKey: k });
          cb.current?.(table, payload);
        });
      }
      ch.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(retry);
          retry = setTimeout(() => {
            void supabase.removeChannel(channel);
            channel = subscribe();
          }, 3000);
        }
      });
      return ch;
    }

    return () => {
      clearTimeout(retry);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey, keysKey, qc]);
}
