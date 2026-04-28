import { auth, db } from "./firebase-auth.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const projectSelectorContainer = document.getElementById("projectSelectorContainer");
const projectGoal = document.getElementById("projectGoal");
const logoutBtn = document.getElementById("logoutBtn");
const projectDescription = document.getElementById("projectDescription");
const customerDescription = document.getElementById("customerDescription");
const projectTabs = document.getElementById("projectTabs");

function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

onAuthStateChanged(auth, async (user) => {
  const path = window.location.pathname.toLowerCase();
  const onLogin = path.endsWith("login.html");
  const onDashboard = path.endsWith("index.html") || path.endsWith("/");

  if (onDashboard && !user) {
    window.location.href = "login.html";
    return;
  }

  if (onLogin && user) {
    window.location.href = "index.html";
    return;
  }

  if (onDashboard && user) {
    await loadCustomerPortal(user);
  }
});

async function loadCustomerPortal(user) {
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));

    if (!userSnap.exists()) {
      showNoProject("Fant ikke kundeinformasjon.");
      return;
    }

    const userData = userSnap.data();

    if (userData.role !== "customer") {
      showNoProject("Denne brukeren har ikke tilgang til kundeportalen.");
      return;
    }

    const projectIds = userData.projectIds || [];
    const projects = [];

    for (const projectId of projectIds) {
      const projectSnap = await getDoc(doc(db, "projects", projectId));

      if (projectSnap.exists()) {
        projects.push({
          id: projectSnap.id,
          ...projectSnap.data()
        });
      }
    }

    if (!projects.length) {
      showNoProject("Du har ingen prosjekter tilknyttet.");
      return;
    }

    renderProjectSelector(projects);
    setActiveProject(projects[0]);

  } catch (error) {
    console.error("Kundeportal error:", error);
    showNoProject("Kunne ikke laste prosjektdata.");
  }
}

function renderProjectSelector(projects) {
  if (!projectSelectorContainer) return;

  if (projectTabs) {
    projectTabs.classList.add("hidden");
    projectTabs.innerHTML = "";
  }

  if (projects.length === 1) {
    projectSelectorContainer.innerHTML = `
      <div class="big">${escapeHtml(projects[0].name || "Uten navn")}</div>
    `;
    return;
  }

  projectSelectorContainer.innerHTML = `
    <select id="projectSelector" class="project-dropdown">
      ${projects.map(project => `
        <option value="${escapeHtml(project.id)}">
          ${escapeHtml(project.name || "Uten navn")}
        </option>
      `).join("")}
    </select>
  `;

  const select = document.getElementById("projectSelector");

  if (select) {
    select.addEventListener("change", () => {
      const selectedProject = projects.find(project => project.id === select.value);
      setActiveProject(selectedProject);
    });
  }
}

function setActiveProject(project) {
  if (!project) return;

  if (projectGoal) {
    projectGoal.textContent = project.goal || project.goalText || "Ingen delmål registrert.";
  }

  if (projectDescription) {
    projectDescription.innerHTML = escapeHtml(
      project.description ||
      project.prosjektBeskrivelse ||
      "Ingen prosjektbeskrivelse tilgjengelig."
    ).replace(/\n/g, "<br>");
  }

  if (customerDescription) {
    customerDescription.innerHTML = escapeHtml(
      project.customerDescription ||
      project.kundeBeskrivelse ||
      "Ingen kundebeskrivelse tilgjengelig."
    ).replace(/\n/g, "<br>");
  }

  window.currentProjectId = project.id;

  window.dispatchEvent(
    new CustomEvent("projectChanged", {
      detail: {
        projectId: project.id,
        projectData: project
      }
    })
  );
}

function showNoProject(message) {
  if (projectSelectorContainer) {
    projectSelectorContainer.innerHTML = `<div class="big">Ingen prosjekter</div>`;
  }

  if (projectGoal) {
    projectGoal.textContent = message;
  }

  if (projectTabs) {
    projectTabs.classList.add("hidden");
  }
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);

    localStorage.removeItem("customer_logged_in");
    localStorage.removeItem("customer_uid");
    localStorage.removeItem("customer_name");
    localStorage.removeItem("customer_email");
    localStorage.removeItem("customer_projectIds");
    localStorage.removeItem("role");

    window.location.href = "login.html";
  });
}