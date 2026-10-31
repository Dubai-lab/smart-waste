import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

/** Invalidate queries when rows change; reconnects after errors and cleans up on unmount. */
export function useRealtimeInvalidate(tables: { table: string; filter?: string }[], keys: unknown[][]) {
  const qc = useQueryClient();
  const sig = JSON.stringify(tables) + JSON.stringify(keys);
  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ch = make();
    function make() {
      const c = supabase.channel(`m-${Math.random().toString(36).slice(2)}`);
      for (const t of tables) {
        c.on('postgres_changes', { event: '*', schema: 'public', table: t.table, ...(t.filter ? { filter: t.filter } : {}) },
          () => keys.forEach((k) => qc.invalidateQueries({ queryKey: k })));
      }
      c.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(retry);
          retry = setTimeout(() => { void supabase.removeChannel(ch); ch = make(); }, 3000);
        }
      });
      return c;
    }
    return () => { clearTimeout(retry); void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, qc]);
}
