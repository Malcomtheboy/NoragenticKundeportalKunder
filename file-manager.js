// Mohamed – kundeportal file-manager.js
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyB-0bWNNs2LgzAm48-Kymlzu1aEzWQXiNw",
  authDomain: "noragenticportal.firebaseapp.com",
  projectId: "noragenticportal",
  storageBucket: "noragenticportal.firebasestorage.app",
  messagingSenderId: "662374310916",
  appId: "1:662374310916:web:a3a5d708bdd380a7210151",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const breadcrumbBar = document.getElementById("breadcrumbBar");
const contentsList = document.getElementById("contentsList");
const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const newFolderBtn = document.getElementById("newFolderBtn");

let currentProjectId = null;
let currentFolderId = null;
let currentPath = [{ id: null, name: "Hjem" }];

function formatDate(timestamp) {
  if (!timestamp) return "-";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString("no-NO");
}

function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function ensureFirebaseLogin() {
  return;
}

function renderBreadcrumbs() {
  if (!breadcrumbBar) return;

  const html = currentPath.map((segment, index) => {
    const isLast = index === currentPath.length - 1;

    if (isLast) {
      return `<span class="breadcrumb-current">${escapeHtml(segment.name)}</span>`;
    }

    return `
      <button class="breadcrumb-link" data-path-index="${index}">
        ${escapeHtml(segment.name)}
      </button>
      <span class="breadcrumb-separator">/</span>
    `;
  }).join("");

  breadcrumbBar.innerHTML = html;

  breadcrumbBar.querySelectorAll("[data-path-index]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const index = Number(btn.dataset.pathIndex);
      currentPath = currentPath.slice(0, index + 1);
      currentFolderId = currentPath[currentPath.length - 1].id;
      renderBreadcrumbs();
      await loadContents();
    });
  });
}

async function loadContents() {
  if (!currentProjectId || !contentsList) return;

  contentsList.className = "loading-state";
  contentsList.innerHTML = "Laster...";

  try {
    const foldersQuery = query(
      collection(db, "folders"),
      where("projectId", "==", currentProjectId),
      where("parentFolderId", "==", currentFolderId)
    );

    const filesQuery = query(
      collection(db, "files"),
      where("projectId", "==", currentProjectId),
      where("folderId", "==", currentFolderId)
    );

    const [foldersSnapshot, filesSnapshot] = await Promise.all([
      getDocs(foldersQuery),
      getDocs(filesQuery)
    ]);

    const folders = [];
    const files = [];

    foldersSnapshot.forEach((docSnap) => {
      folders.push({ id: docSnap.id, ...docSnap.data() });
    });

    filesSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const isVisible = data.customerVisibility !== false && data.visibleToClient !== false;
      if (!isVisible) return;
      files.push({ id: docSnap.id, ...data });
    });

    folders.sort((a, b) => (a.name || "").localeCompare(b.name || "", "no"));
    files.sort((a, b) => {
      const aSec = a.dateUploaded?.seconds || a.createdAt?.seconds || 0;
      const bSec = b.dateUploaded?.seconds || b.createdAt?.seconds || 0;
      return bSec - aSec;
    });

    if (folders.length === 0 && files.length === 0) {
      contentsList.className = "empty-state";
      contentsList.innerHTML = "Denne mappen er tom.";
      return;
    }

    let html = `
      <div class="table-wrap">
        <table class="files-table">
          <thead>
            <tr>
              <th>Navn</th>
              <th>Type</th>
              <th>Lastet opp</th>
              <th>Av</th>
            </tr>
          </thead>
          <tbody>
    `;

    folders.forEach((folder) => {
      html += `
        <tr>
          <td>
            <button
              class="link-button"
              data-folder-id="${folder.id}"
              data-folder-name="${escapeHtml(folder.name || "")}"
            >
              ${escapeHtml(folder.name || "-")}
            </button>
          </td>
          <td>Mappe</td>
          <td>${formatDate(folder.createdAt)}</td>
          <td>${escapeHtml(folder.createdBy || "-")}</td>
        </tr>
      `;
    });

    files.forEach((file) => {
      const filename = file.filename || file.fileName || "-";
      const fileDate = file.dateUploaded || file.createdAt;

      const nameCell = file.fileUrl
        ? `<a class="file-link" href="${escapeHtml(file.fileUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(filename)}</a>`
        : escapeHtml(filename);

      html += `
        <tr>
          <td>${nameCell}</td>
          <td>Fil</td>
          <td>${formatDate(fileDate)}</td>
          <td>${escapeHtml(file.uploadedBy || "-")}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    contentsList.className = "";
    contentsList.innerHTML = html;

    contentsList.querySelectorAll("[data-folder-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        currentFolderId = btn.dataset.folderId;
        currentPath.push({
          id: btn.dataset.folderId,
          name: btn.dataset.folderName
        });
        renderBreadcrumbs();
        await loadContents();
      });
    });
  } catch (e) {
    console.error("// Mohamed – Load contents error:", e);
    contentsList.className = "error-state";
    contentsList.innerHTML = "Kunne ikke laste filer.";
  }
}

// Mohamed – kunde kan laste opp egne filer, men bare til prosjektet sitt
async function uploadSelectedFile(file) {
  if (!file || !currentProjectId) return;

  try {
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.textContent = "Laster opp...";
    }

    const storagePath = `projects/${currentProjectId}/${currentFolderId || "root"}/${file.name}`;
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);

    await addDoc(collection(db, "files"), {
      filename: file.name,
      fileName: file.name,
      fileUrl: downloadURL,
      projectId: currentProjectId,
      folderId: currentFolderId || null,
      uploadedBy: "Kunde",
      customerVisibility: true,
      visibleToClient: true,
      storagePath,
      dateUploaded: serverTimestamp(),
      createdAt: serverTimestamp()
    });

    fileInput.value = "";
    await loadContents();
  } catch (e) {
    console.error("// Mohamed – Upload error:", e);
    alert("Feil ved opplasting.");
  } finally {
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Last opp";
    }
  }
}

// Mohamed – kunde kan opprette mapper i sin prosjektvisning
async function createFolder() {
  if (!currentProjectId) return;

  const folderName = prompt("Skriv navn på ny mappe:");
  if (!folderName || !folderName.trim()) return;

  try {
    await addDoc(collection(db, "folders"), {
      name: folderName.trim(),
      projectId: currentProjectId,
      parentFolderId: currentFolderId || null,
      createdBy: "Kunde",
      createdAt: serverTimestamp()
    });

    await loadContents();
  } catch (e) {
    console.error("// Mohamed – Create folder error:", e);
    alert("Kunne ikke opprette mappe.");
  }
}

if (uploadBtn && fileInput) {
  uploadBtn.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    await uploadSelectedFile(file);
  });
}

if (newFolderBtn) {
  newFolderBtn.addEventListener("click", async () => {
    await createFolder();
  });
}

window.addEventListener("projectChanged", async (event) => {
  currentProjectId = event.detail.projectId;

  await ensureFirebaseLogin();

  currentFolderId = null;
  currentPath = [{ id: null, name: "Hjem" }];
  renderBreadcrumbs();
  await loadContents();
});

async function initFileManager() {
  await ensureFirebaseLogin();

  if (window.currentProjectId) {
    currentProjectId = window.currentProjectId;
    currentFolderId = null;
    currentPath = [{ id: null, name: "Hjem" }];
    renderBreadcrumbs();
    await loadContents();
  }
}

initFileManager();
