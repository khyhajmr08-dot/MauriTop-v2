import express from "express";
import application from "../server.ts";

const handler = express();

handler.use((req, _res, next) => {
  const currentUrl = req.url || "/";
  const queryIndex = currentUrl.indexOf("?");
  const pathname = queryIndex >= 0 ? currentUrl.slice(0, queryIndex) : currentUrl;
  const query = queryIndex >= 0 ? currentUrl.slice(queryIndex) : "";

  if (pathname !== "/api" && !pathname.startsWith("/api/")) {
    req.url = `/api${pathname.startsWith("/") ? "" : "/"}${pathname}${query}`;
  }

  next();
});

handler.use(application);

export default handler;
