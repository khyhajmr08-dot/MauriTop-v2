import express from "express";
import application from "../server";

// Vercel catch-all route for every /api/* request. Depending on the route
// adapter, req.url may contain the full /api prefix or only the remainder.
// Normalize it before dispatching so the existing Express routes keep their
// canonical /api/... paths.
const api = express();

api.use((req, _res, next) => {
  const currentUrl = req.url || "/";
  if (currentUrl !== "/api" && !currentUrl.startsWith("/api/")) {
    req.url = `/api${currentUrl.startsWith("/") ? "" : "/"}${currentUrl}`;
  }
  next();
});

api.use(application);

export default api;
