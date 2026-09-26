import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo lives inside a folder with its own package-lock.json; pin the
  // workspace root so Turbopack doesn't guess.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
