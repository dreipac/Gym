/* ================================
   GymPlan SPA – erweitert
   - Routing: #/heute, #/kalender, #/einstellungen
   - LocalStorage: Pläne, Erledigt, Vorlagen
   - Kalender-Editor mit Vorlagen & Copy-Forward
   - Stats (Streak, 7/30d Erfolgsquote)
   - Export/Import/Reset
================================ */

const q = (sel, el=document) => el.querySelector(sel);
const qa = (sel, el=document) => [...el.querySelectorAll(sel)];

const STORAGE_KEY  = "gymplan.v1";
const STORAGE_DONE = "gymplan.done";
const STORAGE_TPL  = "gymplan.templates";
const STORAGE_TRAININGS = "gymplan.trainings";
const STORAGE_TIMER = "gymplan.timer";
const STORAGE_SW_UI = "gymplan.swui";



const state = {
  route: "heute",
  selectedDate: todayKey(),
  monthCursor: new Date(),
  plans: loadJSON(STORAGE_KEY, {}),
  done:  loadJSON(STORAGE_DONE, {}),
  templates: loadTemplates(),
  trainings: loadTrainings(),
  timer: loadTimer(),
  swUi: loadJSON(STORAGE_SW_UI, { collapsed: false }),
};


/* ---------- Storage ---------- */
function loadJSON(key, fallback){
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function saveJSON(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

function loadTemplates(){
  const t = loadJSON(STORAGE_TPL, null);
  if(t) return t;
  // Default-Vorlagen
  const defaults = {
    "GK Schnell":   { type:"Ganzkörper", note:"kompakt 45min" },
    "Push Volumen": { type:"Push",       note:"Bank 5x5 + Dips" },
    "Pull Fokus":   { type:"Pull",       note:"Kreuzheben 5x3" },
    "Beine":        { type:"Beine",      note:"Kniebeuge 5x5" },
    "Cardio":       { type:"Cardio",     note:"Intervall 30min" }
  };
  saveJSON(STORAGE_TPL, defaults);
  return defaults;
}

/* ---------- Utils ---------- */
function todayKey(d=new Date()){
  const tz = new Date(d.getTime() - d.getTimezoneOffset()*60000); // naive YYYY-MM-DD
  return tz.toISOString().slice(0,10);
}
function fmtLong(date){
  return date.toLocaleDateString("de-CH", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
}
function keyToDate(key){
  const [y,m,d] = key.split("-").map(Number);
  return new Date(y, m-1, d);
}
function savePlans(){ saveJSON(STORAGE_KEY, state.plans); }
function saveDone(){  saveJSON(STORAGE_DONE, state.done); }
function saveTemplates(){ saveJSON(STORAGE_TPL, state.templates); }

function loadTrainings(){
  const t = loadJSON(STORAGE_TRAININGS, null);
  // Zielstruktur NEU:
  // [{ name: "Oberkörper", geraete: [{ name: "Langhantel", weight: 60 }, ...] }, ...]
  if (Array.isArray(t) && t.length){
    // Falls bereits neue Objektstruktur vorhanden ist → normalisieren
    if (typeof t[0] === "object" && t[0] !== null && "name" in t[0]){
      return t.map(it => ({
        name: String(it.name || "").trim(),
        geraete: Array.isArray(it.geraete)
          ? it.geraete.map(g => {
              if (typeof g === "string") {
                // Migration: String -> Objekt
                return { name: g.trim(), weight: null };
              }
              if (typeof g === "object" && g !== null) {
                return {
                  name: String(g.name || "").trim(),
                  weight: (g.weight === 0 || g.weight) ? Number(g.weight) : null
                };
              }
              return null;
            }).filter(Boolean)
          : []
      }));
    }
    // Alte Struktur (Array von Strings) -> migrieren
    const migrated = t
      .map(s => ({ name: String(s || "").trim(), geraete: [] }))
      .filter(x => x.name);
    saveJSON(STORAGE_TRAININGS, migrated);
    return migrated;
  }
  // Defaults (Objektstruktur)
  const defaults = [
    { name:"Ganzkörper", geraete:[] },
    { name:"Push", geraete:[] },
    { name:"Pull", geraete:[] },
    { name:"Beine", geraete:[] },
    { name:"Oberkörper", geraete:[] },
    { name:"Cardio", geraete:[] },
    { name:"HIIT", geraete:[] },
    { name:"Mobility", geraete:[] },
  ];
  saveJSON(STORAGE_TRAININGS, defaults);
  return defaults;
}


function saveTrainings(){
  saveJSON(STORAGE_TRAININGS, state.trainings);
}

function getTrainingByName(name){
  return state.trainings.find(t => String(t.name || "").toLowerCase() === String(name || "").toLowerCase()) || null;
}

/* ---------- Timer / Stopwatch (mit Pause/Resume) ---------- */
function loadTimer(){
  const raw = loadJSON(STORAGE_TIMER, null);
  if (!raw){
    const fresh = { startedAt:null, elapsedMs:0, paused:false, pausedAt:null };
    saveJSON(STORAGE_TIMER, fresh);
    return fresh;
  }
  // Migration von altem Modell (falls vorhanden): pausedMs/lastTick
  if (typeof raw.elapsedMs !== "number"){
    let elapsed = 0;
    if (typeof raw.pausedMs === "number") elapsed += raw.pausedMs;
    if (raw.startedAt) elapsed += Math.max(0, Date.now() - raw.startedAt);
    return { startedAt:null, elapsedMs:elapsed, paused:false, pausedAt:null };
  }
  return {
    startedAt: raw.startedAt ?? null,
    elapsedMs: raw.elapsedMs || 0,
    paused: !!raw.paused,
    pausedAt: raw.pausedAt ?? null
  };
}
function saveTimer(){ saveJSON(STORAGE_TIMER, state.timer); }

function isTrainingDay(key=todayKey()){
  const e = state.plans[key];
  return !!(e && (e.type || e.note));
}

function startTraining(){
  const t = state.timer;
  if (t.startedAt || t.paused){ return; } // bereits aktiv
  t.startedAt = Date.now();
  t.elapsedMs = 0;       // neu beginnen
  t.paused = false;
  t.pausedAt = null;
  saveTimer();
}

function pauseTraining(){
  const t = state.timer;
  if (!t.startedAt || t.paused) return; // nur pausieren, wenn aktiv und nicht schon pausiert
  t.elapsedMs += Date.now() - t.startedAt;
  t.startedAt = null;
  t.paused = true;
  t.pausedAt = Date.now();
  saveTimer();
}

function resumeTraining(){
  const t = state.timer;
  if (!t.paused) return;
  t.startedAt = Date.now();
  t.paused = false;
  t.pausedAt = null;
  saveTimer();
}

function stopTraining(markDone=true){
  const t = state.timer;
  if (t.startedAt){ t.elapsedMs += Date.now() - t.startedAt; }
  // (Optional: Hier könntest du t.elapsedMs in ein History-Log schreiben)
  t.startedAt = null;
  t.paused = false;
  t.pausedAt = null;
  t.elapsedMs = 0;
  saveTimer();

  if (markDone){
    const k = todayKey();
    state.done[k] = true;
    saveDone();
  }
}

function getElapsedMs(){
  const t = state.timer;
  if (t.paused) return t.elapsedMs;
  if (!t.startedAt) return 0;
  return t.elapsedMs + (Date.now() - t.startedAt);
}

function fmtHMS(ms){
  const s = Math.max(0, Math.floor(ms/1000));
  const hh = String(Math.floor(s/3600)).padStart(2,"0");
  const mm = String(Math.floor((s%3600)/60)).padStart(2,"0");
  const ss = String(s%60).padStart(2,"0");
  return `${hh}:${mm}:${ss}`;
}

let swInterval = null;
function startUiTicker(updateFn){
  stopUiTicker();
  swInterval = setInterval(updateFn, 1000);
  updateFn();
}
function stopUiTicker(){
  if(swInterval){ clearInterval(swInterval); swInterval = null; }
}
document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "visible" && typeof window.__refreshHeute === "function"){
    window.__refreshHeute();
  }
});

