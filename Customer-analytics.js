// Mohamed – customer-analytics.js
// Kunde kan kun lese analysemodulen.
// Data hentes fra samme Firebase som ansattportalen.
// Samsvarer med ansatt sin analytics.js, men uten admin/redigering.

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB-0bWNNs2LgzAm48-Kymlzu1aEzWQXiNw",
  authDomain: "noragenticportal.firebaseapp.com",
  databaseURL: "https://noragenticportal-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "noragenticportal",
  storageBucket: "noragenticportal.firebasestorage.app",
  messagingSenderId: "662374310916",
  appId: "1:662374310916:web:a3a5d708bdd380a7210151"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

/* =========================================================
   HJELPEFUNKSJONER
========================================================= */
const WEEK_DAY_LABELS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

function getWeekStart() {
  const d = new Date();
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDayIndexFromDate(date) {
  return date.getDay() === 0 ? 6 : date.getDay() - 1;
}

function getTodayWeekIndex() {
  const day = new Date().getDay();
  return day === 0 ? 6 : day - 1;
}

function formatDateNo(dateLike) {
  if (!dateLike) return "Ikke satt";
  const date = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "Ikke satt";
  return date.toLocaleDateString("no-NO");
}

function daysSince(dateLike) {
  if (!dateLike) return null;
  const date = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function getFileDate(data) {
  return (
    data.createdAt?.toDate?.() ||
    data.dateUploaded?.toDate?.() ||
    data.uploadedAt?.toDate?.() ||
    data.created_at?.toDate?.() ||
    (data.createdAt?.seconds ? new Date(data.createdAt.seconds * 1000) : null) ||
    (data.dateUploaded?.seconds ? new Date(data.dateUploaded.seconds * 1000) : null) ||
    null
  );
}

/* =========================================================
   STATE
========================================================= */
let _state = {
  progressPct: 0,
  weekDescription: "Ingen ukesstatus lagt inn ennå.",
  goalText: "Laster delmål…",
  startedAt: null,
  daysUsed: 0,
  durationDays: 90,
  daysLeft: 90,

  totalFiles: 0,
  filesThisWeek: 0,
  messagesCount: 0,
  weeklyFileCounts: [0, 0, 0, 0, 0, 0, 0],

  milestones: [],
  milestonesDone: 0,
  milestonesTotal: 0,
  currentMilestone: "Ikke satt",
  nextMilestoneDate: null,
  milestoneRisk: "low",
  milestoneRiskLabel: "Lav risiko",

  latestFileAt: null,
  latestMessageAt: null,
  latestProgressAt: null,

  activityLabel: "Lav aktivitet",
  activityTone: "low",
  summaryText: "Ingen oppsummering tilgjengelig.",
  alerts: []
};

let _unsubs = [];

function stopAll() {
  _unsubs.forEach(u => u());
  _unsubs = [];
}

/* =========================================================
   DERIVED STATE
========================================================= */
function recomputeDerivedState() {
  _state.daysLeft = Math.max(0, (_state.durationDays || 0) - (_state.daysUsed || 0));

  const milestones = Array.isArray(_state.milestones) ? _state.milestones : [];
  const total = milestones.length;
  const done = milestones.filter(m => m.done).length;

  _state.milestonesTotal = total;
  _state.milestonesDone = done;
  _state.progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  const next = milestones.find(m => !m.done);
  _state.currentMilestone = next?.title || (total > 0 ? "Alle milepæler fullført ✓" : "Ingen milepæler");
  _state.nextMilestoneDate = next?.date || null;

  let daysToNext = null;
  if (_state.nextMilestoneDate) {
    const mDate = _state.nextMilestoneDate?.toDate
      ? _state.nextMilestoneDate.toDate()
      : new Date(_state.nextMilestoneDate);
    daysToNext = Math.ceil((mDate.getTime() - Date.now()) / 86400000);
  }

  const pct = _state.progressPct;

  if (done === total && total > 0) {
    _state.milestoneRisk = "low";
    _state.milestoneRiskLabel = "Alle milepæler fullført ✓";
  } else if (daysToNext !== null && daysToNext <= 0) {
    _state.milestoneRisk = "high";
    _state.milestoneRiskLabel = "Milepæl overskredet!";
  } else if (daysToNext !== null && daysToNext <= 7 && pct < 75) {
    _state.milestoneRisk = "high";
    _state.milestoneRiskLabel = "Høy risiko";
  } else if (daysToNext !== null && daysToNext <= 14 && pct < 50) {
    _state.milestoneRisk = "medium";
    _state.milestoneRiskLabel = "Moderat risiko";
  } else {
    _state.milestoneRisk = "low";
    _state.milestoneRiskLabel = "Lav risiko";
  }

  const filesThisWeek = _state.filesThisWeek || 0;
  const messagesThisWeek = _state.messagesCount || 0;
  const activityScore = filesThisWeek + messagesThisWeek;

  if (activityScore >= 8) {
    _state.activityLabel = "Høy aktivitet";
    _state.activityTone = "high";
  } else if (activityScore >= 3) {
    _state.activityLabel = "Moderat aktivitet";
    _state.activityTone = "medium";
  } else {
    _state.activityLabel = "Lav aktivitet";
    _state.activityTone = "low";
  }

  const alerts = [];

  if (messagesThisWeek === 0) alerts.push("Ingen nye meldinger denne uken.");
  if (filesThisWeek === 0) alerts.push("Ingen nye filer denne uken.");

  const expectedPct = _state.durationDays > 0
    ? Math.round((_state.daysUsed / _state.durationDays) * 100)
    : 0;

  if (pct + 10 < expectedPct) {
    alerts.push("Fremdriften ligger bak forventet nivå basert på tidsbruk.");
  }

  if (_state.milestoneRisk === "high" && done < total) {
    alerts.push(`Milepæl-risiko: ${_state.milestoneRiskLabel} – ${done} av ${total} milepæler fullført.`);
  } else if (_state.milestoneRisk === "medium") {
    alerts.push(`Milepæl-risiko: ${_state.milestoneRiskLabel} – ${done} av ${total} milepæler fullført.`);
  }

  const noFilesDays = daysSince(_state.latestFileAt);
  const noMsgDays = daysSince(_state.latestMessageAt);
  const noProgressDays = daysSince(_state.latestProgressAt);

  if (noFilesDays !== null && noFilesDays >= 7) alerts.push(`Ingen nye filer de siste ${noFilesDays} dagene.`);
  if (noMsgDays !== null && noMsgDays >= 7) alerts.push(`Ingen meldinger de siste ${noMsgDays} dagene.`);
  if (noProgressDays !== null && noProgressDays >= 7) alerts.push(`Milepæler ikke oppdatert på ${noProgressDays} dager.`);

  _state.alerts = alerts;

  _state.summaryText = [
    `Prosjektet er ${pct}% ferdig (${done} av ${total} milepæler fullført).`,
    `${_state.daysUsed} dager er brukt og ${_state.daysLeft} dager gjenstår.`,
    `Aktivitetsnivået denne uken er ${_state.activityLabel.toLowerCase()}.`,
    filesThisWeek > 0 ? `${filesThisWeek} nye filer lastet opp.` : "",
    messagesThisWeek > 0 ? `${messagesThisWeek} meldinger sendt.` : ""
  ].filter(Boolean).join(" ");
}

/* =========================================================
   LIVE-LYTTERE
========================================================= */
function startLiveAnalytics(projectId) {
  stopAll();

  _state = {
    progressPct: 0,
    weekDescription: "Ingen ukesstatus lagt inn ennå.",
    goalText: "Laster delmål…",
    startedAt: null,
    daysUsed: 0,
    durationDays: 90,
    daysLeft: 90,

    totalFiles: 0,
    filesThisWeek: 0,
    messagesCount: 0,
    weeklyFileCounts: [0, 0, 0, 0, 0, 0, 0],

    milestones: [],
    milestonesDone: 0,
    milestonesTotal: 0,
    currentMilestone: "Ikke satt",
    nextMilestoneDate: null,
    milestoneRisk: "low",
    milestoneRiskLabel: "Lav risiko",

    latestFileAt: null,
    latestMessageAt: null,
    latestProgressAt: null,

    activityLabel: "Lav aktivitet",
    activityTone: "low",
    summaryText: "Ingen oppsummering tilgjengelig.",
    alerts: []
  };

  showLoading();

  // Mohamed – prosjektdokument fra samme Firebase som ansatt
  _unsubs.push(onSnapshot(
    doc(db, "projects", projectId),
    (snap) => {
      if (snap.exists()) {
        const d = snap.data();

        if (d.startedAt?.toDate) {
          _state.startedAt = d.startedAt.toDate();
          _state.daysUsed = Math.max(
            0,
            Math.floor((Date.now() - _state.startedAt.getTime()) / 86400000)
          );
        }

        if (typeof d.durationDays === "number") _state.durationDays = d.durationDays;
        if (d.weekNote) _state.weekDescription = d.weekNote;
        if (d.goalText) _state.goalText = d.goalText;

        _state.milestones = Array.isArray(d.milestones) ? d.milestones : [];
        _state.latestProgressAt = d.updatedAt?.toDate?.() || d.createdAt?.toDate?.() || null;
      }

      recomputeDerivedState();

      const goalEl = document.getElementById("projectGoal");
      if (goalEl) goalEl.textContent = _state.currentMilestone;

      renderWidget();
    },
    (err) => {
      console.warn("// Mohamed – customer project:", err.code);
      recomputeDerivedState();
      renderWidget();
    }
  ));

  // Mohamed – kunde ser kun filer som er synlige for kunde
  _unsubs.push(onSnapshot(
    query(collection(db, "files"), where("projectId", "==", projectId)),
    (snap) => {
      const weekStart = getWeekStart().getTime();
      let totalVisibleFiles = 0;
      let filesThisWeek = 0;
      let latestFileAt = null;
      const weeklyFileCounts = [0, 0, 0, 0, 0, 0, 0];

      snap.forEach((d) => {
        const data = d.data();

        const isVisible =
          data.visibleToClient !== false &&
          data.customerVisibility !== false;

        if (!isVisible) return;

        totalVisibleFiles++;

        const fileDate = getFileDate(data);

        if (fileDate) {
          if (fileDate.getTime() >= weekStart) {
            filesThisWeek++;
            weeklyFileCounts[getWeekDayIndexFromDate(fileDate)]++;
          }

          if (!latestFileAt || fileDate > latestFileAt) {
            latestFileAt = fileDate;
          }
        }
      });

      _state.totalFiles = totalVisibleFiles;
      _state.filesThisWeek = filesThisWeek;
      _state.latestFileAt = latestFileAt;
      _state.weeklyFileCounts = weeklyFileCounts;

      recomputeDerivedState();
      renderWidget();
    },
    (err) => {
      console.warn("// Mohamed – customer files:", err.code);
    }
  ));

  // Mohamed – meldinger
  _unsubs.push(onSnapshot(
    query(collection(db, "messages"), where("projectId", "==", projectId)),
    (snap) => {
      const weekStart = getWeekStart().getTime();
      let count = 0;
      let latestMessageAt = null;

      snap.forEach((d) => {
        const data = d.data();
        const msgDate =
          data.createdAt?.toDate?.() ||
          (data.time ? new Date(data.time) : null) ||
          null;

        if (msgDate) {
          if (msgDate.getTime() >= weekStart) count++;
          if (!latestMessageAt || msgDate > latestMessageAt) latestMessageAt = msgDate;
        }
      });

      _state.messagesCount = count;
      _state.latestMessageAt = latestMessageAt;

      recomputeDerivedState();
      renderWidget();
    },
    (err) => {
      console.warn("// Mohamed – customer messages:", err.code);
    }
  ));
}

/* =========================================================
   SVG GRAF – milepæl-fremgang per dag
========================================================= */
function buildProgressChart() {
  const todayIdx = getTodayWeekIndex();
  const milestones = _state.milestones || [];
  const total = milestones.length;
  const weekStart = getWeekStart();

  const values = WEEK_DAY_LABELS.map((_, dayIdx) => {
    if (dayIdx > todayIdx) return null;

    const dayEnd = new Date(weekStart);
    dayEnd.setDate(weekStart.getDate() + dayIdx);
    dayEnd.setHours(23, 59, 59, 999);

    if (total === 0) return 0;

    const doneByDay = milestones.filter(m => {
      if (!m.done) return false;
      if (!m.date) return true;

      const mDate = m.date?.toDate ? m.date.toDate() : new Date(m.date);
      const effectiveDate = mDate > new Date() ? new Date() : mDate;

      return effectiveDate <= dayEnd;
    }).length;

    return Math.round((doneByDay / total) * 100);
  });

  const W = 300;
  const H = 130;
  const PAD = { top: 14, right: 12, bottom: 30, left: 40 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;

  const xPos = i => PAD.left + (i / 6) * iW;
  const yPos = v => PAD.top + iH - (v / 100) * iH;

  const yTicks = [0, 25, 50, 75, 100];

  const grid = yTicks.map(v => `
    <line x1="${PAD.left}" y1="${yPos(v).toFixed(1)}"
          x2="${PAD.left + iW}" y2="${yPos(v).toFixed(1)}"
          stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
    <text x="${PAD.left - 5}" y="${(yPos(v) + 4).toFixed(1)}"
          text-anchor="end" font-size="8"
          fill="rgba(255,255,255,0.40)">${v}%</text>
  `).join("");

  const activePts = values
    .map((v, i) => v !== null ? { x: xPos(i), y: yPos(v), v, i } : null)
    .filter(Boolean);

  const linePath = activePts.length > 1
    ? `M ${activePts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")}`
    : activePts.length === 1
      ? `M ${activePts[0].x.toFixed(1)},${activePts[0].y.toFixed(1)}`
      : "";

  const areaPath = activePts.length > 1
    ? `M ${activePts[0].x.toFixed(1)},${(PAD.top + iH).toFixed(1)}
       L ${activePts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")}
       L ${activePts[activePts.length - 1].x.toFixed(1)},${(PAD.top + iH).toFixed(1)} Z`
    : "";

  const lastPct = activePts[activePts.length - 1]?.v ?? 0;

  const futureLine = todayIdx < 6
    ? `<line x1="${xPos(todayIdx).toFixed(1)}" y1="${yPos(lastPct).toFixed(1)}"
             x2="${xPos(6).toFixed(1)}" y2="${yPos(lastPct).toFixed(1)}"
             stroke="rgba(147,197,253,0.20)" stroke-width="1.5" stroke-dasharray="4,4"/>`
    : "";

  const dots = activePts.map((p, idx) => `
    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}"
            r="${idx === activePts.length - 1 ? 5 : 3.5}"
            fill="${idx === activePts.length - 1 ? '#60a5fa' : '#93c5fd'}"
            stroke="rgba(255,255,255,0.90)" stroke-width="1.5">
      <title>${WEEK_DAY_LABELS[p.i]}: ${p.v}%</title>
    </circle>
  `).join("");

  const xLabels = WEEK_DAY_LABELS.map((lbl, i) => `
    <text x="${xPos(i).toFixed(1)}" y="${(H - 5).toFixed(1)}"
          text-anchor="middle" font-size="8"
          fill="${i === todayIdx ? 'rgba(255,255,255,0.92)' : i < todayIdx ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.30)'}"
          font-weight="${i === todayIdx ? '700' : '400'}">${lbl}</text>
  `).join("");

  return `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
         style="width:100%;height:auto;display:block;overflow:visible">
      <defs>
        <linearGradient id="customerMsGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(96,165,250,0.40)"/>
          <stop offset="100%" stop-color="rgba(96,165,250,0.00)"/>
        </linearGradient>
      </defs>
      ${grid}
      ${areaPath ? `<path d="${areaPath}" fill="url(#customerMsGrad)"/>` : ""}
      ${linePath ? `<path d="${linePath}" fill="none" stroke="#60a5fa" stroke-width="2.5"
                         stroke-linecap="round" stroke-linejoin="round"/>` : ""}
      ${futureLine}
      ${dots}
      ${xLabels}
    </svg>
  `;
}

/* =========================================================
   RENDER
========================================================= */
function showLoading() {
  const c = document.getElementById("weekPlaceholder");
  if (c) {
    c.innerHTML = `
      <div class="analytics-loading">
        <div class="analytics-spinner"></div>
        <span>Kobler til database…</span>
      </div>
    `;
  }
}

function animateBar(id, pct) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (el) el.style.width = pct + "%";
  }));
}

