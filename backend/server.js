require("dotenv").config();

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const authRoutes = require("./routes/auth");
const donationRoutes = require("./routes/donations");
const claimRoutes = require("./routes/claims");
const adminRoutes = require("./routes/admin");
const { sendError } = require("./utils/http");

const app = express();
const port = Number(process.env.PORT) || 3000;

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: "30kb" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false }));

app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "food-donation-management-system" }));
app.use("/api/auth", authRoutes);
app.use("/api/donations", donationRoutes);
app.use("/api/claims", claimRoutes);
app.use("/api/admin", adminRoutes);

const frontendPath = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendPath));
app.get("/{*splat}", (req, res, next) => {
  if (req.path.startsWith("/api/")) return sendError(res, 404, "API endpoint not found.", "NOT_FOUND");
  res.sendFile(path.join(frontendPath, "index.html"), (err) => { if (err) next(err); });
});

app.use((err, _req, res, _next) => {
  // Do not return stack traces, secrets, or raw database errors to clients.
  console.error("Unhandled request error:", err && err.message ? err.message : "unknown error");
  if (res.headersSent) return;
  sendError(res, 500, "An unexpected server error occurred. Please try again.", "INTERNAL_ERROR");
});

if (require.main === module) {
  app.listen(port, () => console.log(`Food Donation Management System running at http://localhost:${port}`));
}
module.exports = app;
