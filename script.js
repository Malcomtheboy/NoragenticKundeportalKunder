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

  const projects = {
    p1: { name: "Prosjekt 1", goal: "Prototype utvikling", id: "PROJECT_ABC_123" }, // @aslak lagt til id
    p2: { name: "Prosjekt 2", goal: "Backend integrasjon", id: "PROJECT_DEF_456" }, // @aslak
    p3: { name: "Prosjekt 3", goal: "Testing fase", id: "PROJECT_GHI_789" } // @aslak
  };

  let currentProject = "p1";

  const projectName = document.getElementById("projectName");
  const projectGoal = document.getElementById("projectGoal");
  const tabs = document.querySelectorAll(".tab");
  const logoutBtn = document.getElementById("logoutBtn");

  function renderProject(p) {
    projectName.textContent = p.name;
    projectGoal.textContent = p.goal;
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
      renderProject(projects[currentProject]);

      //@aslak oppdater filer når prosjekt byttes
      updateFileManager(projects[currentProject].id);
    });
  });

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("customer_logged_in");
    window.location.href = "login.html";
  });

  renderProject(projects[currentProject]);

  // @aslak last filer for første prosjekt ved oppstart
  updateFileManager(projects[currentProject].id);
}