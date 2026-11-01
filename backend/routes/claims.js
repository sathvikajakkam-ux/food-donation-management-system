const express = require("express");
const { adminClient } = require("../supabase");
const { requireAuth, allowRoles } = require("../middleware/auth");
const { sendError, isUuid } = require("../utils/http");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    let query = adminClient.from("claims")
      .select("id, donation_id, recipient_id, status, created_at, completed_at, donations!claims_donation_id_fkey(title, quantity, unit, pickup_location, expires_at, donor_id, profiles!donations_donor_id_fkey(full_name)), profiles!claims_recipient_id_fkey(full_name)")
      .order("created_at", { ascending: false }).limit(200);
    if (req.user.role === "recipient") query = query.eq("recipient_id", req.user.id);
    else if (req.user.role === "donor") {
      // Fetch claim rows for the donor's own donations after looking up their donation IDs.
      const { data: donorDonations, error: donationError } = await adminClient.from("donations")
        .select("id").eq("donor_id", req.user.id);
      if (donationError) return sendError(res, 500, "Could not load claims.");
      const ids = (donorDonations || []).map((d) => d.id);
      if (!ids.length) return res.json({ claims: [] });
      query = query.in("donation_id", ids);
    }
    const { data, error } = await query;
    if (error) return sendError(res, 500, "Could not load claims.", "DATABASE_ERROR");
    res.json({ claims: data.map((c) => ({
      id: c.id, donationId: c.donation_id, recipientId: c.recipient_id,
      recipientName: c.profiles?.full_name || "Recipient",
      status: c.status, createdAt: c.created_at, completedAt: c.completed_at,
      donation: c.donations ? {
        title: c.donations.title, quantity: c.donations.quantity, unit: c.donations.unit,
        pickupLocation: c.donations.pickup_location, expiresAt: c.donations.expires_at,
        donorId: c.donations.donor_id, donorName: c.donations.profiles?.full_name || "Donor"
      } : null
    })) });
  } catch (error) { next(error); }
});

router.post("/:donationId", allowRoles("recipient"), async (req, res, next) => {
  try {
    if (!isUuid(req.params.donationId)) return sendError(res, 400, "Invalid donation ID.");
    const { data, error } = await adminClient.rpc("claim_donation", {
      p_donation_id: req.params.donationId, p_recipient_id: req.user.id
    });
    if (error) {
      const msg = /not available|expired|cannot claim/i.test(error.message) ? error.message : "Could not claim this donation.";
      return sendError(res, 409, msg, "CLAIM_FAILED");
    }
    res.status(201).json({ claim: data });
  } catch (error) { next(error); }
});

router.patch("/:claimId/cancel", allowRoles("recipient"), async (req, res, next) => {
  try {
    if (!isUuid(req.params.claimId)) return sendError(res, 400, "Invalid claim ID.");
    const { data, error } = await adminClient.rpc("cancel_claim", {
      p_claim_id: req.params.claimId, p_actor_id: req.user.id
    });
    if (error) return sendError(res, 409, /not allowed|not pending|not found/i.test(error.message) ? error.message : "Could not cancel this claim.");
    res.json({ claim: data });
  } catch (error) { next(error); }
});

router.patch("/:claimId/complete", allowRoles("donor"), async (req, res, next) => {
  try {
    if (!isUuid(req.params.claimId)) return sendError(res, 400, "Invalid claim ID.");
    const { data, error } = await adminClient.rpc("complete_claim", {
      p_claim_id: req.params.claimId, p_donor_id: req.user.id
    });
    if (error) return sendError(res, 409, /not allowed|not pending|not found/i.test(error.message) ? error.message : "Could not complete this claim.");
    res.json({ claim: data });
  } catch (error) { next(error); }
});

module.exports = router;
