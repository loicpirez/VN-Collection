// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

vi.mock('next/navigation', () => ({ notFound: navigationMocks.notFound }));

vi.mock('@/app/global-error', () => ({
  GlobalErrorContent: ({ reset }: { reset: () => void }) => (
    <button type="button" onClick={reset}>Reset global probe</button>
  ),
}));

vi.mock('@/components/PhysicalBundleDialog', () => ({
  PhysicalBundleDialog: ({
    open,
    onChanged,
    onClose,
  }: {
    open: boolean;
    onChanged: () => void;
    onClose: () => void;
  }) => open ? (
    <div role="dialog" aria-label="Bundle fixture">
      <button type="button" onClick={onChanged}>Change bundle</button>
      <button type="button" onClick={onClose}>Close bundle</button>
    </div>
  ) : null,
}));

vi.mock('@/components/PlaceDetailClient', () => ({
  PlaceDetailClient: ({ place }: { place: { name: string } }) => <div>{place.name}</div>,
}));

vi.mock('@/components/VndbLocalImportPanel', () => ({
  VndbLocalImportPanel: () => <div>Import fixture</div>,
}));

import { QaGlobalErrorProbe } from '@/app/qa/error-boundary/QaGlobalErrorProbe';
import QaGlobalErrorLoading from '@/app/qa/error-boundary/loading';
import QaGlobalErrorBoundaryPage from '@/app/qa/error-boundary/page';
import { QaStatefulSurfaces } from '@/app/qa/stateful-surfaces/QaStatefulSurfaces';
import QaStatefulSurfacesLoading from '@/app/qa/stateful-surfaces/loading';
import QaStatefulSurfacesPage from '@/app/qa/stateful-surfaces/page';

const originalQaMode = process.env.VNCOLL_QA;

afterEach(() => {
  cleanup();
  navigationMocks.notFound.mockClear();
  if (originalQaMode === undefined) delete process.env.VNCOLL_QA;
  else process.env.VNCOLL_QA = originalQaMode;
});

describe('QA-only stateful routes', () => {
  it('renders and resets the reusable global error probe', () => {
    render(<QaGlobalErrorProbe />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset global probe' }));
    expect(screen.getByRole('status')).toHaveTextContent('Global error reset completed');
  });

  it('renders deterministic production component fixtures and dialog callbacks', () => {
    render(<QaStatefulSurfaces />);
    expect(screen.getByText('QA mixed stock shop')).toBeInTheDocument();
    expect(screen.getByText('Import fixture')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open physical bundle QA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change bundle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close bundle' }));
    expect(screen.queryByRole('dialog', { name: 'Bundle fixture' })).toBeNull();
  });

  it('renders both QA loading skeletons', () => {
    const first = render(<QaGlobalErrorLoading />);
    expect(first.container.querySelectorAll('.animate-pulse')).toHaveLength(3);
    first.unmount();
    const second = render(<QaStatefulSurfacesLoading />);
    expect(second.container.querySelectorAll('.animate-pulse')).toHaveLength(3);
  });

  it('rejects QA pages outside QA mode and renders them inside QA mode', () => {
    delete process.env.VNCOLL_QA;
    expect(() => QaGlobalErrorBoundaryPage()).toThrow('not-found');
    expect(() => QaStatefulSurfacesPage()).toThrow('not-found');
    process.env.VNCOLL_QA = '1';
    render(<>{QaGlobalErrorBoundaryPage()}{QaStatefulSurfacesPage()}</>);
    expect(screen.getByRole('button', { name: 'Reset global probe' })).toBeInTheDocument();
    expect(screen.getByText('QA mixed stock shop')).toBeInTheDocument();
  });
});
