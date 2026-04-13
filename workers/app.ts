import { createRequestHandler } from "react-router";
import { generateMapSvg } from "~/lib/generate-map-svg";
import { syncDataCron, syncStaticGtfsCron } from "./sync-data";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/map.svg" && env.IS_SVG_ENABLED) {
      return new Response(generateMapSvg(), {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
  async scheduled(controller, env, ctx) {
    if (controller.cron === "* * * * *") {
      await syncDataCron(env, ctx);
    } else if (controller.cron === "15 7 * * *") {
      await syncStaticGtfsCron(env, ctx);
    }
  },
} satisfies ExportedHandler<Env>;
