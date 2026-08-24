'use client';
import { createRouteErrorBoundary } from '@/components/RouteErrorView';

export default createRouteErrorBoundary({ logLabel: "Staff detail error", returnHref: "/staff" });
