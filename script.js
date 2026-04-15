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
  const projectTabs = document.querySelectorAll(".tab");


  function renderProject(p) {
  projectName.textContent = p.name;
  projectGoal.textContent = p.goal;
}

async function loadDescriptions(projectId) {
  if (!projectId) return;

  try {
    const projectSnap = await getDoc(doc(db, "projects", projectId));
    if (!projectSnap.exists()) return;

    const data = projectSnap.data();

    if (projectDescription) {
      projectDescription.textContent = data.prosjektBeskrivelse || "";
    }

    if (customerDescription) {
      customerDescription.textContent = data.kundeBeskrivelse || "";
    }
  } catch (error) {
    console.error("Kunne ikke laste prosjektdata:", error);
  }
}
async function loadProjects() {
  const snapshot = await getDocs(collection(db, "projects"));
  const docs = [];

  snapshot.forEach((docSnap) => {
    docs.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  docs.sort((a, b) => (a.name || "").localeCompare(b.name || "", "no"));

  projectTabs.forEach((tab, index) => {
    const project = docs[index];
    if (!project) return;

    projects[tab.dataset.project] = project;
    tab.textContent = project.name || `Prosjekt ${index + 1}`;
  });

  if (projects[currentProject]) {
    renderProject(projects[currentProject]);
    loadDescriptions(projects[currentProject].id);
    updateFileManager(projects[currentProject].id);
  }
}



  // @aslak denne funksjone sender valgt prosjekt til file-manager.js
  function updateFileManager(projectId) {
        window.currentProjectId = projectId;

        window.dispatchEvent(
            new CustomEvent("projectChanged", {
            detail: { projectId }
      })
    );
  }

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("is-active"));
      tab.classList.add("is-active");

     currentProject = tab.dataset.project;

const project = projects[currentProject];
if (!project) return;

renderProject(project);
loadDescriptions(project.id);

//@aslak oppdater filer når prosjekt byttes
updateFileManager(project.id);
 });
});
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("customer_logged_in");
    window.location.href = "login.html";
  });

 loadProjects();
 }