import { servePage } from '../../lib/pages.js';

export const dynamic = 'force-dynamic';

export function GET(request) {
  return servePage(request, 'terms-of-use.html');
}