/* Stats */
function calcStreak(){
  // Zählt rückwärts ab heute, solange done=true
  let streak = 0;
  const today = new Date();
  for(let i=0;;i++){
    const d = new Date(today); d.setDate(today.getDate()-i);
    const k = todayKey(d);
    if(state.done[k]) streak++;
    else break;
  }
  return streak;
}
function successRate(days){
  // Anteil erledigter Tage in den letzten N Tagen, für die ein Plan existiert ODER "done" gesetzt ist
  const end = new Date();
  let have=0, ok=0;
  for(let i=0;i<days;i++){
    const d = new Date(end); d.setDate(end.getDate()-i);
    const k = todayKey(d);
    const hasPlan = !!state.plans[k]?.type || !!state.plans[k]?.note;
    const isDone = !!state.done[k];
    if(hasPlan || isDone){ have++; if(isDone) ok++; }
  }
  if(have===0) return 0;
  return Math.round((ok/have)*100);
}

/* ---------- Router ---------- */
let __routeAnimating = false;

function setRoute(hash){
  const target = (hash.replace("#/","") || "heute").toLowerCase();
  const allowed = ["heute","kalender","einstellungen","konfigurieren","konfig-editor"];
  const nextRoute = allowed.includes(target) ? target : "404";

  const view = q("#view");
  const doSwitch = () => {
    // Inhalt wechseln
    state.route = nextRoute;
    render();
    highlightNav();

    // Route-spezifische Body-Klasse (für mobiles Scroll-Verhalten im Kalender)
    document.body.classList.toggle("route-kalender", state.route === "kalender");
    document.body.classList.toggle("route-heute", state.route === "heute");

    // ENTER-Phase
    view.classList.add("route-enter");
    requestAnimationFrame(() => {
      view.classList.add("route-enter-active");
      view.addEventListener("transitionend", () => {
        view.classList.remove("route-enter","route-enter-active");
        __routeAnimating = false;
      }, { once:true });
    });
  };

  if (!view || __routeAnimating){
    // Fallback: sofort wechseln, wenn keine View/Animation blockiert
    state.route = nextRoute;
    render();
    highlightNav();
    document.body.classList.toggle("route-kalender", state.route === "kalender");
    return;
  }

  __routeAnimating = true;

  // EXIT-Phase
  view.classList.add("route-exit");
  requestAnimationFrame(() => {
    view.classList.add("route-exit-active");
    view.addEventListener("transitionend", () => {
      view.classList.remove("route-exit","route-exit-active");
      // Danach neuen Inhalt einblenden
      doSwitch();
    }, { once:true });
  });
}



