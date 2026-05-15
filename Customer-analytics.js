// Mohamed – Customer-analytics.js
// Kunde kan kun lese analysemodulen – ingen redigering.
// Samsvarer med ansatt sin Analytics.js layout og graf-stil.

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
const db  = getFirestore(app);

/* =========================================================
   HJELPEFUNKSJONER
========================================================= */
function getWeekStart() {
  const d = new Date();
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDayIndexFromDate(date) {
  return date.getDay() === 0 ? 6 : date.getDay() - 1;
}

function formatDateNo(dateLike) {
  if (!dateLike) return "Ikke satt";
  const date = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "Ikke satt";
  return date.toLocaleDateString("no-NO");
}

// Mohamed – kortformat dato for graf: "29.4"
function fmtD(date) {
  if (!date) return "";
  const d = date?.toDate ? date.toDate() : new Date(date);
  return `${d.getDate()}.${d.getMonth()+1}`;
}

function daysSince(dateLike) {
  if (!dateLike) return null;
  const date = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function getFileDate(data) {
  return (
    data.createdAt?.toDate?.()    ||
    data.dateUploaded?.toDate?.() ||
    data.uploadedAt?.toDate?.()   ||
    (data.createdAt?.seconds    ? new Date(data.createdAt.seconds * 1000)    : null) ||
    (data.dateUploaded?.seconds ? new Date(data.dateUploaded.seconds * 1000) : null) ||
    null
  );
}

/* =========================================================
   STATE
========================================================= */
let _state = {
  progressPct:      0,
  goalText:         "Laster delmål…",
  startedAt:        null,
  daysUsed:         0,
  durationDays:     90,
  daysLeft:         90,
  totalFiles:       0,
  filesThisWeek:    0,
  messagesCount:    0,
  weeklyFileCounts: [0,0,0,0,0,0,0],
  milestones:          [],
  milestonesDone:      0,
  milestonesTotal:     0,
  currentMilestone:    "Ikke satt",
  nextMilestoneDate:   null,
  milestoneRisk:       "low",
  milestoneRiskLabel:  "Lav risiko",
  latestFileAt:     null,
  latestMessageAt:  null,
  latestProgressAt: null,
  activityLabel:    "Lav aktivitet",
  activityTone:     "low",
  summaryText:      "Ingen oppsummering tilgjengelig.",
  alerts:           []
};

let _unsubs = [];

function stopAll() { _unsubs.forEach(u => u()); _unsubs = []; }

/* =========================================================
   DERIVED STATE
========================================================= */
function recomputeDerivedState() {
  _state.daysLeft = Math.max(0, (_state.durationDays || 0) - (_state.daysUsed || 0));

  const milestones = Array.isArray(_state.milestones) ? _state.milestones : [];
  const total      = milestones.length;
  const done       = milestones.filter(m => m.done).length;

  _state.milestonesTotal = total;
  _state.milestonesDone  = done;
  _state.progressPct     = total > 0 ? Math.round((done / total) * 100) : 0;

  const next = milestones.find(m => !m.done);
  _state.currentMilestone  = next?.title || (total > 0 ? "Alle milepæler fullført ✓" : "Ingen milepæler");
  _state.nextMilestoneDate = next?.date  || null;

  let daysToNext = null;
  if (_state.nextMilestoneDate) {
    const mDate = _state.nextMilestoneDate?.toDate
      ? _state.nextMilestoneDate.toDate()
      : new Date(_state.nextMilestoneDate);
    daysToNext = Math.ceil((mDate.getTime() - Date.now()) / 86400000);
  }

  const pct = _state.progressPct;

  if (done === total && total > 0) {
    _state.milestoneRisk = "low";  _state.milestoneRiskLabel = "Alle milepæler fullført ✓";
  } else if (daysToNext !== null && daysToNext <= 0) {
    _state.milestoneRisk = "high"; _state.milestoneRiskLabel = "Milepæl overskredet!";
  } else if (daysToNext !== null && daysToNext <= 7 && pct < 75) {
    _state.milestoneRisk = "high"; _state.milestoneRiskLabel = "Høy risiko";
  } else if (daysToNext !== null && daysToNext <= 14 && pct < 50) {
    _state.milestoneRisk = "medium"; _state.milestoneRiskLabel = "Moderat risiko";
  } else {
    _state.milestoneRisk = "low";  _state.milestoneRiskLabel = "Lav risiko";
  }

  const filesThisWeek    = _state.filesThisWeek  || 0;
  const messagesThisWeek = _state.messagesCount   || 0;
  const activityScore    = filesThisWeek + messagesThisWeek;

  if (activityScore >= 8)      { _state.activityLabel = "Høy aktivitet";     _state.activityTone = "high"; }
  else if (activityScore >= 3) { _state.activityLabel = "Moderat aktivitet"; _state.activityTone = "medium"; }
  else                         { _state.activityLabel = "Lav aktivitet";     _state.activityTone = "low"; }

  const alerts = [];
  if (messagesThisWeek === 0) alerts.push("Ingen nye meldinger denne uken.");
  if (filesThisWeek    === 0) alerts.push("Ingen nye filer delt denne uken.");

  const expectedPct = _state.durationDays > 0
    ? Math.round((_state.daysUsed / _state.durationDays) * 100) : 0;
  if (pct + 10 < expectedPct) alerts.push("Fremdriften ligger bak forventet nivå basert på tidsbruk.");

  if (_state.milestoneRisk === "high" && done < total)
    alerts.push(`Milepæl-risiko: ${_state.milestoneRiskLabel} – ${done} av ${total} milepæler fullført.`);
  else if (_state.milestoneRisk === "medium")
    alerts.push(`Milepæl-risiko: ${_state.milestoneRiskLabel} – ${done} av ${total} milepæler fullført.`);

  const noFilesDays    = daysSince(_state.latestFileAt);
  const noMsgDays      = daysSince(_state.latestMessageAt);
  const noProgressDays = daysSince(_state.latestProgressAt);
  if (noFilesDays    !== null && noFilesDays    >= 7) alerts.push(`Ingen nye filer de siste ${noFilesDays} dagene.`);
  if (noMsgDays      !== null && noMsgDays      >= 7) alerts.push(`Ingen meldinger de siste ${noMsgDays} dagene.`);
  if (noProgressDays !== null && noProgressDays >= 7) alerts.push(`Milepæler ikke oppdatert på ${noProgressDays} dager.`);

  _state.alerts = alerts;

  // Mohamed – fjernet "X meldinger sendt" fra oppsummeringen
  _state.summaryText = [
    `Prosjektet er ${pct}% ferdig (${done} av ${total} milepæler fullført).`,
    `${_state.daysUsed} dager er brukt og ${_state.daysLeft} dager gjenstår.`,
    `Aktivitetsnivået denne uken er ${_state.activityLabel.toLowerCase()}.`,
    filesThisWeek > 0 ? `${filesThisWeek} nye filer delt denne uken.` : ""
  ].filter(Boolean).join(" ");
}

/* =========================================================
   LIVE-LYTTERE
========================================================= */
function startLiveAnalytics(projectId) {
  stopAll();

  // Mohamed – reset state ved prosjektbytte
  _state = {
    progressPct: 0, goalText: "Laster delmål…",
    startedAt: null, daysUsed: 0, durationDays: 90, daysLeft: 90,
    totalFiles: 0, filesThisWeek: 0, messagesCount: 0,
    weeklyFileCounts: [0,0,0,0,0,0,0],
    milestones: [], milestonesDone: 0, milestonesTotal: 0,
    currentMilestone: "Ikke satt", nextMilestoneDate: null,
    milestoneRisk: "low", milestoneRiskLabel: "Lav risiko",
    latestFileAt: null, latestMessageAt: null, latestProgressAt: null,
    activityLabel: "Lav aktivitet", activityTone: "low",
    summaryText: "Ingen oppsummering tilgjengelig.", alerts: []
  };

  showLoading();

  /* ---- 1. Prosjektdokument ---- */
  _unsubs.push(onSnapshot(
    doc(db, "projects", projectId),
    (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.startedAt?.toDate) {
          _state.startedAt = d.startedAt.toDate();
          _state.daysUsed  = Math.max(0,
            Math.floor((Date.now() - _state.startedAt.getTime()) / 86400000)
          );
        }
        if (typeof d.durationDays === "number") _state.durationDays = d.durationDays;
        if (d.goalText) _state.goalText = d.goalText;
        _state.milestones       = Array.isArray(d.milestones) ? d.milestones : [];
        _state.latestProgressAt = d.updatedAt?.toDate?.() || d.createdAt?.toDate?.() || null;
      }

      recomputeDerivedState();

      // Mohamed – oppdater hero med milepæl-fremgang (samme som ansattportal)
      const goalEl = document.getElementById("projectGoal");
      if (goalEl) goalEl.textContent = `${_state.milestonesDone} av ${_state.milestonesTotal} fullført`;

      renderWidget();
    },
    (err) => { console.warn("customer project:", err.code); recomputeDerivedState(); renderWidget(); }
  ));

  /* ---- 2. Filer – kun synlige for kunde ---- */
  _unsubs.push(onSnapshot(
    query(collection(db, "files"), where("projectId", "==", projectId)),
    (snap) => {
      const weekStart = getWeekStart().getTime();
      let totalVisibleFiles = 0, filesThisWeek = 0, latestFileAt = null;
      const weeklyFileCounts = [0,0,0,0,0,0,0];

      snap.forEach(d => {
        const data = d.data();
        const isVisible = data.visibleToClient !== false && data.customerVisibility !== false;
        if (!isVisible) return;
        totalVisibleFiles++;
        const fileDate = getFileDate(data);
        if (fileDate) {
          if (fileDate.getTime() >= weekStart) {
            filesThisWeek++;
            weeklyFileCounts[getWeekDayIndexFromDate(fileDate)]++;
          }
          if (!latestFileAt || fileDate > latestFileAt) latestFileAt = fileDate;
        }
      });

      _state.totalFiles       = totalVisibleFiles;
      _state.filesThisWeek    = filesThisWeek;
      _state.latestFileAt     = latestFileAt;
      _state.weeklyFileCounts = weeklyFileCounts;
      recomputeDerivedState();
      renderWidget();
    },
    (err) => { console.warn("customer files:", err.code); }
  ));

  /* ---- 3. Meldinger ---- */
  _unsubs.push(onSnapshot(
    query(collection(db, "messages"), where("projectId", "==", projectId)),
    (snap) => {
      const weekStart = getWeekStart().getTime();
      let count = 0, latestMessageAt = null;

      snap.forEach(d => {
        const data    = d.data();
        const msgDate = data.createdAt?.toDate?.() || (data.time ? new Date(data.time) : null) || null;
        if (msgDate) {
          if (msgDate.getTime() >= weekStart) count++;
          if (!latestMessageAt || msgDate > latestMessageAt) latestMessageAt = msgDate;
        }
      });

      _state.messagesCount   = count;
      _state.latestMessageAt = latestMessageAt;
      recomputeDerivedState();
      renderWidget();
    },
    (err) => { console.warn("customer messages:", err.code); }
  ));
}

