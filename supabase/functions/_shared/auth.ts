import { getAcceptedAuthTokens, isProjectServiceRoleBearer } from './envKeys.ts';

const EXTRACT_SECRET_HEADER = 'x-orcarede-extract-secret';

export function authorizeExtractRequest(req: Request): boolean {
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const headerSecret = req.headers.get(EXTRACT_SECRET_HEADER);

  if (isProjectServiceRoleBearer(bearerToken)) return true;

  const accepted = getAcceptedAuthTokens();
  if (accepted.length === 0) return false;

  if (bearerToken && accepted.includes(bearerToken)) return true;
  if (headerSecret && accepted.includes(headerSecret)) return true;

  return false;
}
