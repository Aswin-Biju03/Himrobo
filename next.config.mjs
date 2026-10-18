/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // The clone reuses the original site's compiled front-end. This app is a thin shell:
  // app/ route handlers serve the captured HTML pages, while server.mjs handles the
  // /_next/* paths (original chunks, image endpoint, RSC fallback) — see README.
};

export default nextConfig;