function highlightNav(){
  qa(".nav-link").forEach(a => {
    a.classList.toggle("active", a.getAttribute("data-route") === state.route);
  });
  // Spotlight-Höcker nach dem Active-Update verschieben
  updateNavSpot();
}


let navSpotRaf = 0;
function updateNavSpot(){
  cancelAnimationFrame(navSpotRaf);
  navSpotRaf = requestAnimationFrame(() => {
    const nav = q(".nav");
    const spot = q(".nav-spot");
    if(!nav || !spot) return;

    // aktiven Link finden (Fallback: erster Link)
    const active = nav.querySelector(".nav-link.active") || nav.querySelector(".nav-link");
    if(!active) return;

    const nr = nav.getBoundingClientRect();
    const ar = active.getBoundingClientRect();

    const left = ar.left - nr.left;     // x-Offset innerhalb der Nav
    const width = ar.width;

    spot.style.setProperty("--spot-left", `${left + width/2}px`); // Mittelpunkt
    spot.style.setProperty("--spot-width", `${width}px`);
    spot.classList.add("ready");
  });
}

// === Drag-/Scrub-Geste für die mobile Bottom-Nav ===
function initNavDrag(){
  const nav  = q(".nav");
  const spot = q(".nav-spot");
  const links = qa(".nav-link", nav);
  if (!nav || !spot || !links.length) return;

  let dragging = false;

  // Hilfsfunktionen
  const linkFromTouch = (touch) => {
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    return el && el.closest(".nav-link");
  };

  const moveSpotTo = (el) => {
    if (!el) return;
    const nr = nav.getBoundingClientRect();
    const ar = el.getBoundingClientRect();
    const left = ar.left - nr.left;
    const width = ar.width;
    spot.style.setProperty("--spot-left", `${left + width/2}px`);
    spot.style.setProperty("--spot-width", `${width}px`);
  };

  const setHover = (el) => {
    links.forEach(a => a.classList.toggle("hover", a === el));
    if (el) moveSpotTo(el);
  };

  // Events
  nav.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    const el = linkFromTouch(t);
    if (!el) return;
    dragging = true;
    nav.classList.add("dragging");
    setHover(el);
    // Verhindert Scrollen/“Pull to refresh” während der Geste
    e.preventDefault();
  }, { passive: false });

  nav.addEventListener("touchmove", (e) => {
    if (!dragging) return;
    const t = e.touches[0];
    const el = linkFromTouch(t);
    if (el) setHover(el);
    e.preventDefault();
  }, { passive: false });

  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    nav.classList.remove("dragging");
    links.forEach(a => a.classList.remove("hover"));

    // Auslösen der Navigation auf dem Icon, wo losgelassen wurde
    const t = e.changedTouches && e.changedTouches[0];
    const el = t ? linkFromTouch(t) : null;
    if (el) {
      const href = el.getAttribute("href") || `#/${el.getAttribute("data-route") || ""}`;
      if (href) {
        location.hash = href;
        setRoute(location.hash);
      }
    }
    // Spot zurück auf aktiven Tab setzen
    updateNavSpot();
  };

  nav.addEventListener("touchend", end);
  nav.addEventListener("touchcancel", end);
}


// bei Resize neu positionieren
window.addEventListener("resize", updateNavSpot);
// bei Orientation-Change (iOS/Android) hilft Resize bereits, doppelt ist ok


/* ---------- Views ---------- */
function render(){
  const view = q("#view");
  if(state.route === "heute"){
    view.innerHTML = q("#tpl-heute").innerHTML;
    renderHeute(view);
  } else if(state.route === "kalender"){
    view.innerHTML = q("#tpl-kalender").innerHTML;
    renderKalender(view);
  } else if(state.route === "einstellungen"){
    view.innerHTML = q("#tpl-settings").innerHTML;
    renderSettings(view);
  } else if(state.route === "konfigurieren"){
    view.innerHTML = q("#tpl-konfig").innerHTML;
    renderKonfig(view);
  } else if(state.route === "konfig-editor"){
    view.innerHTML = q("#tpl-konfig-editor").innerHTML;
    renderKonfigEditor(view);
  } else {
    view.innerHTML = q("#tpl-404").innerHTML;
  }
}


