'use client';
import { GraduationCap } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { startTour } from './TutorialTour';

export function RunTourButton() {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => startTour()}
      className="btn"
    >
      <GraduationCap className="h-4 w-4" /> {t.tour.runAgain}
    </button>
  );
}
