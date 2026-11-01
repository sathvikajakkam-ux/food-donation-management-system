const express = require("express");
const { authClient, adminClient } = require("../supabase");
const { requireAuth } = require("../middleware/auth");
const { sendError, cleanText } = require("../utils/http");

const router = express.Router();

router.post("/register", async (req, res, next) => {
  try {
    const fullName = cleanText(req.body.fullName, 80);
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const role = req.body.role;

    if (fullName.length < 2) return sendError(res, 400, "Enter your full name (at least 2 characters).");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return sendError(res, 400, "Enter a valid email address.");
    if (password.length < 8 || password.length > 72) return sendError(res, 400, "Password must be between 8 and 72 characters.");
    if (!["donor", "recipient"].includes(role)) return sendError(res, 400, "Choose donor or recipient.");

    // Create user via admin API to avoid Supabase free-tier email rate limiting and auto-confirm email
    const { data: adminData, error: adminError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });

    if (adminError) {
      console.error("Registration error from Supabase Auth:", adminError.message);
      const message = /already registered|already been registered|user already exists/i.test(adminError.message)
        ? "An account with this email may already exist. Try signing in." : `Registration failed: ${adminError.message}`;
      return sendError(res, 400, message, "REGISTRATION_FAILED");
    }
    const user = adminData.user;
    if (!user) return sendError(res, 400, "Registration could not be completed.");

    const { error: profileError } = await adminClient.from("profiles").upsert({
      id: user.id, full_name: fullName, role
    }, { onConflict: "id" });
    if (profileError) {
      console.error("Profile creation failed in database:", profileError.message);
      return sendError(res, 500, `Database error: ${profileError.message}. Please run database/schema.sql in Supabase SQL Editor.`, "DATABASE_SCHEMA_MISSING");
    }

    // Sign in immediately to issue a JWT session
    const { data: sessionData, error: loginError } = await authClient.auth.signInWithPassword({ email, password });
    if (loginError || !sessionData.session) {
      return res.status(201).json({
        message: "Account created successfully. Please sign in with your email and password.",
        requiresEmailConfirmation: false
      });
    }

    res.status(201).json({
      message: "Account created successfully.",
      accessToken: sessionData.session.access_token,
      user: { id: user.id, email, fullName, role }
    });
  } catch (error) { next(error); }
});

router.post("/login", async (req, res, next) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) return sendError(res, 400, "Enter your email and password.");

    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error || !data.user || !data.session) {
      console.error("Login failed for", email, ":", error ? error.message : "No session");
      return sendError(res, 401, error ? error.message : "Email or password is incorrect.", "LOGIN_FAILED");
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles").select("id, full_name, role").eq("id", data.user.id).maybeSingle();
    if (profileError) {
      console.error("Profile query error in database:", profileError.message);
      return sendError(res, 500, `Database error: ${profileError.message}. Please run database/schema.sql in Supabase SQL Editor.`, "DATABASE_SCHEMA_MISSING");
    }
    if (!profile) {
      return sendError(res, 403, "Account profile not found in database. Please run database/schema.sql in Supabase SQL Editor.", "PROFILE_MISSING");
    }

    const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase());
    const role = adminEmails.includes(email) ? "admin" : profile.role;
    res.json({
      accessToken: data.session.access_token,
      user: { id: data.user.id, email, fullName: profile.full_name, role }
    });
  } catch (error) { next(error); }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