/* Heute */
/* Heute */
function renderHeute(root){
  const today = new Date();
  const key = todayKey(today);
  const entry = state.plans[key] || { type:"", note:"" };
  const done = !!state.done[key];

  q("#today-title", root).textContent = "Heute";
  q("#today-date", root).textContent = fmtLong(today);


  
  const pill = q("#today-plan-pill", root);
  pill.textContent = entry.type ? entry.type : "Ruhetag / frei";
  pill.style.background = "none";
  q("#today-note", root).textContent = entry.note || "";

  // Nächste Termine
  const upcomingList = q("#upcoming-list", root);
  const upcoming = nextEntries(7);
  upcomingList.innerHTML = upcoming.length
    ? upcoming.map(e => `<li><span>${e.dateLabel}</span><span class="badge">${e.type || "frei"}</span></li>`).join("")
    : `<li><span>Keine Einträge in den nächsten Tagen.</span></li>`;

  // Stats
  q("#stat-streak", root).textContent = String(calcStreak());
  q("#stat-7d", root).textContent = successRate(7) + "%";
  q("#stat-30d", root).textContent = successRate(30) + "%";

  // Actions & Stoppuhr-Referenzen
  const btnStart = q("#btn-start", root);
  const btnDone  = q("#btn-done",  root);
  const btnSkip  = q("#btn-skip",  root);
  const btnPlan  = root.querySelector(".actions a.btn.ghost"); // "Plan bearbeiten"

  const sw       = q("#sw", root);
  const swTimes  = qa(".js-sw-time", root);
  const swBadge  = q("#sw-plan-badge", root);
  const swState  = q("#sw-state-badge", root);
  const swStop   = q("#btn-sw-stop", root);
  const swPause  = q("#btn-sw-pause", root);
  const swToggle = q("#btn-sw-toggle", root);

  const t = state.timer;
  const running = !!t.startedAt || t.paused;
  const trainingDay = isTrainingDay(key);
    // Heute wie Kalender scrollen lassen, wenn Trainingstag
  


  // === NEU: Bei Ruhetag Stoppuhr komplett entfernen und passende Buttons zeigen ===
  if (!trainingDay){
    // Stoppuhr sauber entfernen (falls im Template vorhanden)
    if (sw) {
      stopUiTicker(); // sicherheitshalber Ticker stoppen
      sw.remove();
    }
    // Buttons: nichts starten/erledigen/überspringen bei Ruhetag
    btnStart.hidden = true;
    btnDone.hidden  = true;
    btnSkip.hidden  = true;
    if (btnPlan) btnPlan.hidden = false;

    // Refresh-Helper aktualisiert nur Stats/Labels, ohne Stoppuhr
    window.__refreshHeute = () => {
      if(q("#view") && state.route==="heute"){
        q("#stat-streak", root).textContent = String(calcStreak());
        q("#stat-7d", root).textContent = successRate(7) + "%";
        q("#stat-30d", root).textContent = successRate(30) + "%";
      }
    };
    return; // << Früh raus – keine Stoppuhr-Logik mehr anfassen
  }

  // === Ab hier: Trainingstag (wie gehabt) ===
  btnStart.hidden = !(trainingDay && !running && !done);
  btnDone.hidden  = !running;
  btnSkip.hidden  = !running;
  swPause.hidden  = !running;
  swStop.hidden   = !running;
  btnSkip.hidden  = running || !trainingDay;
  if (btnPlan) btnPlan.hidden = running;

  if (!btnDone.hidden){
    btnDone.disabled = !!t.startedAt;
    btnDone.textContent = done ? "Erledigt ✔" : "Training erledigt";
    btnDone.classList.toggle("subtle", done);
  }

  // Sichtbarkeit/Status der Stoppuhr
  sw.hidden = !running;
  sw.classList.toggle("is-paused", t.paused);
  sw.classList.toggle("is-collapsed", !!state.swUi?.collapsed);

  if(!sw.hidden){
    // Header-Badges/Zustand
    swBadge.textContent = entry.type || "Training";

    // Titel/Status
    const swTitle = q(".sw-title", root);
    if (done) {
      swTitle.textContent = "Training erledigt";
      swState.textContent = "✔";
    } else {
      swTitle.textContent = "Aktives Training";
      swState.textContent = t.paused ? "Pausiert" : "Läuft";
    }

    // Toggle
    const collapsed = !!state.swUi?.collapsed;
    swToggle.textContent = collapsed ? "＋" : "−";
    swToggle.setAttribute("aria-label", collapsed ? "Stoppuhr ausklappen" : "Stoppuhr einklappen");
    swToggle.title = collapsed ? "Ausklappen" : "Einklappen";

    // Pause/Fortsetzen Label
    swPause.textContent = t.paused ? "Fortsetzen" : "Pausieren";

    // Zeit-Ticker
    startUiTicker(() => {
      const val = fmtHMS(getElapsedMs());
      swTimes.forEach(el => { el.textContent = val; });
    });

    // Gewichte-Liste für das aktive Training
    const weightsWrap = q("#sw-weights", root);
    weightsWrap.innerHTML = "";

    const activeTraining = getTrainingByName(entry.type);
    if (activeTraining && Array.isArray(activeTraining.geraete) && activeTraining.geraete.length){
      activeTraining.geraete.forEach((g, idx) => {
        const row = document.createElement("div");
        row.className = "weight-row";
        row.dataset.deviceName = g.name;

        const left = document.createElement("div");
        left.className = "label";
        const title = document.createElement("div");
        title.textContent = g.name || `Gerät ${idx+1}`;
        const sub = document.createElement("div");
        sub.className = "sub";
        const lastW = (g.weight === 0 || g.weight) ? `${g.weight} kg` : "–";
        sub.textContent = `Letztes Gewicht: ${lastW}`;
        left.appendChild(title);
        left.appendChild(sub);

        const input = document.createElement("input");
        input.type = "number";
        input.step = "0.5";
        input.min = "0";
        input.placeholder = "Aktuell";
        input.className = "gear-input weight-input";
        if (g.weight === 0 || g.weight) input.value = String(g.weight);

        row.appendChild(left);
        row.appendChild(input);
        weightsWrap.appendChild(row);
      });
    } else {
      weightsWrap.innerHTML = `<div class="muted">Für „${entry.type || "Training"}“ sind keine Geräte hinterlegt.</div>`;
    }
  } else {
    stopUiTicker();
  }

  // Handlers
  btnStart.onclick = () => { startTraining(); renderHeute(root); };
  btnDone.onclick  = () => {
    state.done[key] = true;
    saveDone();
    renderHeute(root);
  };
  btnSkip.onclick  = () => {
    if(t.startedAt || t.paused){ stopTraining(false); }
    state.done[key] = false;
    saveDone();
    state.plans[key] = { type:"", note:"" };
    savePlans();
    renderHeute(root);
  };
  swStop.onclick = () => {
    // Gewichte als neue Defaults speichern
    if (entry.type){
      const tr = getTrainingByName(entry.type);
      if (tr && Array.isArray(tr.geraete)){
        const rows = [...q("#sw-weights", root).querySelectorAll(".weight-row")];
        rows.forEach(row => {
          const n = row.dataset.deviceName || "";
          const inp = row.querySelector("input[type='number']");
          const vRaw = inp?.value?.trim();
          const v = (vRaw === "" || vRaw === null || vRaw === undefined) ? null : Number(vRaw);
          const gi = tr.geraete.findIndex(x => String(x?.name || "").toLowerCase() === n.toLowerCase());
          if (gi >= 0){
            tr.geraete[gi] = {
              name: tr.geraete[gi].name,
              weight: (v === 0 || v) ? v : null
            };
          }
        });
        saveTrainings();
      }
    }
    stopTraining(true);
    renderHeute(root);
  };

  swPause.onclick = () => {
    if (t.paused) resumeTraining(); else pauseTraining();
    renderHeute(root);
  };
  swToggle.onclick = () => {
    state.swUi = { collapsed: !state.swUi?.collapsed };
    saveJSON(STORAGE_SW_UI, state.swUi);
    renderHeute(root);
  };

  // Sichtbarkeits-Refresh
  window.__refreshHeute = () => {
    if(q("#view") && state.route==="heute"){
      if(!sw.hidden){
        const val = fmtHMS(getElapsedMs());
        swTimes.forEach(el => { el.textContent = val; });
        swState.textContent = state.timer.paused ? "Pausiert" : "Läuft";
        swPause.textContent = state.timer.paused ? "Fortsetzen" : "Pausieren";
      }
      q("#stat-streak", root).textContent = String(calcStreak());
      q("#stat-7d", root).textContent = successRate(7) + "%";
      q("#stat-30d", root).textContent = successRate(30) + "%";
    }
  };
}






