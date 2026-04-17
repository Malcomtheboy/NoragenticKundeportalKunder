// Mohamed – kundeportal script.js
import { db } from "./firebase-auth.js";
import {
  collection,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const isLoginPage = !!document.getElementById("loginForm");
const isDashboardPage = !!document.getElementById("projectName");

/* ROUTE GUARD */
(function () {
  const path = window.location.pathname.toLowerCase();
  const loggedIn = localStorage.getItem("customer_logged_in") === "true";

  if (path.includes("index") && !loggedIn) {
    window.location.href = "login.html";
  }

  if (path.includes("login") && loggedIn) {
    window.location.href = "index.html";
  }
})();

/* LOGIN */
if (isLoginPage) {
  const form = document.getElementById("loginForm");
  const hint = document.getElementById("hint");

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    localStorage.setItem("customer_logged_in", "true");
    localStorage.setItem("role", "kunde"); // Mohamed – brukt av chat.js

    hint.textContent = "Logger inn...";

    setTimeout(() => {
      window.location.href = "index.html";
    }, 300);
  });
}

/* DASHBOARD */
if (isDashboardPage) {
  let projects = {};
  let currentProject = "p1";

  const projectName = document.getElementById("projectName");
  const projectGoal = document.getElementById("projectGoal");
  const tabs = document.querySelectorAll(".tab");
  const logoutBtn = document.getElementById("logoutBtn");
  const projectDescription = document.getElementById("projectDescription");
  const customerDescription = document.getElementById("customerDescription");

  function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderProject(project) {
    if (!project) return;
    projectName.textContent = project.name || "Ukjent prosjekt";
    projectGoal.textContent =
      project.goalText ||
      project.goal ||
      "Her kan prosjektets aktive delmål vises";
  }

  // Mohamed – last prosjekt- og kundebeskrivelse fra samme project-doc
  async function loadDescriptions(projectId) {
    if (!projectId) return;

    try {
      const projectSnap = await getDoc(doc(db, "projects", projectId));
      if (!projectSnap.exists()) return;

      const data = projectSnap.data();

      if (projectDescription) {
        projectDescription.innerHTML = escapeHtml(
          data.prosjektBeskrivelse ||
          data.description ||
          "Ingen prosjektbeskrivelse tilgjengelig."
        ).replace(/\n/g, "<br>");
      }

      if (customerDescription) {
        customerDescription.innerHTML = escapeHtml(
          data.kundeBeskrivelse ||
          data.customerDescription ||
          "Ingen kundebeskrivelse tilgjengelig."
        ).replace(/\n/g, "<br>");
      }
    } catch (error) {
      console.error("// Mohamed – Kunne ikke laste prosjektdata:", error);
    }
  }

  // Mohamed – sender valgt prosjekt til andre moduler
  function dispatchProject(project) {
    if (!project?.id) return;

    window.currentProjectId = project.id;
    window.dispatchEvent(
      new CustomEvent("projectChanged", {
        detail: { projectId: project.id }
      })
    );
  }

  // Mohamed – leser prosjekter fra Firestore og fyller tab-navn
  async function loadProjects() {
    try {
      const snapshot = await getDocs(collection(db, "projects"));
      const docs = [];

      snapshot.forEach((docSnap) => {
        docs.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });

      docs.sort((a, b) => (a.name || "").localeCompare(b.name || "", "no"));

      tabs.forEach((tab, index) => {
        const project = docs[index];
        if (!project) return;

        projects[tab.dataset.project] = project;
        tab.textContent = project.name || `Prosjekt ${index + 1}`;
      });

      const firstProject = projects[currentProject];
      if (firstProject) {
        renderProject(firstProject);
        await loadDescriptions(firstProject.id);
        dispatchProject(firstProject);
      }
    } catch (error) {
      console.error("// Mohamed – Kunne ikke laste prosjekter:", error);
    }
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", async () => {
      tabs.forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");

      currentProject = tab.dataset.project;
      const project = projects[currentProject];
      if (!project) return;

      renderProject(project);
      await loadDescriptions(project.id);
      dispatchProject(project);
    });
  });

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("customer_logged_in");
      localStorage.removeItem("role");
      window.location.href = "login.html";
    });
  }

  loadProjects();
}