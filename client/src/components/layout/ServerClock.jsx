import { useEffect, useState } from 'react';
import api from '../../services/api';

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
});

export default function ServerClock() {
  const [clock, setClock] = useState({ timestamp: null, status: 'loading' });

  useEffect(() => {
    let anchor = null;
    let pending = false;
    const controller = new AbortController();

    const tick = () => {
      if (anchor) {
        // A monotonic clock keeps changes to the device's date/time from affecting server time.
        setClock({ timestamp: anchor.timestamp + performance.now() - anchor.receivedAt, status: 'ready' });
      }
    };

    const sync = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const response = await api.get('/health', { signal: controller.signal, timeout: 10000 });
        if (controller.signal.aborted) return;
        const timestamp = Date.parse(response.data?.timestamp);
        if (!Number.isFinite(timestamp)) throw new Error('Invalid server timestamp');
        anchor = { timestamp, receivedAt: performance.now() };
        tick();
      } catch {
        if (!controller.signal.aborted) {
          anchor = null;
          setClock({ timestamp: null, status: 'unavailable' });
        }
      } finally {
        pending = false;
      }
    };

    const handleVisibility = () => {
      if (!document.hidden) void sync();
    };

    void sync();
    const tickTimer = window.setInterval(tick, 1000);
    const syncTimer = window.setInterval(sync, 60000);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      controller.abort();
      window.clearInterval(tickTimer);
      window.clearInterval(syncTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <div
      className="order-last basis-full sm:order-none sm:basis-auto sm:ml-auto sm:mr-3 text-center sm:text-right shrink-0 tabular-nums"
      title="Server date and time — India Standard Time (UTC+05:30)"
      id="server-clock"
    >
      {clock.timestamp !== null ? (
        <time dateTime={new Date(clock.timestamp).toISOString()} className="flex sm:flex-col justify-center gap-2 sm:gap-0">
          <span className="text-xs text-surface-500 dark:text-surface-400">{dateFormatter.format(clock.timestamp)}</span>
          <span className="text-xs font-medium text-surface-700 dark:text-surface-200">{timeFormatter.format(clock.timestamp)} IST</span>
        </time>
      ) : (
        <span className="text-xs text-surface-500 dark:text-surface-400">
          {clock.status === 'loading' ? 'Syncing server time…' : 'Server time unavailable'}
        </span>
      )}
    </div>
  );
}