function nextEntries(days){
  const res = [];
  const start = new Date();
  for(let i=0;i<days;i++){
    const d = new Date(start);
    d.setDate(d.getDate()+i+1);
    const key = todayKey(d);
    const entry = state.plans[key];
    if(entry && (entry.type || entry.note)){
      res.push({ dateLabel: d.toLocaleDateString("de-CH", { weekday:"short", day:"2-digit", month:"2-digit" }), type: entry.type });
    }
  }
  return res.slice(0,5);
}

/* Kalender */
function renderKalender(root){
  const title = q("#cal-title", root);
  const cal = q("#calendar", root);
  const prev = q("#cal-prev", root);
  const next = q("#cal-next", root);
  const select = q("#training-type", root);
  const note = q("#training-note", root);
  const saveBtn = q("#btn-save", root);
  const clearBtn = q("#btn-clear", root);
  const label = q("#edit-date-label", root);

  // Templates UI
  const tplSelect = q("#tpl-select", root);
  const tplApply  = q("#btn-tpl-apply", root);
  const tplSave   = q("#btn-tpl-save", root);
  const btnCopy   = q("#btn-copy-weeks", root);

  updateCalTitle();
  populateTrainingOptions();

function populateTrainingOptions(){
  // Lass die erste Option (Ruhetag) stehen, räume den Rest
  [...select.querySelectorAll("option:not([value=''])")].forEach(o => o.remove());
  state.trainings.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item.name; 
    opt.textContent = item.name;
    select.appendChild(opt);
  });
}


  function updateCalTitle(){
    title.textContent = state.monthCursor.toLocaleDateString("de-CH", { month:"long", year:"numeric" });
  }

  function buildCalendar(){
    cal.innerHTML = "";
    // Wochentagsleiste
    const weekdays = ["Mo","Di","Mi","Do","Fr","Sa","So"];
    const head = document.createElement("div");
    head.className = "cal-weekdays";
    head.innerHTML = weekdays.map(w => `<div>${w}</div>`).join("");
    cal.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "cal-grid";

    const year = state.monthCursor.getFullYear();
    const month = state.monthCursor.getMonth();

    const firstOfMonth = new Date(year, month, 1);
    const startIndex = (firstOfMonth.getDay() + 6) % 7; // Mo=0,...So=6

    const daysInMonth = new Date(year, month+1, 0).getDate();
    const daysPrevMonth = new Date(year, month, 0).getDate();

    for(let i=startIndex-1; i>=0; i--){
      const dayNum = daysPrevMonth - i;
      grid.appendChild(dayCell(new Date(year, month-1, dayNum), true));
    }
    for(let d=1; d<=daysInMonth; d++){
      grid.appendChild(dayCell(new Date(year, month, d), false));
    }
    const total = startIndex + daysInMonth;
    const tail = (7 - (total % 7)) % 7;
    for(let i=1; i<=tail; i++){
      grid.appendChild(dayCell(new Date(year, month+1, i), true));
    }
    cal.appendChild(grid);
  }

