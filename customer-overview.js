import { db } from "./firebase-auth.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const customerPlaceholder = document.getElementById("customerPlaceholder");

function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getInitials(name) {
  if (!name || !name.trim()) return "K";

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

function renderLoading() {
  if (!customerPlaceholder) return;
  customerPlaceholder.className = "team-loading";
  customerPlaceholder.innerHTML = "Laster kunder...";
}

function renderError() {
  if (!customerPlaceholder) return;
  customerPlaceholder.className = "team-error";
  customerPlaceholder.innerHTML = "Kunne ikke laste kunder.";
}

function renderEmpty() {
  if (!customerPlaceholder) return;
  customerPlaceholder.className = "team-empty";
  customerPlaceholder.innerHTML = "Ingen kunder er koblet til dette prosjektet ennå.";
}

function renderMembers(members) {
  if (!customerPlaceholder) return;

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
              Kunde
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;

  customerPlaceholder.className = "";
  customerPlaceholder.innerHTML = html;
}

async function loadCustomerOverview(projectId) {
  if (!projectId || !customerPlaceholder) return;

  renderLoading();

  try {
    const snapshot = await getDocs(collection(db, "users"));
    const members = [];

    snapshot.forEach((docSnap) => {
      const user = docSnap.data();

      if (user.role !== "customer") return;
      if (!isUserOnProject(user, projectId)) return;

      members.push({
        id: docSnap.id,
        name: user.name || "",
        email: user.email || ""
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
    console.error("Customer overview error:", error);
    renderError();
  }
}

window.addEventListener("projectChanged", async (event) => {
  const projectId = event.detail?.projectId;
  await loadCustomerOverview(projectId);
});

async function initCustomerOverview() {
  if (window.currentProjectId) {
    await loadCustomerOverview(window.currentProjectId);
  }
}

initCustomerOverview();
