import { auth, db } from "./firebase-auth.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const form = document.getElementById("loginForm");
const hint = document.getElementById("hint");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
      hint.textContent = "Fyll ut både e-post og passord.";
      return;
    }

    hint.textContent = "Logger inn...";

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        hint.textContent = "Fant ikke kundeinformasjon i databasen.";
        return;
      }

      const userData = userSnap.data();

      if (userData.role !== "customer") {
        hint.textContent = "Denne brukeren har ikke tilgang til kundeportalen.";
        return;
      }

      localStorage.setItem("customer_logged_in", "true");
      localStorage.setItem("customer_uid", user.uid);
      localStorage.setItem("customer_name", userData.name || "");
      localStorage.setItem("customer_email", userData.email || email);
      localStorage.setItem("customer_projectIds", JSON.stringify(userData.projectIds || []));

      hint.textContent = "Innlogging vellykket. Sender videre...";

      setTimeout(() => {
        window.location.href = "index.html";
      }, 300);

    } catch (error) {
      console.error("Customer login error:", error);
      hint.textContent = "Feil e-post eller passord.";
    }
  });
}