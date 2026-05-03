import { auth, db } from "./firebase-auth.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let currentUser = null;
let currentProjectId = null;
let currentProjectData = null;
let messagesUnsub = null;

const chatBox = document.getElementById("chatMessages");
const chatBoxBig = document.getElementById("chatMessagesBig");
const form = document.getElementById("chatForm");
const input = document.getElementById("chatInput");
const formBig = document.getElementById("chatFormBig");
const inputBig = document.getElementById("chatInputBig");
const modal = document.getElementById("chatModal");
const openBtn = document.getElementById("expandChat");
const closeBtn = document.getElementById("closeChat");
let activeMenu = null;
let editingMessageId = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return map[char];
  });
}

async function buildUser(user) {
  let firestoreData = {};

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists()) {
      firestoreData = userSnap.data() || {};
    }
  } catch (error) {
    console.error("Kunne ikke hente brukerdata:", error);
  }

  const authName = user.displayName?.trim() || "";
  const emailName = user.email?.includes("@") ? user.email.split("@")[0] : "";

  return {
    uid: user.uid,
    email: user.email || firestoreData.email || "",
    name: firestoreData.name || authName || emailName || "Kunde",
    role: firestoreData.role || "customer"
  };
}

function formatTime(value) {
  if (!value) return "";

  let date = null;

  if (typeof value?.toDate === "function") {
    date = value.toDate();
  } else if (typeof value === "number") {
    date = new Date(value);
  } else if (typeof value === "string") {
    date = new Date(value);
  }

  if (!date || Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (sameDay) {
    const time = date.toLocaleTimeString("no-NO", {
      hour: "2-digit",
      minute: "2-digit"
    });
    return `I dag ${time}`;
  }

  if (isYesterday) {
    const time = date.toLocaleTimeString("no-NO", {
      hour: "2-digit",
      minute: "2-digit"
    });
    return `I går ${time}`;
  }

  return date.toLocaleString("no-NO", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function closeActiveMenu() {
  if (!activeMenu) return;
  activeMenu.classList.remove("active");
  activeMenu = null;
}

async function editMessage(messageId, currentText) {
  editingMessageId = messageId;
  closeActiveMenu();
  loadChat();
}

async function saveEditedMessage(messageId, source) {
  const nextText = source?.value?.trim();
  if (!nextText) return;

  try {
    await updateDoc(doc(db, "messages", messageId), {
      text: nextText,
      editedAt: serverTimestamp()
    });
    editingMessageId = null;
  } catch (error) {
    console.error("Kunne ikke redigere melding:", error);
    alert("Kunne ikke redigere melding.");
  }
}

async function deleteMessage(messageId) {
  const confirmed = confirm("Vil du slette denne meldingen?");
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "messages", messageId));
  } catch (error) {
    console.error("Kunne ikke slette melding:", error);
    alert("Kunne ikke slette melding.");
  }
}

function renderSystemMessage(text) {
  const html = `<div class="msg other">${escapeHtml(text)}</div>`;
  if (chatBox) chatBox.innerHTML = html;
  if (chatBoxBig) chatBoxBig.innerHTML = html;
}

function clearMessages() {
  if (chatBox) chatBox.innerHTML = "";
  if (chatBoxBig) chatBoxBig.innerHTML = "";
}

function scrollToBottom() {
  if (chatBox) {
    chatBox.scrollTop = chatBox.scrollHeight;
  }
  if (chatBoxBig) {
    chatBoxBig.scrollTop = chatBoxBig.scrollHeight;
  }
}

function renderMsg(msg = {}) {
  const div = document.createElement("div");
  const isMe = msg.uid === currentUser?.uid;
  const isEditing = editingMessageId === msg.id;

  div.classList.add("msg", isMe ? "me" : "other");

  const head = document.createElement("div");
  head.className = "msg-head";

  const name = document.createElement("div");
  name.className = "msg-name";
  name.textContent = msg.username || "Ukjent bruker";
  head.appendChild(name);

  if (isMe && msg.id) {
    const actions = document.createElement("div");
    actions.className = "msg-actions";

    const menuBtn = document.createElement("button");
    menuBtn.type = "button";
    menuBtn.className = "msg-menu-btn";
    menuBtn.setAttribute("aria-label", "Meldingsvalg");
    menuBtn.textContent = "⋯";

    const menu = document.createElement("div");
    menu.className = "msg-menu";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Rediger";
    editBtn.addEventListener("click", async () => {
      closeActiveMenu();
      await editMessage(msg.id, msg.text || "");
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger";
    deleteBtn.textContent = "Slett";
    deleteBtn.addEventListener("click", async () => {
      closeActiveMenu();
      await deleteMessage(msg.id);
    });

    menuBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const willOpen = !menu.classList.contains("active");
      closeActiveMenu();
      if (willOpen) {
        menu.classList.add("active");
        activeMenu = menu;
      }
    });

    menu.append(editBtn, deleteBtn);
    actions.append(menuBtn, menu);
    head.appendChild(actions);
  }

  div.appendChild(head);

  if (isEditing) {
    const editor = document.createElement("textarea");
    editor.className = "msg-edit-input";
    editor.value = msg.text || "";

    const editActions = document.createElement("div");
    editActions.className = "msg-edit-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "secondary";
    cancelBtn.textContent = "Avbryt";
    cancelBtn.addEventListener("click", () => {
      editingMessageId = null;
      loadChat();
    });

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "Lagre";
    saveBtn.addEventListener("click", async () => {
      await saveEditedMessage(msg.id, editor);
    });

    editor.addEventListener("keydown", async (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        await saveEditedMessage(msg.id, editor);
      }
    });

    editActions.append(cancelBtn, saveBtn);
    div.append(editor, editActions);
    setTimeout(() => {
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
    }, 0);
  } else {
    const text = document.createElement("div");
    text.className = "msg-text";
    text.textContent = msg.text || "";

    const time = document.createElement("div");
    time.className = "msg-time";
    time.textContent = formatTime(msg.createdAt || msg.time);

    div.append(text, time);
  }

  return div;
}

