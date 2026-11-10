import express from "express";
import application from "../server.ts";

const handler = express();

// Vercel rewrites every /api/* request to one serverless function and places
// the original path in __path. Restore the canonical Express route path here.
handler.use((req, _res, next) => {
  const currentUrl = req.url || "/";
  const parsedUrl = new URL(currentUrl, "https://mauritop.invalid");
  const routedPath = parsedUrl.searchParams.get("__path");

  if (routedPath) {
    parsedUrl.searchParams.delete("__path");
    const normalizedPath = routedPath.replace(/^\/+/, "");
    const remainingQuery = parsedUrl.searchParams.toString();
    req.url = `/api/${normalizedPath}${remainingQuery ? `?${remainingQuery}` : ""}`;
  } else if (parsedUrl.pathname === "/api/index") {
    req.url = `/api${parsedUrl.search}`;
  } else if (parsedUrl.pathname !== "/api" && !parsedUrl.pathname.startsWith("/api/")) {
    req.url = `/api${parsedUrl.pathname.startsWith("/") ? "" : "/"}${parsedUrl.pathname}${parsedUrl.search}`;
  }

  next();
});

handler.use(application);

export default handler;