function renderWidget() {
  const container = document.getElementById("weekPlaceholder");
  if (!container) return;

  const {
    progressPct,
    weekDescription,
    daysUsed,
    daysLeft,
    totalFiles,
    filesThisWeek,
    messagesCount,
    milestones,
    milestonesDone,
    milestonesTotal,
    currentMilestone,
    nextMilestoneDate,
    milestoneRisk,
    milestoneRiskLabel,
    activityLabel,
    activityTone,
    summaryText,
    alerts
  } = _state;

  const pct = progressPct || 0;

  const milestonesHtml = milestones.length > 0
    ? milestones.map((m, i) => `
      <div class="milestone-row ${m.done ? "done" : ""}">
        <span class="milestone-check">${m.done ? "✓" : "○"}</span>
        <span class="milestone-title">${m.title || `Milepæl ${i + 1}`}</span>
        ${m.date ? `<span class="milestone-date">${formatDateNo(m.date)}</span>` : ""}
      </div>
    `).join("")
    : `<div style="font-size:12px;color:rgba(255,255,255,0.45)">Ingen milepæler lagt inn ennå.</div>`;

  const alertsHtml = alerts.length
    ? alerts.map(a => `<div class="analytics-alert-item">${a}</div>`).join("")
    : `<div class="analytics-alert-item ok">Ingen varsler akkurat nå. Fremdrift og aktivitet ser stabile ut.</div>`;

  container.innerHTML = `
    <div class="analytics-widget">

      <div class="analytics-milestone-box">
        <div class="analytics-milestone-title">Milepæler (${milestonesDone}/${milestonesTotal})</div>
        <div class="analytics-milestone-list">${milestonesHtml}</div>
      </div>

      <p class="analytics-desc">${weekDescription}</p>

      <div class="analytics-bar-track">
        <div class="analytics-bar-fill" id="innerBar" style="width:0%"></div>
      </div>

      <div class="analytics-summary-card">
        <div class="analytics-summary-title">Prosjektoppsummering</div>
        <p class="analytics-summary-text">${summaryText}</p>
      </div>

      <div class="analytics-stats">
        <div class="stat-card">
          <span class="stat-number">${daysUsed}</span>
          <span class="stat-label">Dager brukt</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${daysLeft}</span>
          <span class="stat-label">Dager igjen</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${filesThisWeek}</span>
          <span class="stat-label">Filer denne uken</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${messagesCount}</span>
          <span class="stat-label">Meldinger denne uken</span>
        </div>
      </div>

      <div class="analytics-grid-2">
        <div class="analytics-mini-card tone-${milestoneRisk}">
          <div class="analytics-mini-title">Milepæl-fremdrift</div>
          <div class="analytics-mini-big">${pct}%</div>
          <div class="analytics-mini-meta">${milestonesDone} / ${milestonesTotal} fullført</div>
          <div class="analytics-mini-meta">${currentMilestone}</div>
        </div>

        <div class="analytics-mini-card tone-${milestoneRisk}">
          <div class="analytics-mini-title">Risiko basert på milepæl</div>
          <div class="analytics-mini-big">${milestoneRiskLabel}</div>
          <div class="analytics-mini-meta">Neste: ${formatDateNo(nextMilestoneDate)}</div>
          <div class="analytics-mini-meta tone-${activityTone}">${activityLabel}</div>
        </div>
      </div>

      <div class="analytics-chart-wrap">
        <div class="analytics-chart-title">Milepæl-fremgang denne uken</div>
        <div class="analytics-chart-inner">${buildProgressChart()}</div>
        <p class="analytics-chart-sub">Viser milepæl-% per dag denne uken</p>
      </div>

      <div class="analytics-alert-box">
        <div class="analytics-alert-title">Varsler og risiko</div>
        <div class="analytics-alert-list">${alertsHtml}</div>
      </div>

      <div class="analytics-footer-stats">
        <span>Totale filer synlig for kunde: <strong>${totalFiles}</strong></span>
      </div>

    </div>
  `;

  animateBar("innerBar", pct);
  animateBar("heroProgressBar", pct);

  const heroPctEl = document.getElementById("heroProgressPct");
  if (heroPctEl) heroPctEl.textContent = pct + "%";
}

