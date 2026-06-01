'use client';
import { useEffect, useState } from 'react';
import { PomodoroTimer } from './PomodoroTimer';
import { GameLog } from './GameLog';
import type { TrackingGameLogEntry } from '@/lib/tracking-client-shape';

interface Props {
  vnId: string;
  currentMinutes: number;
  initialLog: TrackingGameLogEntry[];
}

/**
 * Hosts the per-VN session widgets (PomodoroTimer + GameLog) inside a
 * single client island so the timer's live elapsed-minute count can
 * be lifted to a shared state and the log can offer "stamp note with
 * 23m of session" in one click. Server component imports this; the
 * heavy children stay tree-shakeable but unified at the data layer.
 */
export function SessionPanel({ vnId, currentMinutes, initialLog }: Props) {
  const [elapsedMin, setElapsedMin] = useState(0);
  useEffect(() => setElapsedMin(0), [vnId]);
  return (
    <>
      <div className="grid gap-4 md:grid-cols-[1fr_280px]">
        <GameLog vnId={vnId} initial={initialLog} liveSessionMinutes={elapsedMin} />
        <PomodoroTimer
          vnId={vnId}
          currentMinutes={currentMinutes}
          onElapsedChange={setElapsedMin}
        />
      </div>
    </>
  );
}
