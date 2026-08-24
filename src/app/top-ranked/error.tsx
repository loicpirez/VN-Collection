'use client';
import { createRouteErrorBoundary } from '@/components/RouteErrorView';

export default createRouteErrorBoundary({ logLabel: "Top-ranked page error", returnHref: "/" });