async function loadProject(projectId) {
  const projectSnap = await getDoc(doc(db, "projects", projectId));

  if (!projectSnap.exists()) {
    currentProjectData = null;
    renderSystemMessage("Fant ikke prosjektet.");
    return false;
  }

  currentProjectData = projectSnap.data() || {};

  const hasAccess =
    Array.isArray(currentProjectData.customerIds) &&
    currentProjectData.customerIds.includes(currentUser.uid);

  if (!hasAccess) {
    renderSystemMessage("Du har ikke tilgang til denne prosjektchatten.");
    return false;
  }

  return true;
}

function loadChat() {
  if (messagesUnsub) {
    messagesUnsub();
    messagesUnsub = null;
  }

  clearMessages();

  if (!currentProjectId) {
    renderSystemMessage("Velg et prosjekt.");
    return;
  }

  const messagesQuery = query(
    collection(db, "messages"),
    where("projectId", "==", currentProjectId)
  );

  messagesUnsub = onSnapshot(
    messagesQuery,
    (snapshot) => {
      clearMessages();

      const messages = [];

      snapshot.forEach((docSnap) => {
        messages.push({ id: docSnap.id, ...docSnap.data() });
      });

      messages.sort((a, b) => {
        const aTime =
          typeof a.createdAt?.toMillis === "function"
            ? a.createdAt.toMillis()
            : Number(a.time || 0);

        const bTime =
          typeof b.createdAt?.toMillis === "function"
            ? b.createdAt.toMillis()
            : Number(b.time || 0);

        return aTime - bTime;
      });

      if (messages.length === 0) {
        renderSystemMessage("Ingen meldinger ennå.");
        return;
      }

      clearMessages();
      messages.forEach((msg) => {
        if (chatBox) chatBox.appendChild(renderMsg(msg));
        if (chatBoxBig) chatBoxBig.appendChild(renderMsg(msg));
      });

      scrollToBottom();
    },
    (error) => {
      console.error("Kunne ikke laste chat:", error);
      renderSystemMessage("Kunne ikke laste chat.");
    }
  );
}

async function sendMessage(text) {
  if (!text || !currentUser || !currentProjectId || !currentProjectData) return;

  const hasAccess =
    Array.isArray(currentProjectData.customerIds) &&
    currentProjectData.customerIds.includes(currentUser.uid);

  if (!hasAccess) {
    alert("Du har ikke tilgang til denne chatten.");
    return;
  }

  try {
    await addDoc(collection(db, "messages"), {
      projectId: currentProjectId,
      text,
      username: currentUser.name,
      uid: currentUser.uid,
      email: currentUser.email,
      createdAt: serverTimestamp(),
      time: Date.now()
    });
  } catch (error) {
    console.error("Kunne ikke sende melding:", error);
    alert("Kunne ikke sende melding.");
  }
}

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const text = input.value.trim();
    if (!text) return;

    await sendMessage(text);
    input.value = "";
    if (inputBig) inputBig.value = "";
  });
}

if (formBig) {
  formBig.addEventListener("submit", async (e) => {
    e.preventDefault();

    const text = inputBig.value.trim();
    if (!text) return;

    await sendMessage(text);
    inputBig.value = "";
    if (input) input.value = "";
  });
}

if (openBtn && modal) {
  openBtn.addEventListener("click", () => {
    modal.classList.add("active");
  });
}

if (closeBtn && modal) {
  closeBtn.addEventListener("click", () => {
    modal.classList.remove("active");
  });
}

if (modal) {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.classList.remove("active");
    }
  });
}

window.addEventListener("projectChanged", async (event) => {
  if (!currentUser) return;

  currentProjectId = event.detail?.projectId || null;
  currentProjectData = null;

  if (!currentProjectId) {
    renderSystemMessage("Velg et prosjekt.");
    return;
  }

  const ok = await loadProject(currentProjectId);
  if (!ok) return;

  loadChat();
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUser = null;
    renderSystemMessage("Du må logge inn.");
    return;
  }

  currentUser = await buildUser(user);

  if (window.currentProjectId) {
    currentProjectId = window.currentProjectId;
    const ok = await loadProject(currentProjectId);
    if (ok) {
      loadChat();
    }
  }
});

document.addEventListener("click", () => {
  closeActiveMenu();
});
