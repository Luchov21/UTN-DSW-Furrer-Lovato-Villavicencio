// Where an interrupted member gets sent, and how they get back. Both helpers
// exist for one reason: the query string is not decoration here. A checkout
// link carries the plan and the term in it (?plan=12&months=6), so a redirect
// that keeps only the pathname silently throws the purchase away — the wallet
// page then finds no plan and bounces the member to /membership.

/** The shape react-router puts in `location.state.from`. */
export interface FromLocation {
  pathname?: string;
  search?: string;
}

/**
 * The path LoginForm sends the member to after signing in, rebuilt from the
 * location ProtectedRoute captured. Falls back to '/' when there is no
 * origin to return to.
 */
export function returnPathFrom(from: FromLocation | null | undefined): string {
  if (!from?.pathname) {
    return '/';
  }
  return `${from.pathname}${from.search ?? ''}`;
}

/**
 * The /complete-profile URL carrying where to come back to once the member
 * has fixed whatever sent them there — the same ?returnTo Checkout.tsx
 * builds, read back through safeReturnTo.
 */
export function completeProfileUrl(location: {
  pathname: string;
  search: string;
}): string {
  const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);
  return `/complete-profile?returnTo=${returnTo}`;
}