/* =========================================================
   INIT + CSS
========================================================= */
function injectCustomerAnalyticsStyles() {
  if (document.getElementById("customerAnalyticsStyles")) return;

  const s = document.createElement("style");
  s.id = "customerAnalyticsStyles";
  s.textContent = `
    .analytics-milestone-box {
      background:rgba(255,255,255,0.04);
      border:1px solid rgba(255,255,255,0.10);
      border-radius:12px;
      padding:12px 14px;
    }

    .analytics-milestone-title {
      font-size:11px;
      font-weight:700;
      text-transform:uppercase;
      letter-spacing:.05em;
      color:rgba(255,255,255,0.50);
      margin-bottom:8px;
    }

    .analytics-milestone-list {
      display:flex;
      flex-direction:column;
      gap:6px;
    }

    .milestone-row {
      display:flex;
      align-items:center;
      gap:8px;
      font-size:13px;
      color:rgba(255,255,255,0.80);
    }

    .milestone-row.done {
      opacity:0.55;
      text-decoration:line-through;
    }

    .milestone-check {
      font-size:14px;
      color:#60a5fa;
      flex-shrink:0;
    }

    .milestone-row.done .milestone-check {
      color:#4ade80;
    }

    .milestone-title {
      flex:1;
    }

    .milestone-date {
      font-size:11px;
      color:rgba(255,255,255,0.45);
      white-space:nowrap;
    }
  `;

  document.head.appendChild(s);
}

function initAnalytics() {
  injectCustomerAnalyticsStyles();
  showLoading();

  const projectId = window.currentProjectId || "PROJECT_ABC_123";
  startLiveAnalytics(projectId);

  window.addEventListener("projectChanged", (e) => {
    if (e.detail?.projectId) {
      startLiveAnalytics(e.detail.projectId);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAnalytics);
} else {
  initAnalytics();
}