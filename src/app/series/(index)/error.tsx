'use client';
import { createRouteErrorBoundary } from '@/components/RouteErrorView';

export default createRouteErrorBoundary({ logLabel: "Series page error", returnHref: "/" });
