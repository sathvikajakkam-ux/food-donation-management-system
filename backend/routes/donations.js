const express = require("express");
const { adminClient } = require("../supabase");
const { requireAuth, allowRoles } = require("../middleware/auth");
const { sendError, isUuid, cleanText } = require("../utils/http");

const router = express.Router();
router.use(requireAuth);

function validateDonation(body) {
  const title = cleanText(body.title, 100);
  const description = cleanText(body.description, 1000);
  const foodType = cleanText(body.foodType, 60);
  const pickupLocation = cleanText(body.pickupLocation, 240);
  const quantity = Number(body.quantity);
  const unit = body.unit;
  const expiresAt = new Date(body.expiresAt);
  const now = Date.now();

  if (title.length < 3) return "Food title must be at least 3 characters.";
  if (description.length < 5) return "Description must be at least 5 characters.";
  if (!foodType) return "Choose a food category.";
  if (pickupLocation.length < 5) return "Enter a clear pickup location.";
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000 || !Number.isInteger(quantity)) return "Quantity must be a whole number between 1 and 100000.";
  if (!["servings", "kg", "boxes", "packs"].includes(unit)) return "Choose a valid quantity unit.";
  if (!body.expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now || expiresAt.getTime() > now + 30 * 24 * 60 * 60 * 1000) {
    return "Use-by time must be in the future and within the next 30 days.";
  }
  return null;
}

router.get("/", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const search = typeof req.query.search === "string" ? cleanText(req.query.search, 80) : "";
    let query = adminClient.from("donations")
      .select("id, donor_id, title, description, food_type, quantity, unit, pickup_location, expires_at, status, created_at, profiles!donations_donor_id_fkey(full_name)")
      .order("created_at", { ascending: false }).limit(200);

    if (req.user.role === "donor") query = query.eq("donor_id", req.user.id);
    else if (req.user.role === "recipient") query = query.in("status", ["available", "claimed", "collected"]);
    if (status && ["available", "claimed", "collected", "cancelled", "expired"].includes(status)) query = query.eq("status", status);
    if (search) query = query.or(`title.ilike.%${search.replace(/[%_,()]/g, " ")}%,food_type.ilike.%${search.replace(/[%_,()]/g, " ")}%`);

    const { data, error } = await query;
    if (error) return sendError(res, 500, "Could not load donations.", "DATABASE_ERROR");
    const donations = data.map((d) => ({
      id: d.id, donorId: d.donor_id, donorName: d.profiles?.full_name || "Food donor",
      title: d.title, description: d.description, foodType: d.food_type,
      quantity: d.quantity, unit: d.unit, pickupLocation: d.pickup_location,
      expiresAt: d.expires_at, status: d.status, createdAt: d.created_at
    }));
    res.json({ donations });
  } catch (error) { next(error); }
});

router.post("/", allowRoles("donor"), async (req, res, next) => {
  try {
    const validationError = validateDonation(req.body);
    if (validationError) return sendError(res, 400, validationError, "VALIDATION_ERROR");
    const b = req.body;
    const { data, error } = await adminClient.from("donations").insert({
      donor_id: req.user.id,
      title: cleanText(b.title, 100),
      description: cleanText(b.description, 1000),
      food_type: cleanText(b.foodType, 60),
      quantity: Number(b.quantity), unit: b.unit,
      pickup_location: cleanText(b.pickupLocation, 240),
      expires_at: new Date(b.expiresAt).toISOString()
    }).select("id, title, status").single();
    if (error) return sendError(res, 500, "Could not create the donation.", "DATABASE_ERROR");
    res.status(201).json({ donation: data });
  } catch (error) { next(error); }
});

router.patch("/:id", allowRoles("donor"), async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) return sendError(res, 400, "Invalid donation ID.");
    const { data: existing, error: lookupError } = await adminClient.from("donations")
      .select("id, donor_id, status").eq("id", req.params.id).maybeSingle();
    if (lookupError) return sendError(res, 500, "Could not load the donation.");
    if (!existing) return sendError(res, 404, "Donation not found.");
    if (existing.donor_id !== req.user.id) return sendError(res, 403, "You can only edit your own donations.");
    if (existing.status !== "available") return sendError(res, 409, "Only available donations can be edited.");

    const validationError = validateDonation(req.body);
    if (validationError) return sendError(res, 400, validationError, "VALIDATION_ERROR");
    const b = req.body;
    const { data, error } = await adminClient.from("donations").update({
      title: cleanText(b.title, 100), description: cleanText(b.description, 1000),
      food_type: cleanText(b.foodType, 60), quantity: Number(b.quantity), unit: b.unit,
      pickup_location: cleanText(b.pickupLocation, 240), expires_at: new Date(b.expiresAt).toISOString()
    }).eq("id", req.params.id).eq("donor_id", req.user.id).eq("status", "available")
      .select("id, title, status").maybeSingle();
    if (error) return sendError(res, 500, "Could not update the donation.");
    if (!data) return sendError(res, 409, "The donation changed while you were editing it. Refresh and try again.");
    res.json({ donation: data });
  } catch (error) { next(error); }
});

router.delete("/:id", allowRoles("donor"), async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) return sendError(res, 400, "Invalid donation ID.");
    const { data, error } = await adminClient.from("donations").update({ status: "cancelled" })
      .eq("id", req.params.id).eq("donor_id", req.user.id).eq("status", "available")
      .select("id").maybeSingle();
    if (error) return sendError(res, 500, "Could not cancel the donation.");
    if (!data) return sendError(res, 409, "Donation not found, not yours, or no longer available.");
    res.json({ message: "Donation cancelled." });
  } catch (error) { next(error); }
});

module.exports = router;