function dayCell(date, out){
  const key = todayKey(date);
  const entry = state.plans[key];

  const div = document.createElement("button");
  div.type = "button";
  div.className = "day" + (out ? " out" : "");
  if(todayKey() === key) div.classList.add("today");

  // Neu: statt Tag-Text eine Farbfüllung per Klasse
  if (entry && (entry.type || entry.note)){
    div.classList.add("has-training");
  }

  div.setAttribute("role","gridcell");
  div.setAttribute("aria-label", `${fmtLong(date)}${
    entry?.type ? " – " + entry.type : (entry?.note ? " – " + entry.note : "")
  }`);

  const t = document.createElement("div");
  t.className = "num";
  t.textContent = date.getDate();
  div.appendChild(t);

  // Hinweis: KEIN tag/dot mehr anhängen – Füllung kommt aus CSS

  div.addEventListener("click", () => {
    state.selectedDate = key;
    label.textContent = keyToDate(key).toLocaleDateString("de-CH", {
      weekday:"long", day:"2-digit", month:"long", year:"numeric"
    });
    const e = state.plans[key] || { type:"", note:"" };
    populateTrainingOptions(); // falls Konfiguration geöffnet wurde
    select.value = e.type || "";
    note.value = e.note || "";
    qa(".day", cal).forEach(d => d.style.outline = "");
    div.style.outline = "2px solid rgba(34,211,238,.6)";
  });

  return div;
}


  prev.addEventListener("click", () => {
    state.monthCursor.setMonth(state.monthCursor.getMonth()-1);
    updateCalTitle(); buildCalendar();
  });
  next.addEventListener("click", () => {
    state.monthCursor.setMonth(state.monthCursor.getMonth()+1);
    updateCalTitle(); buildCalendar();
  });

saveBtn.addEventListener("click", () => {
  if(!state.selectedDate) state.selectedDate = todayKey(state.monthCursor);
  const type = select.value.trim();
  const n = note.value.trim();

  const isToday = state.selectedDate === todayKey();

  if(!type && !n){
    // Plan-Eintrag löschen
    delete state.plans[state.selectedDate];

    if (isToday) {
      // Heutigen "done"-Status zurücksetzen und evtl. laufenden Timer stoppen (ohne als erledigt zu markieren)
      if (state.done && state.done[state.selectedDate] !== undefined) {
        delete state.done[state.selectedDate];
        saveDone();
      }
      stopTraining(false);
    }
  } else {
    // Plan setzen/aktualisieren
    state.plans[state.selectedDate] = { type, note:n };
  }

  savePlans();
  buildCalendar();
});


clearBtn.addEventListener("click", () => {
  if(!state.selectedDate) return;

  const isToday = state.selectedDate === todayKey();

  // Plan-Eintrag löschen
  delete state.plans[state.selectedDate];
  savePlans();

  if (isToday) {
    // Heutigen "done"-Status zurücksetzen und evtl. laufenden Timer stoppen (ohne als erledigt zu markieren)
    if (state.done && state.done[state.selectedDate] !== undefined) {
      delete state.done[state.selectedDate];
      saveDone();
    }
    stopTraining(false);
  }

  select.value = "";
  note.value = "";
  buildCalendar();
});


  function refreshTplSelect(){
    tplSelect.innerHTML = "";
    const opt = (v,l)=>{ const o=document.createElement("option"); o.value=v; o.textContent=l; return o; };
    tplSelect.appendChild(opt("", "— Vorlage wählen —"));
    Object.keys(state.templates).sort().forEach(name=>{
      tplSelect.appendChild(opt(name, name + " • " + state.templates[name].type));
    });
  }
  refreshTplSelect();

  tplApply.addEventListener("click", () => {
    const name = tplSelect.value;
    if(!name) return;
    const tpl = state.templates[name];
    if(!tpl) return;
    populateTrainingOptions();
    select.value = tpl.type || "";
    note.value = tpl.note || "";
  });

  tplSave.addEventListener("click", () => {
    const type = select.value.trim();
    const n = note.value.trim();
    if(!type && !n){
      alert("Bitte zuerst Training oder Notiz eingeben, dann als Vorlage speichern.");
      return;
    }
    const name = prompt("Name der Vorlage:");
    if(!name) return;
    state.templates[name] = { type, note:n };
    saveTemplates();
    refreshTplSelect();
    tplSelect.value = name;
  });

  btnCopy.addEventListener("click", () => {
    if(!state.selectedDate) return;
    const base = state.plans[state.selectedDate] || { type: select.value.trim(), note: note.value.trim() };
    if(!base.type && !base.note){ alert("Kein Inhalt zum Kopieren."); return; }
    const from = keyToDate(state.selectedDate);
    for(let w=1; w<=4; w++){
      const d = new Date(from);
      d.setDate(from.getDate() + w*7);
      const k = todayKey(d);
      state.plans[k] = { ...base };
    }
    savePlans();
    buildCalendar();
    alert("Auf die nächsten 4 Wochen kopiert.");
  });

  state.selectedDate = todayKey();
  label.textContent = keyToDate(state.selectedDate).toLocaleDateString("de-CH", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });

  buildCalendar();
}


