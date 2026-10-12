import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { errorHandler, notFoundHandler } from "./http/error-handler.js";
import { buildOpenApiDocument } from "./http/openapi.js";
import { apiLimiter } from "./http/rate-limit.js";
import { buildRouter } from "./http/router.js";
import { modules } from "./modules/index.js";
import { publicSiteRouter } from "./modules/website/public-site.routes.js";

export function createApp() {
  const app = express();
  const openApiDocument = buildOpenApiDocument(modules);

  app.set("trust proxy", 1);
  // Files are served from this API to the web app on another origin
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      // School websites load Google Fonts, YouTube and Google Maps embeds and one inline script
      contentSecurityPolicy: {
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'", "'unsafe-inline'"],
          "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          "font-src": ["'self'", "https://fonts.gstatic.com"],
          "img-src": ["'self'", "data:", "https:", "http:"],
          "frame-src": ["https://www.youtube-nocookie.com", "https://www.google.com"],
          "form-action": ["'self'"],
          "frame-ancestors": ["'self'", ...env.CORS_ORIGINS],
        },
      },
    }),
  );
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/api/openapi.json", (_req, res) => {
    res.json(openApiDocument);
  });
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.use("/api", apiLimiter, buildRouter(modules));

  // Public school websites (HTML pages). Kept out of the JSON API.
  app.use(publicSiteRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
