'use client';
import { Printer } from 'lucide-react';

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-primary">
      <Printer className="h-4 w-4" /> {label}
    </button>
  );
}
