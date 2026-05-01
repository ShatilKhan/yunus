import { serve } from "bun";
import index from "./index.html";
import { bot } from "./bot/index";
import { initSchema } from "./db/client";

// Initialize database schema on startup
await initSchema();

// Start bot in polling mode for local development
bot.start();
console.log("🤖 Bot started in polling mode");

// Local API route handlers
async function handleApiRequest(req: Request, path: string): Promise<Response> {
  const url = new URL(req.url);

  if (path.startsWith("/api/categories")) {
    const { default: handler } = await import("../api/categories");
    return handler(req);
  }

  if (path.startsWith("/api/entries")) {
    const { default: handler } = await import("../api/entries");
    return handler(req);
  }

  if (path.startsWith("/api/stats")) {
    const { default: handler } = await import("../api/stats");
    return handler(req);
  }

  if (path === "/api/webhook" && req.method === "POST") {
    const { default: handler } = await import("../api/webhook");
    return handler(req);
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

const server = serve({
  routes: {
    // API routes
    "/api/*": async (req) => {
      const url = new URL(req.url);
      return handleApiRequest(req, url.pathname);
    },

    // Serve index.html for all unmatched routes (SPA)
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
