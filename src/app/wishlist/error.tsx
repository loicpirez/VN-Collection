'use client';
import { createRouteErrorBoundary } from '@/components/RouteErrorView';

export default createRouteErrorBoundary({ logLabel: "Wishlist page error", returnHref: "/" });
