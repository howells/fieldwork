import type { NextConfig } from "next";

const config: NextConfig = {
  // The playground draws its own corner; the dev badge would sit on the keys list.
  devIndicators: false,
  // Mastra loads optional drivers lazily; keep it out of the server bundle.
  serverExternalPackages: ["@mastra/core"],
  // The SDK is a workspace package published as ESM; compile it with the app.
  transpilePackages: ["@howells/fieldwork-sdk"],
};

export default config;
