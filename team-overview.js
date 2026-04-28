import { auth, db } from "./firebase-auth.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const teamPlaceholder = document.getElementById("teamPlaceholder");

function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeRole(role) {
  if (!role) return "Ansatt";
  if (role === "owner") return "Owner";
  if (role === "employee") return "Ansatt";
  return role;
}

function getInitials(name) {
  if (!name || !name.trim()) return "U";

  return name
    .trim()
    .split(/\s+/)
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isUserOnProject(user, projectId) {
  if (!user || !projectId) return false;

  if (Array.isArray(user.projectIds) && user.projectIds.includes(projectId)) {
    return true;
  }

  if (typeof user.projectId === "string" && user.projectId === projectId) {
    return true;
  }

  return false;
}

async function ensureFirebaseLogin() {
  return;
}

function renderLoading() {
  if (!teamPlaceholder) return;
  teamPlaceholder.className = "team-loading";
  teamPlaceholder.innerHTML = "Laster ansatte...";
}

function renderError() {
  if (!teamPlaceholder) return;
  teamPlaceholder.className = "team-error";
  teamPlaceholder.innerHTML = "Kunne ikke laste ansatte.";
}

function renderEmpty() {
  if (!teamPlaceholder) return;
  teamPlaceholder.className = "team-empty";
  teamPlaceholder.innerHTML = "Ingen ansatte er koblet til dette prosjektet ennå.";
}

function renderMembers(members) {
  if (!teamPlaceholder) return;

  const html = `
    <div class="team-list">
      ${members.map((member) => {
        const initials = getInitials(member.name);

        return `
          <div class="team-member">
            <div class="team-member-main">
              <div class="team-avatar">${escapeHtml(initials)}</div>

              <div class="team-member-info">
                <div class="team-member-name">
                  ${escapeHtml(member.name || "Ukjent navn")}
                </div>
                <div class="team-member-meta">
                  ${escapeHtml(member.email || "Ingen e-post registrert")}
                </div>
              </div>
            </div>

            <div class="team-member-role">
              ${escapeHtml(normalizeRole(member.role))}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;

  teamPlaceholder.className = "";
  teamPlaceholder.innerHTML = html;
}

async function loadTeamOverview(projectId) {
  if (!projectId || !teamPlaceholder) return;

  renderLoading();

  try {
    await ensureFirebaseLogin();

    const snapshot = await getDocs(collection(db, "users"));
    const members = [];

    snapshot.forEach((docSnap) => {
      const user = docSnap.data();

      const isAllowedRole =
        user.role === "employee" || user.role === "owner";

      if (!isAllowedRole) return;
      if (!isUserOnProject(user, projectId)) return;

      members.push({
        id: docSnap.id,
        name: user.name || "",
        email: user.email || "",
        role: user.role || "employee"
      });
    });

    members.sort((a, b) =>
      (a.name || "").localeCompare((b.name || ""), "no")
    );

    if (members.length === 0) {
      renderEmpty();
      return;
    }

    renderMembers(members);
  } catch (error) {
    console.error("Team overview error:", error);
    renderError();
  }
}

window.addEventListener("projectChanged", async (event) => {
  const projectId = event.detail?.projectId;
  await loadTeamOverview(projectId);
});

async function initTeamOverview() {
  if (window.currentProjectId) {
    await loadTeamOverview(window.currentProjectId);
  }
}

initTeamOverview();