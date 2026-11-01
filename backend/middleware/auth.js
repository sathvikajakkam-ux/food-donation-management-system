const { adminClient } = require("../supabase");
const { sendError } = require("../utils/http");

async function requireAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return sendError(res, 401, "Please sign in to continue.", "AUTH_REQUIRED");

  try {
    const { data, error } = await adminClient.auth.getUser(match[1]);
    if (error || !data.user) return sendError(res, 401, "Your session is invalid or expired. Please sign in again.", "INVALID_TOKEN");
    const email = (data.user.email || "").toLowerCase();
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
    const { data: profile, error: profileError } = await adminClient
      .from("profiles").select("id, full_name, role").eq("id", data.user.id).maybeSingle();

    if (profileError || !profile) return sendError(res, 403, "Your account profile is not ready. Please contact the administrator.", "PROFILE_MISSING");

    req.user = {
      id: data.user.id,
      email,
      fullName: profile.full_name,
      // Administrator privilege is derived from server configuration, never from browser input.
      role: adminEmails.includes(email) ? "admin" : profile.role
    };
    next();
  } catch {
    return sendError(res, 401, "Could not verify your session. Please sign in again.", "AUTH_FAILED");
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return sendError(res, 403, "You do not have permission to perform this action.", "FORBIDDEN");
    }
    next();
  };
}

module.exports = { requireAuth, allowRoles };
