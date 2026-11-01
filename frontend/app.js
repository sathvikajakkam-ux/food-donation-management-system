"use strict";

const $ = (selector) => document.querySelector(selector);
const views = { home: $("#home-view"), auth: $("#auth-view"), dashboard: $("#dashboard-view") };
const state = { token: sessionStorage.getItem("fdms_token") || "", user: null, donations: [], claims: [], editingDonationId: null, confirmResolver: null, search: "" };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}
function safeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}
function setBusy(form, busy) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  button.disabled = busy;
  if (busy) { button.dataset.oldText = button.textContent; button.textContent = "Please wait…"; }
  else if (button.dataset.oldText) { button.textContent = button.dataset.oldText; delete button.dataset.oldText; }
}
function showToast(message) {
  const toast = $("#toast"); toast.textContent = message; toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 3500);
}
function showNotice(message, type = "success") {
  const isAuth = views.auth && !views.auth.hidden;
  const notice = isAuth ? ($("#auth-notice") || $("#notice")) : $("#notice");
  if (!notice) return;
  notice.textContent = message; notice.className = `notice ${type}`; notice.hidden = false;
}
function clearNotice() {
  if ($("#notice")) $("#notice").hidden = true;
  if ($("#auth-notice")) $("#auth-notice").hidden = true;
}
function showView(name) {
  Object.entries(views).forEach(([key, view]) => { view.hidden = key !== name; });
  $("#logout-button").hidden = !state.user;
  $('a[data-nav="dashboard"]').hidden = !state.user;
  if (name === "home") history.replaceState(null, "", "#home");
  else if (name === "auth") history.replaceState(null, "", "#auth");
  else history.replaceState(null, "", "#dashboard");
}
async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  let response;
  try {
    response = await fetch(`/api${path}`, { ...options, headers });
  } catch {
    throw new Error("Could not reach the server. Make sure the backend is running.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && state.token) signOut(false);
    throw new Error(payload.error?.message || "The request could not be completed.");
  }
  return payload;
}
function signOut(showMessage = true) {
  state.token = ""; state.user = null; state.donations = []; state.claims = [];
  sessionStorage.removeItem("fdms_token");
  showView("home");
  if (showMessage) showToast("You have signed out.");
}
function switchAuthTab(tab) {
  clearNotice();
  const login = tab === "login";
  $("#login-form").hidden = !login; $("#register-form").hidden = login;
  $("#tab-login").classList.toggle("active", login); $("#tab-register").classList.toggle("active", !login);
  $("#tab-login").setAttribute("aria-selected", String(login));
  $("#tab-register").setAttribute("aria-selected", String(!login));
}
function openAuth(tab = "login") { showView("auth"); switchAuthTab(tab); }
function emptyState(title, description) {
  return `<div class="empty-state"><div class="empty-icon" aria-hidden="true">♡</div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></div>`;
}
function statusBadge(status) {
  return `<span class="status-pill status-${escapeHtml(status)}">${escapeHtml(status)}</span>`;
}
function renderStats() {
  const available = state.donations.filter((d) => d.status === "available").length;
  const claimed = state.claims.filter((c) => c.status === "pending").length;
  const collected = state.claims.filter((c) => c.status === "collected").length;
  let stats;
  if (state.user.role === "admin") {
    stats = state.adminOverview || { totalUsers: 0, totalDonations: state.donations.length, availableDonations: available, totalClaims: state.claims.length };
    $("#stats").innerHTML = statCard("Members", stats.totalUsers, "Registered accounts", "♙") +
      statCard("All donations", stats.totalDonations, "Platform listings", "♧") +
      statCard("Available", stats.availableDonations, "Ready to be claimed", "♡") +
      statCard("Claims", stats.totalClaims, "All claim records", "↗");
  } else if (state.user.role === "donor") {
    stats = [
      ["My donations", state.donations.length, "Food listings created", "♧"],
      ["Available", available, "Awaiting a recipient", "♡"],
      ["Pending claims", claimed, "Awaiting collection", "↗"],
      ["Collected", collected, "Successful handovers", "✓"]
    ];
    $("#stats").innerHTML = stats.map((s) => statCard(...s)).join("");
  } else {
    stats = [
      ["Available food", available, "Listings to explore", "♧"],
      ["My claims", state.claims.length, "Claims in your account", "♡"],
      ["Pending", claimed, "Awaiting collection", "↗"],
      ["Collected", collected, "Completed pickups", "✓"]
    ];
    $("#stats").innerHTML = stats.map((s) => statCard(...s)).join("");
  }
}
function statCard(label, value, note, icon) {
  return `<article class="stat-card"><div class="stat-top"><span>${escapeHtml(label)}</span><span class="stat-icon" aria-hidden="true">${icon}</span></div><div class="stat-value">${Number(value) || 0}</div><div class="stat-note">${escapeHtml(note)}</div></article>`;
}
function donationCard(d) {
  const isDonor = state.user.role === "donor" && d.donorId === state.user.id;
  let actions = "";
  if (state.user.role === "recipient" && d.status === "available") actions = `<button class="button button-primary" data-action="claim" data-id="${escapeHtml(d.id)}">Claim food</button>`;
  if (isDonor && d.status === "available") actions = `<button class="button button-secondary" data-action="edit" data-id="${escapeHtml(d.id)}">Edit</button><button class="button button-quiet" data-action="cancel-donation" data-id="${escapeHtml(d.id)}">Cancel listing</button>`;
  return `<article class="donation-card"><div class="card-title-row"><div class="card-title">${escapeHtml(d.title)}</div>${statusBadge(d.status)}</div>
    <p class="card-description">${escapeHtml(d.description)}</p>
    <div class="card-meta"><div class="meta-item"><strong>Quantity</strong>${Number(d.quantity)} ${escapeHtml(d.unit)}</div><div class="meta-item"><strong>Food category</strong>${escapeHtml(d.foodType)}</div><div class="meta-item"><strong>Pickup location</strong>${escapeHtml(d.pickupLocation)}</div><div class="meta-item"><strong>Use by</strong>${escapeHtml(safeDate(d.expiresAt))}</div><div class="meta-item"><strong>Donor</strong>${escapeHtml(d.donorName)}</div></div>
    ${actions ? `<div class="card-actions">${actions}</div>` : ""}</article>`;
}
function claimCard(c) {
  let actions = "";
  if (state.user.role === "recipient" && c.status === "pending") actions = `<button class="button button-secondary" data-action="cancel-claim" data-id="${escapeHtml(c.id)}">Cancel claim</button>`;
  if (state.user.role === "donor" && c.status === "pending" && c.donation?.donorId === state.user.id) actions = `<button class="button button-primary" data-action="complete-claim" data-id="${escapeHtml(c.id)}">Confirm collection</button>`;
  return `<article class="claim-card"><div class="card-title-row"><div class="card-title">${escapeHtml(c.donation?.title || "Donation")}</div>${statusBadge(c.status)}</div>
    <div class="card-meta"><div class="meta-item"><strong>${state.user.role === "donor" ? "Recipient" : "Donor"}</strong>${escapeHtml(state.user.role === "donor" ? c.recipientName : c.donation?.donorName || "Donor")}</div><div class="meta-item"><strong>Quantity</strong>${Number(c.donation?.quantity || 0)} ${escapeHtml(c.donation?.unit || "")}</div><div class="meta-item"><strong>Pickup location</strong>${escapeHtml(c.donation?.pickupLocation || "Not available")}</div><div class="meta-item"><strong>Claimed on</strong>${escapeHtml(safeDate(c.createdAt))}</div></div>
    ${actions ? `<div class="card-actions">${actions}</div>` : ""}</article>`;
}
function renderDonations() {
  let list = state.donations;
  if (state.user.role === "recipient") list = list.filter((d) => d.status === "available" || d.status === "claimed" || d.status === "collected");
  $("#donation-count").textContent = String(list.length);
  $("#donations-list").innerHTML = list.length ? list.map(donationCard).join("") : emptyState(
    state.user.role === "donor" ? "Your first donation starts here" : "No donations found",
    state.user.role === "donor" ? "Add a food listing to connect with your community." : "Try a different search or check again later."
  );
}
function renderClaims() {
  $("#claims-count").textContent = String(state.claims.length);
  $("#claims-list").innerHTML = state.claims.length ? state.claims.map(claimCard).join("") : emptyState("No claims yet", "Claims and collection updates will appear here.");
}
function renderAdmin() {
  if (state.user.role !== "admin") return;
  const users = state.adminUsers || [];
  $("#admin-users").innerHTML = users.length ? `<table class="data-table"><thead><tr><th>Member</th><th>Role</th><th>Joined</th></tr></thead><tbody>${users.map((u) => `<tr><td>${escapeHtml(u.full_name)}</td><td>${u.role === "admin" ? "Admin" : `<select data-action="role" data-id="${escapeHtml(u.id)}" aria-label="Role for ${escapeHtml(u.full_name)}"><option value="donor" ${u.role === "donor" ? "selected" : ""}>Donor</option><option value="recipient" ${u.role === "recipient" ? "selected" : ""}>Recipient</option></select>`}</td><td>${escapeHtml(safeDate(u.created_at))}</td></tr>`).join("")}</tbody></table>` : emptyState("No members", "Registered accounts will appear here.");
  const donations = state.adminDonations || [];
  $("#admin-donations").innerHTML = donations.length ? `<table class="data-table"><thead><tr><th>Food</th><th>Donor</th><th>Quantity</th><th>Status</th></tr></thead><tbody>${donations.map((d) => `<tr><td>${escapeHtml(d.title)}</td><td>${escapeHtml(d.profiles?.full_name || "Donor")}</td><td>${Number(d.quantity)} ${escapeHtml(d.unit)}</td><td>${statusBadge(d.status)}</td></tr>`).join("")}</tbody></table>` : emptyState("No donations", "Donation listings will appear here.");
}
async function loadDashboard() {
  clearNotice();
  showView("dashboard");
  const isDonor = state.user.role === "donor";
  const isRecipient = state.user.role === "recipient";
  $("#dashboard-title").textContent = state.user.role === "admin" ? "Admin overview" : `Hello, ${state.user.fullName.split(" ")[0]}`;
  $("#dashboard-subtitle").textContent = isDonor ? "Share surplus food and coordinate collections." : isRecipient ? "Discover available food and manage your claims." : "Monitor community activity and member access.";
  $("#new-donation-button").hidden = !isDonor;
  $("#discover-panel").hidden = !isRecipient;
  $("#claims-panel").hidden = state.user.role === "admin";
  $("#admin-panel").hidden = state.user.role !== "admin";
  $("#claims-title").textContent = isDonor ? "Incoming claims" : "My claims";
  $("#primary-list-title").textContent = isDonor ? "My donations" : isRecipient ? "Available donations" : "Recent donations";
  $("#primary-list-description").textContent = isDonor ? "Manage listings and follow collection status." : isRecipient ? "Explore food that is available to claim." : "Recent donation activity.";
  $("#donation-form-panel").hidden = true;
  $("#donations-list").innerHTML = emptyState("Loading donations…", "Getting the latest records from the database.");
  try {
    const params = new URLSearchParams();
    if (state.search) params.set("search", state.search);
    const [donations, claims] = await Promise.all([
      api(`/donations${params.toString() ? `?${params}` : ""}`),
      state.user.role === "admin" ? Promise.resolve({ claims: [] }) : api("/claims")
    ]);
    state.donations = donations.donations || []; state.claims = claims.claims || [];
    if (state.user.role === "admin") {
      const [overview, users, allDonations] = await Promise.all([api("/admin/overview"), api("/admin/users"), api("/admin/donations")]);
      state.adminOverview = overview.overview; state.adminUsers = users.users; state.adminDonations = allDonations.donations;
    }
    renderStats(); renderDonations(); renderClaims(); renderAdmin();
  } catch (error) {
    $("#donations-list").innerHTML = emptyState("Could not load data", error.message);
    showNotice(error.message, "error");
  }
}
function resetDonationForm() {
  state.editingDonationId = null; $("#donation-form").reset();
  $("#donation-form-title").textContent = "Add a donation";
  $("#donation-form-panel").hidden = true;
}
function setDefaultExpiry() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  $("#donation-form [name=expiresAt]").value = date.toISOString().slice(0, 16);
}
function openDonationForm(donation = null) {
  resetDonationForm();
  $("#donation-form-panel").hidden = false;
  $("#donation-form-title").textContent = donation ? "Edit donation" : "Add a donation";
  state.editingDonationId = donation?.id || null;
  if (donation) {
    const form = $("#donation-form");
    for (const [name, value] of Object.entries({
      title: donation.title, description: donation.description, foodType: donation.foodType,
      quantity: donation.quantity, unit: donation.unit, pickupLocation: donation.pickupLocation
    })) form.elements[name].value = value;
    const expiry = new Date(donation.expiresAt);
    expiry.setMinutes(expiry.getMinutes() - expiry.getTimezoneOffset());
    form.elements.expiresAt.value = expiry.toISOString().slice(0, 16);
  } else setDefaultExpiry();
  $("#donation-form-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}
function formPayload(form) {
  const data = new FormData(form);
  return {
    title: data.get("title"), description: data.get("description"), foodType: data.get("foodType"),
    quantity: Number(data.get("quantity")), unit: data.get("unit"), pickupLocation: data.get("pickupLocation"),
    expiresAt: new Date(data.get("expiresAt")).toISOString()
  };
}
async function confirmAction(title, message, buttonLabel = "Confirm") {
  $("#confirm-title").textContent = title; $("#confirm-message").textContent = message; $("#confirm-action").textContent = buttonLabel;
  const dialog = $("#confirm-dialog");
  if (typeof dialog.showModal !== "function") return window.confirm(message);
  return new Promise((resolve) => {
    state.confirmResolver = resolve;
    dialog.addEventListener("close", () => {
      const confirmed = dialog.returnValue === "confirm";
      const resolver = state.confirmResolver; state.confirmResolver = null;
      if (resolver) resolver(confirmed);
    }, { once: true });
    dialog.showModal();
  });
}
async function handleCardAction(button) {
  const id = button.dataset.id; const action = button.dataset.action;
  try {
    if (action === "edit") {
      const donation = state.donations.find((d) => d.id === id);
      if (donation) openDonationForm(donation);
      return;
    }
    if (action === "claim") {
      if (!await confirmAction("Claim this donation?", "This reserves the full listed donation for your account. Confirm pickup arrangements with the donor.")) return;
      await api(`/claims/${id}`, { method: "POST", body: "{}" }); showToast("Donation claimed successfully.");
    } else if (action === "cancel-donation") {
      if (!await confirmAction("Cancel this listing?", "Recipients will no longer be able to claim this available donation.", "Cancel listing")) return;
      await api(`/donations/${id}`, { method: "DELETE" }); showToast("Donation listing cancelled.");
    } else if (action === "cancel-claim") {
      if (!await confirmAction("Cancel your claim?", "The donation may become available for another recipient.", "Cancel claim")) return;
      await api(`/claims/${id}/cancel`, { method: "PATCH", body: "{}" }); showToast("Claim cancelled.");
    } else if (action === "complete-claim") {
      if (!await confirmAction("Confirm collection?", "Only confirm after the recipient has collected the donation.", "Confirm collection")) return;
      await api(`/claims/${id}/complete`, { method: "PATCH", body: "{}" }); showToast("Collection recorded.");
    }
    await loadDashboard();
  } catch (error) { showNotice(error.message, "error"); }
}
async function bootstrap() {
  if (!state.token) { showView("home"); return; }
  try {
    const result = await api("/auth/me"); state.user = result.user; await loadDashboard();
  } catch { signOut(false); showView("home"); }
}

$("#hero-register").addEventListener("click", () => openAuth("register"));
$("#hero-login").addEventListener("click", () => openAuth("login"));
const ctaJoin = $("#cta-join");
if (ctaJoin) ctaJoin.addEventListener("click", () => openAuth("register"));
$('a[data-nav="home"]').addEventListener("click", (event) => { event.preventDefault(); if (state.user) loadDashboard(); else showView("home"); });
$('a[data-nav="dashboard"]').addEventListener("click", (event) => { event.preventDefault(); loadDashboard(); });
$("#tab-login").addEventListener("click", () => switchAuthTab("login"));
$("#tab-register").addEventListener("click", () => switchAuthTab("register"));
$("#logout-button").addEventListener("click", () => signOut(true));
$("#new-donation-button").addEventListener("click", () => openDonationForm());
$("#cancel-form-button").addEventListener("click", resetDonationForm);
$("#discard-form-button").addEventListener("click", resetDonationForm);

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = event.currentTarget; setBusy(form, true);
  try {
    const payload = Object.fromEntries(new FormData(form));
    const result = await api("/auth/login", { method: "POST", body: JSON.stringify(payload) });
    state.token = result.accessToken; state.user = result.user; sessionStorage.setItem("fdms_token", state.token);
    form.reset(); await loadDashboard();
  } catch (error) { showNotice(error.message, "error"); } finally { setBusy(form, false); }
});
$("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = event.currentTarget; setBusy(form, true);
  try {
    const result = await api("/auth/register", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    form.reset();
    if (result.requiresEmailConfirmation) {
      showNotice(result.message, "success"); switchAuthTab("login");
    } else {
      state.token = result.accessToken; state.user = result.user; sessionStorage.setItem("fdms_token", state.token); await loadDashboard();
    }
  } catch (error) { showNotice(error.message, "error"); } finally { setBusy(form, false); }
});
$("#donation-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = event.currentTarget; setBusy(form, true);
  try {
    const payload = formPayload(form);
    if (!Number.isFinite(new Date(payload.expiresAt).getTime())) throw new Error("Enter a valid use-by date and time.");
    const editing = Boolean(state.editingDonationId);
    await api(editing ? `/donations/${state.editingDonationId}` : "/donations", {
      method: editing ? "PATCH" : "POST", body: JSON.stringify(payload)
    });
    resetDonationForm(); showNotice(editing ? "Donation updated." : "Donation published successfully.", "success"); await loadDashboard();
  } catch (error) { showNotice(error.message, "error"); } finally { setBusy(form, false); }
});
$("#search-form").addEventListener("submit", async (event) => {
  event.preventDefault(); state.search = new FormData(event.currentTarget).get("search").trim(); await loadDashboard();
});
$("#clear-search").addEventListener("click", async () => { $("#search-form").reset(); state.search = ""; await loadDashboard(); });
$("#donations-list").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (button) handleCardAction(button);
});
$("#claims-list").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (button) handleCardAction(button);
});
$("#admin-users").addEventListener("change", async (event) => {
  const select = event.target.closest('select[data-action="role"]');
  if (!select) return;
  try {
    await api(`/admin/users/${select.dataset.id}/role`, { method: "PATCH", body: JSON.stringify({ role: select.value }) });
    showToast("Member role updated."); await loadDashboard();
  } catch (error) { showNotice(error.message, "error"); await loadDashboard(); }
});
window.addEventListener("hashchange", () => {
  if (location.hash === "#auth" && !state.user) openAuth("login");
  else if (location.hash === "#dashboard" && state.user) loadDashboard();
  else if (!location.hash || location.hash === "#home") { if (!state.user) showView("home"); }
});
bootstrap();