/* Einstellungen */
function renderSettings(root){
  const btnExport = q("#btn-export", root);
  const fileInput = q("#file-import", root);
  const btnReset  = q("#btn-reset", root);

  btnExport.addEventListener("click", () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      plans: state.plans,
      done: state.done,
      templates: state.templates
    };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "gymplan-backup.json";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    try{
      const text = await file.text();
      const data = JSON.parse(text);
      if(!data || typeof data !== "object") throw new Error("Ungültige Datei");
      state.plans = data.plans || {};
      state.done  = data.done  || {};
      state.templates = data.templates || {};
      savePlans(); saveDone(); saveTemplates();
      alert("Import erfolgreich.");
      location.hash = "#/heute";
      setRoute(location.hash);
    }catch(err){
      alert("Import fehlgeschlagen: " + err.message);
    }finally{
      e.target.value = "";
    }
  });

  btnReset.addEventListener("click", () => {
    if(!confirm("Wirklich alle lokalen Daten löschen? Dies kann nicht rückgängig gemacht werden.")) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_DONE);
    localStorage.removeItem(STORAGE_TPL);
    state.plans = {};
    state.done = {};
    state.templates = loadTemplates();
    alert("Daten gelöscht.");
    location.hash = "#/heute";
    setRoute(location.hash);
  });
}

function renderKonfig(root){
  const btnNew = q("#cfg-new", root);
  const list = q("#cfg-list", root);

  function renderList(){
    list.innerHTML = "";
      if (!state.trainings.length){
        list.innerHTML = `<div class="cfg-empty">Keine Einheiten vorhanden.</div>`;
        return;
    }
    state.trainings.forEach((item, idx) => {
      const li = document.createElement("li");

      const left = document.createElement("div");
      left.style.display = "grid";
      left.style.gap = "2px";

      const title = document.createElement("div");
      title.className = "cfg-item-name";
      title.textContent = item.name;

      const sub = document.createElement("div");
      sub.className = "cfg-item-sub";
      const count = Array.isArray(item.geraete) ? item.geraete.length : 0;
      sub.textContent = count ? `${count} Gerät(e)` : "Keine Geräte hinterlegt";

      left.appendChild(title);
      left.appendChild(sub);

      const right = document.createElement("div");
      right.className = "cfg-actions";

      const btnEdit = document.createElement("button");
      btnEdit.className = "cfg-list-btn";
      btnEdit.textContent = "Bearbeiten";
      btnEdit.addEventListener("click", () => {
        state.konfigEditIndex = idx;
        location.hash = "#/konfig-editor";
      });

      const btnDel = document.createElement("button");
      btnDel.className = "cfg-list-btn";
      btnDel.textContent = "Löschen";
      btnDel.addEventListener("click", () => {
        if(!confirm(`„${item.name}“ wirklich löschen?`)) return;
        state.trainings.splice(idx,1);
        saveTrainings();
        renderList();
      });

      right.appendChild(btnEdit);
      right.appendChild(btnDel);

      li.appendChild(left);
      li.appendChild(right);
      list.appendChild(li);
    });
  }

  btnNew.addEventListener("click", () => {
    state.konfigEditIndex = -1; // Neu
    location.hash = "#/konfig-editor";
  });

  renderList();
}

