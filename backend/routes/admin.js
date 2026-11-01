const express = require("express");
const { adminClient } = require("../supabase");
const { requireAuth, allowRoles } = require("../middleware/auth");
const { sendError, isUuid } = require("../utils/http");

const router = express.Router();
router.use(requireAuth, allowRoles("admin"));

router.get("/overview", async (_req, res) => {
  try {
    const [profiles, donations, claims] = await Promise.all([
      adminClient.from("profiles").select("id", { count: "exact", head: true }),
      adminClient.from("donations").select("id, status", { count: "exact" }).limit(1000),
      adminClient.from("claims").select("id, status", { count: "exact" }).limit(1000)
    ]);
    if (profiles.error || donations.error || claims.error) return sendError(res, 500, "Could not load administrator overview.");
    const ds = donations.data || [], cs = claims.data || [];
    res.json({
      overview: {
        totalUsers: profiles.count || 0,
        totalDonations: donations.count || 0,
        availableDonations: ds.filter((d) => d.status === "available" && d.status !== "expired").length,
        totalClaims: claims.count || 0,
        completedClaims: cs.filter((c) => c.status === "collected").length
      }
    });
  } catch { return sendError(res, 500, "Could not load administrator overview."); }
});

router.get("/users", async (_req, res) => {
  const { data, error } = await adminClient.from("profiles")
    .select("id, full_name, role, created_at").order("created_at", { ascending: false }).limit(500);
  if (error) return sendError(res, 500, "Could not load users.");
  res.json({ users: data });
});

router.patch("/users/:id/role", async (req, res) => {
  if (!isUuid(req.params.id)) return sendError(res, 400, "Invalid user ID.");
  const role = req.body.role;
  if (!["donor", "recipient"].includes(role)) return sendError(res, 400, "Role must be donor or recipient. Admin access is configured on the server.");
  const { data, error } = await adminClient.from("profiles").update({ role })
    .eq("id", req.params.id).select("id, full_name, role").maybeSingle();
  if (error) return sendError(res, 500, "Could not update the user's role.");
  if (!data) return sendError(res, 404, "User not found.");
  res.json({ user: data });
});

router.get("/donations", async (_req, res) => {
  const { data, error } = await adminClient.from("donations")
    .select("id, title, status, quantity, unit, created_at, profiles!donations_donor_id_fkey(full_name)")
    .order("created_at", { ascending: false }).limit(500);
  if (error) return sendError(res, 500, "Could not load donations.");
  res.json({ donations: data });
});

module.exports = router;
