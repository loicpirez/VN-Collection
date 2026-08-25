'use client';
import { createRouteErrorBoundary } from '@/components/RouteErrorView';

export default createRouteErrorBoundary({ logLabel: "Lists error", returnHref: "/" });