function renderKonfigEditor(root){
  const title = q("#ke-title", root);
  const inputName = q("#ke-name", root);
  const list = q("#ke-geraete-list", root);
  const btnAdd = q("#ke-add", root);
  const btnSave = q("#ke-save", root);
  const hint = q("#ke-hint", root);

  const editIndex = (typeof state.konfigEditIndex === "number") ? state.konfigEditIndex : -1;
  const isEdit = editIndex >= 0 && editIndex < state.trainings.length;

  title.textContent = isEdit ? "Trainingseinheit bearbeiten" : "Neue Trainingseinheit";

  function randomAccent(){
    const h = Math.floor(Math.random() * 360);
    return `hsl(${h} 80% 58%)`;
  }

  // NEU: addInput mit Titel ("Gerät 1", "Gerät 2", ...)
function addInput(value="", idx=1, weight=null){
  const wrap = document.createElement("div");
  wrap.className = "gear-item";
  wrap.style.setProperty("--gear-color", randomAccent());

  const label = document.createElement("div");
  label.className = "gear-title";
  label.textContent = `Gerät ${idx}`;

  const row = document.createElement("div");
  row.className = "gear-row";

  const inputName = document.createElement("input");
  inputName.type = "text";
  inputName.placeholder = "z. B. Langhantel";
  inputName.className = "gear-input";
  inputName.value = value || "";

  const inputWeight = document.createElement("input");
  inputWeight.type = "number";
  inputWeight.step = "0.5";
  inputWeight.min = "0";
  inputWeight.placeholder = "Gewicht";
  inputWeight.className = "gear-input weight-input";
  if (weight === 0 || weight) inputWeight.value = String(weight);

  row.appendChild(inputName);
  row.appendChild(inputWeight);

  wrap.appendChild(label);
  wrap.appendChild(row);
  list.appendChild(wrap);
}


function setValues(arr){
  list.innerHTML = "";
  const vals = Array.isArray(arr) ? arr : [];
  // vorhandene Werte mit korrekter Nummerierung (Objekt- oder String-Form unterstützen)
  vals.forEach((v, i) => {
    if (typeof v === "string") {
      addInput(v, i+1, null);
    } else {
      addInput(v?.name || "", i+1, (v && (v.weight === 0 || v.weight)) ? Number(v.weight) : null);
    }
  });
  // Minimum 3 Felder
  while(list.querySelectorAll(".gear-item").length < 3){
    const count = list.querySelectorAll(".gear-item").length;
    addInput("", count+1, null);
  }
}


  if (isEdit){
    const it = state.trainings[editIndex];
    inputName.value = it.name || "";
    setValues(Array.isArray(it.geraete) ? it.geraete : []);
    hint.textContent = `Bearbeiten: ${it.name}`;
  } else {
    inputName.value = "";
    setValues([]); // erzeugt 3 leere, nummerierte Felder
    hint.textContent = "Neu anlegen";
  }

  btnAdd.addEventListener("click", () => {
    const count = list.querySelectorAll(".gear-input").length;
    addInput("", count+1);
    const last = list.querySelector(".gear-item:last-child .gear-input");
    if(last) last.focus();
  });

btnSave.addEventListener("click", () => {
  const name = inputName.value.trim();
  const rows = [...list.querySelectorAll(".gear-item")];

  const geraete = rows.map(row => {
    const inputs = row.querySelectorAll(".gear-row .gear-input");
    const n = inputs[0]?.value?.trim() || "";
    const wRaw = inputs[1]?.value?.trim();
    const w = (wRaw === "" || wRaw === null || wRaw === undefined) ? null : Number(wRaw);
    if (!n) return null;
    return { name: n, weight: (w === 0 || w) ? w : null };
  }).filter(Boolean);

  if(!name){
    alert("Bitte einen Namen eingeben.");
    return;
  }

  // Duplikate verhindern (Name eindeutig)
  const nameExists = state.trainings.some((t, i) =>
    i !== editIndex && String(t.name || "").toLowerCase() === name.toLowerCase()
  );
  if (nameExists){
    alert("Es existiert bereits eine Einheit mit diesem Namen.");
    return;
  }

  if (isEdit){
    state.trainings[editIndex] = { name, geraete };
  } else {
    state.trainings.push({ name, geraete });
  }
  saveTrainings();
  location.hash = "#/konfigurieren";
});

}






/* ---------- Init ---------- */
window.addEventListener("hashchange", () => setRoute(location.hash));

document.addEventListener("DOMContentLoaded", () => {
  if (!location.hash) location.hash = "#/heute";
  setRoute(location.hash);

  // Spotlight initial ausrichten (nach erstem Render)
  updateNavSpot();

  // Mobile 9-Punkte-Menü (falls im DOM vorhanden)
  (function initMobileMenu(){
    const btn = q("#menu-btn");
    const pop = q("#menu-pop");
    if(!btn || !pop) return;

    function openMenu(){
      pop.classList.add("active");
      btn.setAttribute("aria-expanded", "true");
      pop.setAttribute("aria-hidden", "false");
      const first = pop.querySelector(".menu-item");
      if(first) first.focus();
    }
    function closeMenu(){
      pop.classList.remove("active");
      btn.setAttribute("aria-expanded", "false");
      pop.setAttribute("aria-hidden", "true");
    }
    function toggleMenu(e){
      e.stopPropagation();
      if(pop.classList.contains("active")) closeMenu(); else openMenu();
    }

    btn.addEventListener("click", toggleMenu);
    document.addEventListener("click", (e) => {
      if(pop.classList.contains("active") && !pop.contains(e.target) && e.target !== btn){
        closeMenu();
      }
    });
    document.addEventListener("keydown", (e) => {
      if(e.key === "Escape") closeMenu();
    });
    pop.querySelectorAll(".menu-item").forEach(a => {
      a.addEventListener("click", () => { closeMenu(); });
    });
  })();

  // 👉 Unsere neue Drag-/Scrub-Geste aktivieren
  initNavDrag();

  // Bei Resize die Spot-Position aktualisieren
  window.addEventListener("resize", updateNavSpot);
});
