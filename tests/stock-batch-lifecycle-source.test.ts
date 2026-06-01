import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CLIENT = readFileSync('src/components/StockBatchClient.tsx', 'utf8');

describe('stock-batch lifecycle', () => {
  it('owns job submission and cancellation requests across teardown', () => {
    expect(CLIENT).toContain('const startInFlightRef = useRef(false)');
    expect(CLIENT).toContain('const stopInFlightRef = useRef(false)');
    expect(CLIENT).toContain('startAbortRef.current?.abort()');
    expect(CLIENT).toContain('stopAbortRef.current?.abort()');
    expect(CLIENT).toContain('startAbortRef.current !== controller');
    expect(CLIENT).toContain('stopAbortRef.current !== controller');
  });

  it('locks duplicate starts and stops synchronously', () => {
    expect(CLIENT).toContain('startInFlightRef.current || jobIdRef.current != null');
    expect(CLIENT).toContain('if (!ownerJobId || stopInFlightRef.current) return');
    expect(CLIENT).toContain('startInFlightRef.current = true');
    expect(CLIENT).toContain('stopInFlightRef.current = true');
  });

  it('preserves the running-job handle when the editable queue is cleared', () => {
    const clearQueue = CLIENT.slice(
      CLIENT.indexOf('function clearQueue()'),
      CLIENT.indexOf('async function loadScope'),
    );
    expect(clearQueue).not.toContain('setJobId(null)');
    expect(clearQueue).not.toContain('setQueued(null)');
  });

  it('polls canonical download status until the tracked job finishes', () => {
    expect(CLIENT).toContain("fetch('/api/download-status', { cache: 'no-store', signal: controller.signal })");
    expect(CLIENT).toContain('const job = snapshot.jobs.find((entry) => entry.id === jobId)');
    expect(CLIENT).toContain('if (!job || job.finished_at != null)');
    expect(CLIENT).toContain('timer = setTimeout(poll, 2_000)');
  });
});