/* =========================================================
   SVG GRAF – milepæl-fremgang over tid
   Mohamed – identisk stil som ansatt: smooth bezier + tegne-animasjon
========================================================= */
function buildProgressChart() {
  const milestones = _state.milestones || [];
  const total      = milestones.length;

  const doneWithDates = milestones
    .filter(m => m.done && m.date)
    .map(m => ({ date: m.date?.toDate ? m.date.toDate() : new Date(m.date), title: m.title }))
    .sort((a, b) => a.date - b.date);

  const today      = new Date();
  const currentPct = total > 0 ? Math.round((_state.milestonesDone / total) * 100) : 0;

  const points = [];

  if (doneWithDates.length > 0) {
    const start = new Date(doneWithDates[0].date);
    start.setDate(start.getDate() - 1);
    points.push({ pct: 0, label: fmtD(start) });
    doneWithDates.forEach((m, idx) => {
      points.push({ pct: Math.round(((idx+1) / total) * 100), label: fmtD(m.date), title: m.title });
    });
  } else {
    points.push({ pct: 0, label: "Start" });
  }

  if (points[points.length-1].label !== fmtD(today))
    points.push({ pct: currentPct, label: "I dag", isToday: true });
  else points[points.length-1].isToday = true;

  const n = points.length;
  const W = 300, H = 130;
  const PAD = { top: 14, right: 16, bottom: 30, left: 40 };
  const iW  = W - PAD.left - PAD.right;
  const iH  = H - PAD.top  - PAD.bottom;
  const xPos = i => PAD.left + (n === 1 ? iW/2 : (i/(n-1)) * iW);
  const yPos = v => PAD.top  + iH - (v/100) * iH;

  const pts = points.map((p, i) => ({ x: xPos(i), y: yPos(p.pct) }));

  // Mohamed – smooth bezier (identisk med ansattportal)
  function smoothPath(pts) {
    if (pts.length < 2) return `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i-1], p1 = pts[i];
      const cpX = ((p0.x + p1.x)/2).toFixed(1);
      d += ` C ${cpX},${p0.y.toFixed(1)} ${cpX},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
    }
    return d;
  }

  const linePath = smoothPath(pts);
  const areaPath = pts.length > 1
    ? `M ${pts[0].x.toFixed(1)},${(PAD.top+iH).toFixed(1)} ` + linePath.replace(/^M[^C]+/, "") +
      ` L ${pts[pts.length-1].x.toFixed(1)},${(PAD.top+iH).toFixed(1)} Z` : "";

  const totalLen = Math.round(pts.reduce((sum, p, i) => {
    if (i === 0) return 0;
    const dx = p.x - pts[i-1].x, dy = p.y - pts[i-1].y;
    return sum + Math.sqrt(dx*dx + dy*dy);
  }, 0)) + 50;

  const grid = [0,25,50,75,100].map(v => `
    <line x1="${PAD.left}" y1="${yPos(v).toFixed(1)}" x2="${PAD.left+iW}" y2="${yPos(v).toFixed(1)}"
          stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
    <text x="${PAD.left-5}" y="${(yPos(v)+4).toFixed(1)}" text-anchor="end" font-size="8"
          fill="rgba(255,255,255,0.40)">${v}%</text>`).join("");

  const xLabels = points.map((p, i) => `
    <text x="${xPos(i).toFixed(1)}" y="${(H-5).toFixed(1)}" text-anchor="middle" font-size="8"
          fill="${p.isToday ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.60)'}"
          font-weight="${p.isToday ? '700' : '400'}">${p.label}</text>`).join("");

  // Mohamed – pulserende ring på "I dag"-punktet
  const dots = points.map((p, i) => `
    <circle cx="${pts[i].x.toFixed(1)}" cy="${pts[i].y.toFixed(1)}"
            r="${p.isToday ? 5 : 3.5}"
            fill="${p.isToday ? '#60a5fa' : '#93c5fd'}"
            stroke="rgba(255,255,255,0.90)" stroke-width="1.5">
      <title>${p.label}: ${p.pct}%${p.title ? ` – ${p.title}` : ""}</title>
    </circle>
    ${p.isToday ? `<circle cx="${pts[i].x.toFixed(1)}" cy="${pts[i].y.toFixed(1)}"
      r="8" fill="none" stroke="#60a5fa" stroke-width="1" opacity="0.4">
      <animate attributeName="r" values="5;10;5" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite"/>
    </circle>` : ""}
  `).join("");

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
       style="width:100%;height:auto;display:block;overflow:visible">
    <defs><linearGradient id="custMsGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(96,165,250,0.40)"/>
      <stop offset="100%" stop-color="rgba(96,165,250,0.00)"/>
    </linearGradient></defs>
    ${grid}
    ${areaPath ? `<path d="${areaPath}" fill="url(#custMsGrad)" opacity="0">
      <animate attributeName="opacity" from="0" to="1" dur="0.8s" fill="freeze" begin="0.3s"/>
    </path>` : ""}
    <path d="${linePath}" fill="none" stroke="#60a5fa" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round"
          stroke-dasharray="${totalLen}" stroke-dashoffset="${totalLen}">
      <animate attributeName="stroke-dashoffset" from="${totalLen}" to="0" dur="1.2s" fill="freeze"/>
    </path>
    ${dots}${xLabels}
  </svg>`;
}

/* =========================================================
   RENDER HELPERS
========================================================= */
function showLoading() {
  const c = document.getElementById("weekPlaceholder");
  if (c) c.innerHTML = `
    <div class="analytics-loading">
      <div class="analytics-spinner"></div>
      <span>Kobler til database…</span>
    </div>`;
}

function animateBar(id, pct) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (el) el.style.width = pct + "%";
  }));
}

/* =========================================================
   RENDER WIDGET – identisk layout som ansattportal, men read-only
========================================================= */
function renderWidget() {
  const container = document.getElementById("weekPlaceholder");
  if (!container) return;

  const { progressPct, daysUsed, daysLeft, totalFiles, milestones,
          milestonesDone, milestonesTotal, nextMilestoneDate,
          milestoneRisk, milestoneRiskLabel, activityLabel,
          summaryText, alerts } = _state;
  const pct = progressPct || 0;

  // Mohamed – første ufullendte milepæl (read-only for kunde)
  const activeMilestone = milestones.find(m => !m.done);

  // Mohamed – milepæl-liste read-only
  const milestonesHtml = milestones.length > 0
    ? milestones.map((m, i) => `
        <div class="milestone-row ${m.done ? 'done' : ''}">
          <span class="milestone-check">${m.done ? '✓' : '○'}</span>
          <span class="milestone-title">${m.title || `Milepæl ${i+1}`}</span>
          ${m.date ? `<span class="milestone-date">${formatDateNo(m.date)}</span>` : ""}
        </div>`).join("")
    : `<div style="font-size:12px;color:rgba(255,255,255,0.45)">Ingen milepæler registrert ennå.</div>`;

  const alertsHtml = alerts.length
    ? alerts.map(a => `<div class="analytics-alert-item">${a}</div>`).join("")
    : `<div class="analytics-alert-item ok">Ingen varsler akkurat nå. Fremdrift og aktivitet ser stabile ut.</div>`;

  container.innerHTML = `
    <div class="analytics-widget">

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
      </div>

      <div class="analytics-grid-2">
        <div class="analytics-mini-card tone-${milestoneRisk}">
          <div class="analytics-mini-title">Nåværende milepæl</div>
          ${activeMilestone ? `
            <div class="analytics-mini-big">${activeMilestone.title}</div>
            <div class="analytics-mini-meta">${milestonesTotal - milestonesTotal + milestonesDone} av ${milestonesTotal} fullført</div>
          ` : `
            <div class="analytics-mini-big">Alle fullført ✓</div>
            <div class="analytics-mini-meta">${milestonesTotal} av ${milestonesTotal} milepæler er fullført</div>
            <div class="analytics-mini-meta">Prosjektet er ferdig</div>
          `}
        </div>
        <div class="analytics-mini-card tone-${milestoneRisk}">
          <div class="analytics-mini-title">Risiko</div>
          <div class="analytics-mini-big">${milestoneRiskLabel}</div>
          <div class="analytics-mini-meta">Neste: ${formatDateNo(nextMilestoneDate)}</div>
          <!-- Mohamed – fjernet tone-klasse, unngår uønsket boks -->
          <div class="analytics-mini-meta">${activityLabel}</div>
        </div>
      </div>

      <!-- Mohamed – milepæl-liste read-only for kunde -->
      <div class="analytics-milestone-box" style="margin-top:0">
        <div class="analytics-milestone-title" style="margin-bottom:8px">Milepæler (${milestonesDone}/${milestonesTotal})</div>
        <div class="analytics-milestone-list">${milestonesHtml}</div>
      </div>

      <div class="analytics-chart-wrap">
        <div class="analytics-chart-title">Milepæl-fremgang over tid</div>
        <div class="analytics-chart-inner">${buildProgressChart()}</div>
        <p class="analytics-chart-sub">Blå linje viser total prosjektfremgang – stiger når en milepæl fullføres</p>
      </div>

      <div class="analytics-alert-box">
        <div class="analytics-alert-title">Varsler og risiko</div>
        <div class="analytics-alert-list">${alertsHtml}</div>
      </div>

      <!-- Mohamed – viser filer synlige for kunde -->
      <div class="analytics-footer-stats">
        <span>Neste milepæl: <strong>${activeMilestone
          ? `${activeMilestone.title} – ${formatDateNo(activeMilestone.date)}`
          : "Alle milepæler fullført ✓"}</strong></span>
      </div>

    </div>`;

  animateBar("heroProgressBar", pct);
  const heroPctEl = document.getElementById("heroProgressPct");
  if (heroPctEl) heroPctEl.textContent = pct + "%";
}

/* =========================================================
   INIT
========================================================= */
function initAnalytics() {
  if (!document.getElementById("custAnalyticsStyles")) {
    const s = document.createElement("style");
    s.id = "custAnalyticsStyles";
    s.textContent = `
      .analytics-milestone-box { background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);border-radius:12px;padding:12px 14px; }
      .analytics-milestone-title { font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:rgba(255,255,255,0.50);margin-bottom:8px; }
      .analytics-milestone-list { display:flex;flex-direction:column;gap:6px; }
      .milestone-row { display:flex;align-items:center;gap:8px;font-size:13px;color:rgba(255,255,255,0.80); }
      .milestone-row.done { opacity:0.55;text-decoration:line-through; }
      .milestone-check { font-size:14px;color:#60a5fa;flex-shrink:0; }
      .milestone-row.done .milestone-check { color:#4ade80; }
      .milestone-title { flex:1; }
      .milestone-date { font-size:11px;color:rgba(255,255,255,0.45);white-space:nowrap; }
    `;
    document.head.appendChild(s);
  }

  showLoading();
  const projectId = window.currentProjectId;
  if (projectId) startLiveAnalytics(projectId);

  window.addEventListener("projectChanged", (e) => {
    if (e.detail?.projectId) startLiveAnalytics(e.detail.projectId);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAnalytics);
} else {
  initAnalytics();
}