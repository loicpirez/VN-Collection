'use client';

import { createRouteErrorBoundary } from '@/components/RouteErrorView';

export default createRouteErrorBoundary({ logLabel: 'Seiyuu page error', returnHref: '/' });
