import type {
  NextConfig,
} from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "got-scraping",
    "header-generator",
  ],
};

export default nextConfig;
