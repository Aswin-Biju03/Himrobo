// Catch-all: any path that is not / , /privacy or /terms-of-use gets the styled 404 page.
import { servePage } from '../../lib/pages.js';

export const dynamic = 'force-dynamic';

export function GET(request) {
  return servePage(request, '404.html', 404);
}
