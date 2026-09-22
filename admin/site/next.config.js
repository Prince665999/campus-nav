/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The admin site talks to the backend through a server-side proxy
  // (see app/api/proxy/[...path]/route.js). That means the browser
  // never sees the admin API key — it stays on the server.
  //
  // No special config is needed for that proxy to work; this file
  // exists to make the settings explicit and to give us a place to
  // add config when later phases need it.
};

module.exports = nextConfig;