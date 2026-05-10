/**
 * Workout Tracker page: templates (days A/B/C), session logging, Firebase via window.workoutStore
 */
(function () {
  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function formatDisplayDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    if (!y) return iso;
    return `${m}/${d}/${y}`;
  }

  const state = {
    session: {
      isoDate: null,
      dayPlan: 'A',
      exercises: [],
      currentIndex: 0
    },
    editDay: 'A',
    editRows: [],
    templatesCache: { A: [], B: [], C: [] },
    editingSetIndex: null,
    progressSelectedPath: null,
    historyShowAll: false,
    historyCollapsed: false,
    historyListForPanel: null
  };

  const CARDIO_PRESETS = ['Walk', 'Inclined walk', 'Boxing'];

  function isCardioExercise(ex) {
    return ex && String(ex.name || '').trim().toLowerCase() === 'cardio';
  }

  function mapSetFromStored(s, ex) {
    if (isCardioExercise(ex)) {
      return {
        minutes: s.minutes,
        cardioActivity: s.cardioActivity != null ? String(s.cardioActivity) : ''
      };
    }
    let w = s.weightKg;
    if (w === '' || w == null) w = null;
    else {
      const n = Number(w);
      if (Number.isNaN(n)) w = null;
      else if (n === 0) w = null;
      else w = n;
    }
    return { weightKg: w, reps: s.reps };
  }

  function $(id) {
    return document.getElementById(id);
  }

  function openModal(el) {
    if (!el) return;
    el.style.display = 'flex';
    el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(el) {
    if (!el) return;
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function openLogWorkoutModal() {
    const dateInput = $('log-workout-date');
    if (dateInput) {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dateInput.value = `${y}-${m}-${day}`;
    }
    const a = $('workout-day-a');
    if (a) a.checked = true;
    openModal($('log-workout-modal'));
    $('log-workout-modal-close') && $('log-workout-modal-close').focus();
  }

  function closeLogWorkoutModal() {
    closeModal($('log-workout-modal'));
    $('log-workout-btn') && $('log-workout-btn').focus();
  }

  window.closeLogWorkoutModal = closeLogWorkoutModal;

  function buildSessionPayload() {
    return {
      dayPlan: state.session.dayPlan,
      exercises: state.session.exercises.map((ex) => ({
        templateId: ex.templateId || null,
        oneOff: !!ex.oneOff,
        name: ex.name,
        sets: (ex.sets || []).map((s) => {
          if (isCardioExercise(ex)) {
            return {
              minutes: s.minutes === '' || s.minutes == null ? null : Number(s.minutes),
              cardioActivity: s.cardioActivity != null ? String(s.cardioActivity).trim() : ''
            };
          }
          return {
            weightKg: s.weightKg === '' || s.weightKg == null ? null : Number(s.weightKg),
            reps: s.reps === '' || s.reps == null ? null : Number(s.reps)
          };
        })
      }))
    };
  }

  async function persistSession() {
    if (!state.session.isoDate) return;
    const ws = window.workoutStore;
    if (!ws) return;
    await ws.saveSession(state.session.isoDate, buildSessionPayload());
  }

  async function mergeSessionForContinue(isoDate, dayPlan) {
    const ws = window.workoutStore;
    const templates = await ws.getTemplates();
    state.templatesCache = templates;
    const list = templates[dayPlan] || [];
    const existing = await ws.getSession(isoDate);
    const existingRows = existing && existing.exercises ? existing.exercises : [];

    const templateIdsInSession = new Set();
    const exercises = existingRows.map((ex) => {
      if (ex.templateId) templateIdsInSession.add(ex.templateId);
      const stub = { name: ex.name };
      return {
        templateId: ex.templateId || null,
        oneOff: !!ex.oneOff,
        name: ex.name || 'Exercise',
        sets: Array.isArray(ex.sets) ? ex.sets.map((s) => mapSetFromStored(s, stub)) : []
      };
    });

    for (const t of list) {
      if (templateIdsInSession.has(t.id)) continue;
      templateIdsInSession.add(t.id);
      exercises.push({
        templateId: t.id,
        oneOff: false,
        name: t.name,
        sets: []
      });
    }

    state.session = {
      isoDate,
      dayPlan,
      exercises,
      currentIndex: 0
    };
  }

  function currentExercise() {
    return state.session.exercises[state.session.currentIndex];
  }

  function strengthSetCarryoverState(s) {
    if (!s) return null;
    const w = s.weightKg;
    if (w === '' || w == null) return { kind: 'bw' };
    const n = Number(w);
    if (Number.isNaN(n)) return null;
    if (n === 0) return { kind: 'bw' };
    return { kind: 'kg', val: n };
  }

  function getLastStrengthCarryover(ex, excludeIndex) {
    if (isCardioExercise(ex)) return null;
    const sets = ex && ex.sets ? ex.sets : [];
    for (let i = sets.length - 1; i >= 0; i--) {
      if (excludeIndex != null && i === excludeIndex) continue;
      const st = strengthSetCarryoverState(sets[i]);
      if (st) return st;
    }
    return null;
  }

  function getLastLoggedMinutes(ex, excludeIndex) {
    if (!isCardioExercise(ex)) return null;
    const sets = ex && ex.sets ? ex.sets : [];
    for (let i = sets.length - 1; i >= 0; i--) {
      if (excludeIndex != null && i === excludeIndex) continue;
      const m = sets[i].minutes;
      if (m != null && m !== '' && !Number.isNaN(Number(m))) {
        return Number(m);
      }
    }
    return null;
  }

  function formatSetLine(ex, s, setNum) {
    if (isCardioExercise(ex)) {
      const m = s.minutes != null ? s.minutes : '—';
      const act = s.cardioActivity && String(s.cardioActivity).trim() ? String(s.cardioActivity).trim() : '—';
      return `Set ${setNum}: ${m} min · ${act}`;
    }
    const w = s.weightKg;
    const wLabel =
      w == null || w === '' || Number(w) === 0 ? 'Bodyweight' : `${w} kg`;
    const r = s.reps != null ? s.reps : '—';
    return `Set ${setNum}: ${wLabel} × ${r} reps`;
  }

  function weekdayLabelFromPath(path) {
    const [y, m, d] = path.split('/');
    if (!y || !m || !d) return '';
    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return names[date.getDay()] || '';
  }

  function formatProgressListLabel(path) {
    const [y, m, d] = path.split('/');
    const wk = weekdayLabelFromPath(path);
    if (!y || !m || !d) return path;
    return `${wk} · ${m}/${d}/${y}`;
  }

  function renderSetsToday() {
    const ul = $('workout-sets-today');
    if (!ul) return;
    const ex = currentExercise();
    ul.innerHTML = '';
    if (!ex) {
      ul.innerHTML = '<li class="workout-sets-empty">No exercise selected.</li>';
      return;
    }
    const sets = ex.sets || [];
    if (!sets.length) {
      ul.innerHTML = '<li class="workout-sets-empty">No sets logged yet for this exercise.</li>';
      return;
    }
    sets.forEach((s, i) => {
      const li = document.createElement('li');
      const editing = state.editingSetIndex === i;
      li.className = 'workout-set-chip' + (editing ? ' is-editing' : '');
      li.innerHTML = `
        <button type="button" class="workout-set-chip-main" data-set-index="${i}" aria-label="Edit set ${i + 1}">${escapeHtml(formatSetLine(ex, s, i + 1))}</button>
        <button type="button" class="workout-set-chip-delete" data-set-del="${i}" aria-label="Delete set ${i + 1}">×</button>`;
      ul.appendChild(li);
    });
  }

  function syncCardioOtherVisibility() {
    const sel = $('workout-cardio-activity');
    const other = $('workout-cardio-other');
    if (!sel || !other) return;
    const show = sel.value === '__other__';
    other.style.display = show ? '' : 'none';
  }

  function updateStrengthCardioFields(ex) {
    const str = $('workout-strength-fields');
    const car = $('workout-cardio-fields');
    if (!str || !car) return;
    const cardio = ex && isCardioExercise(ex);
    str.style.display = ex && !cardio ? '' : 'none';
    car.style.display = ex && cardio ? '' : 'none';
    if (cardio) syncCardioOtherVisibility();
  }

  function updateSaveNextButtons(ex) {
    const nextBtn = $('workout-next-exercise-btn');
    const prevBtn = $('workout-prev-exercise-btn');
    const cancelEdit = $('workout-cancel-edit-set-btn');
    const banner = $('workout-set-edit-banner');
    document.querySelectorAll('.workout-save-set-btn').forEach((btn) => {
      btn.textContent = state.editingSetIndex != null ? 'Update set' : 'Save set';
    });
    if (cancelEdit) {
      cancelEdit.style.display = state.editingSetIndex != null ? '' : 'none';
    }
    if (banner) {
      if (state.editingSetIndex != null && ex) {
        banner.style.display = '';
        banner.textContent = `Editing set ${state.editingSetIndex + 1} — save to apply or cancel.`;
      } else {
        banner.style.display = 'none';
        banner.textContent = '';
      }
    }
    const n = state.session.exercises.length;
    const idx = state.session.currentIndex;
    const isLast = n > 0 && idx >= n - 1;
    if (nextBtn) {
      nextBtn.textContent = isLast ? 'Done' : 'Next exercise';
      nextBtn.setAttribute('aria-label', isLast ? 'Finish and close workout log' : 'Finish this exercise and go to next');
    }
    if (prevBtn) {
      prevBtn.disabled = idx <= 0;
      prevBtn.style.opacity = idx <= 0 ? '0.45' : '';
    }
  }

  function renderSessionUI() {
    const ex = currentExercise();
    const title = $('workout-session-title');
    const prog = $('workout-session-progress');
    const nameEl = $('workout-current-name');
    const n = state.session.exercises.length;
    const idx = state.session.currentIndex;

    if (title) {
      title.textContent = `Log workout — ${formatDisplayDate(state.session.isoDate)} — Day ${state.session.dayPlan}`;
    }
    if (prog) {
      prog.textContent =
        n === 0
          ? 'No exercises in this plan — add below.'
          : `Exercise ${Math.min(idx + 1, Math.max(n, 1))} of ${n}`;
    }
    if (nameEl) {
      nameEl.textContent = ex ? ex.name : '—';
    }

    renderSetsToday();

    const row = $('workout-log-controls');
    if (row) row.style.display = ex ? 'flex' : 'none';

    const oneoff = $('workout-oneoff-row');
    if (oneoff) oneoff.style.display = 'flex';

    updateStrengthCardioFields(ex);
    updateSaveNextButtons(ex);

    renderWorkoutOutline();
    void refreshExerciseHistoryPanel();
  }

  function renderWorkoutOutline() {
    const wrap = $('workout-day-outline-wrap');
    const list = $('workout-day-outline-list');
    const titleEl = $('workout-day-outline-title');
    if (!wrap || !list || !titleEl) return;

    const { exercises, currentIndex, dayPlan } = state.session;
    titleEl.textContent = `Full list — Day ${dayPlan}`;

    if (!exercises.length) {
      list.innerHTML = '<li class="workout-outline-empty">No exercises in this plan yet.</li>';
      return;
    }

    list.innerHTML = exercises
      .map((ex, i) => {
        const isCurrent = i === currentIndex;
        const hasSets = ex.sets && ex.sets.length > 0;
        const badge = ex.oneOff
          ? ' <span class="workout-outline-badge">extra</span>'
          : '';
        const status = hasSets
          ? `<span class="workout-outline-status">${ex.sets.length} set${ex.sets.length === 1 ? '' : 's'}</span>`
          : '';
        const cls = [
          'workout-outline-item',
          isCurrent ? 'is-current' : '',
          hasSets ? 'has-sets' : ''
        ]
          .filter(Boolean)
          .join(' ');
        return `<li class="workout-outline-li">
          <button type="button" class="${cls}" data-outline-index="${i}" aria-current="${isCurrent ? 'true' : 'false'}">
            <span class="workout-outline-num">${i + 1}.</span>
            <span class="workout-outline-name">${escapeHtml(ex.name)}</span>${badge}${status ? ' ' + status : ''}
          </button>
        </li>`;
      })
      .join('');
  }

  function clearWorkoutInputs() {
    const w = $('workout-weight-input');
    const r = $('workout-reps-input');
    if (w) w.value = '';
    if (r) r.value = '';
    const m = $('workout-cardio-minutes');
    if (m) m.value = '';
    const sel = $('workout-cardio-activity');
    if (sel) sel.value = '';
    const o = $('workout-cardio-other');
    if (o) {
      o.value = '';
      o.style.display = 'none';
    }
  }

  function beginEditSet(i) {
    const ex = currentExercise();
    if (!ex || !ex.sets || i < 0 || i >= ex.sets.length) return;
    state.editingSetIndex = i;
    const s = ex.sets[i];
    if (isCardioExercise(ex)) {
      const wClear = $('workout-weight-input');
      const rClear = $('workout-reps-input');
      if (wClear) wClear.value = '';
      if (rClear) rClear.value = '';
      const minInp = $('workout-cardio-minutes');
      if (minInp) minInp.value = s.minutes != null ? String(s.minutes) : '';
      const act = (s.cardioActivity || '').trim();
      const sel = $('workout-cardio-activity');
      const other = $('workout-cardio-other');
      if (CARDIO_PRESETS.includes(act)) {
        if (sel) sel.value = act;
        if (other) {
          other.value = '';
          other.style.display = 'none';
        }
      } else if (act) {
        if (sel) sel.value = '__other__';
        if (other) {
          other.value = act;
          other.style.display = '';
        }
      } else {
        if (sel) sel.value = '';
        if (other) {
          other.value = '';
          other.style.display = 'none';
        }
      }
    } else {
      const wi = $('workout-weight-input');
      const ri = $('workout-reps-input');
      const wv = s.weightKg;
      if (wi) {
        wi.value =
          wv != null && wv !== '' && Number(wv) !== 0 && !Number.isNaN(Number(wv)) ? String(wv) : '';
      }
      if (ri) ri.value = s.reps != null ? String(s.reps) : '';
      const minInp = $('workout-cardio-minutes');
      if (minInp) minInp.value = '';
      const sel = $('workout-cardio-activity');
      if (sel) sel.value = '';
      const other = $('workout-cardio-other');
      if (other) {
        other.value = '';
        other.style.display = 'none';
      }
    }
    renderSessionUI();
    if (isCardioExercise(ex)) {
      const minInp = $('workout-cardio-minutes');
      if (minInp) minInp.focus();
    } else {
      const wi = $('workout-weight-input');
      if (wi) wi.focus();
    }
  }

  async function deleteSetAtIndex(i) {
    const ex = currentExercise();
    if (!ex || !ex.sets || i < 0 || i >= ex.sets.length) return;
    if (!confirm('Delete this set?')) return;
    ex.sets.splice(i, 1);
    if (state.editingSetIndex === i) state.editingSetIndex = null;
    else if (state.editingSetIndex != null && state.editingSetIndex > i) state.editingSetIndex--;
    clearWorkoutInputs();
    renderSessionUI();
    await persistSession();
  }

  function cancelEditSet() {
    state.editingSetIndex = null;
    clearWorkoutInputs();
    renderSessionUI();
  }

  async function openSessionOverlay(isoDate, dayPlan) {
    await mergeSessionForContinue(isoDate, dayPlan);
    closeLogWorkoutModal();
    state.editingSetIndex = null;
    openModal($('workout-session-overlay'));
    clearWorkoutInputs();
    state.historyCollapsed = false;
    state.historyShowAll = false;
    closeChangeDatePanel();
    renderSessionUI();
  }

  function closeSessionOverlay() {
    closeModal($('workout-session-overlay'));
    persistSession();
  }

  function closeChangeDatePanel() {
    const p = $('workout-change-date-panel');
    const b = $('workout-change-date-btn');
    if (p) p.style.display = 'none';
    if (b) b.setAttribute('aria-expanded', 'false');
  }

  function openChangeDatePanel() {
    const p = $('workout-change-date-panel');
    const b = $('workout-change-date-btn');
    const inp = $('workout-change-date-input');
    if (inp && state.session.isoDate) inp.value = state.session.isoDate;
    if (p) p.style.display = '';
    if (b) b.setAttribute('aria-expanded', 'true');
    if (inp) setTimeout(() => inp.focus(), 0);
  }

  async function applyWorkoutSessionDateChange() {
    const input = $('workout-change-date-input');
    const newIso = input && input.value;
    if (!newIso) {
      alert('Choose a date.');
      return;
    }
    const oldIso = state.session.isoDate;
    if (!oldIso || newIso === oldIso) {
      closeChangeDatePanel();
      return;
    }
    const ws = window.workoutStore;
    if (!ws) return;
    const target = await ws.getSession(newIso);
    if (target && ws.sessionRecordHasWork(target)) {
      alert('That date already has a logged workout. Choose a different date.');
      return;
    }
    const payload = buildSessionPayload();
    if (!ws._sessionPayloadHasWork(payload)) {
      alert('Log at least one set with reps before moving the session to another date.');
      return;
    }
    await ws.saveSession(newIso, payload);
    await ws.deleteSession(oldIso);
    state.session.isoDate = newIso;
    closeChangeDatePanel();
    renderSessionUI();
  }

  async function onSaveSet() {
    const ex = currentExercise();
    if (!ex) return;
    const excl = state.editingSetIndex;

    if (isCardioExercise(ex)) {
      const minInp = $('workout-cardio-minutes');
      const sel = $('workout-cardio-activity');
      const otherInp = $('workout-cardio-other');
      const minStr = minInp && String(minInp.value).trim() !== '' ? String(minInp.value).trim() : '';
      let minutesVal = minStr !== '' ? parseFloat(minStr) : NaN;
      let usedPrevMin = false;
      if (Number.isNaN(minutesVal) || minutesVal < 0) {
        const prevM = getLastLoggedMinutes(ex, excl);
        if (prevM != null && !Number.isNaN(prevM)) {
          minutesVal = prevM;
          usedPrevMin = true;
        } else {
          alert('Enter duration in minutes for this set.');
          return;
        }
      }

      const selVal = sel && sel.value;
      let activity = '';
      if (selVal === '__other__') {
        activity = otherInp ? otherInp.value.trim() : '';
        if (!activity) {
          alert('Type a name for the activity, or pick a preset.');
          return;
        }
      } else if (selVal) {
        activity = selVal;
      } else {
        alert('Choose an activity type.');
        return;
      }

      if (!ex.sets) ex.sets = [];
      const entry = { minutes: minutesVal, cardioActivity: activity };
      if (excl != null) {
        ex.sets[excl] = entry;
        state.editingSetIndex = null;
      } else {
        ex.sets.push(entry);
      }

      clearWorkoutInputs();

      if (usedPrevMin) {
        const hint = $('workout-session-hint');
        if (hint) {
          hint.textContent = `Saved using ${minutesVal} min from your previous set.`;
          setTimeout(() => {
            if (hint && hint.textContent.indexOf('Saved using') === 0) hint.textContent = '';
          }, 2800);
        }
      }

      renderSessionUI();
      await persistSession();
      return;
    }

    const w = $('workout-weight-input');
    const r = $('workout-reps-input');
    const wStr = w && String(w.value).trim() !== '' ? String(w.value).trim() : '';
    const rStr = r && String(r.value).trim() !== '' ? String(r.value).trim() : '';
    const repsVal = rStr !== '' ? parseInt(rStr, 10) : NaN;

    if (Number.isNaN(repsVal) || repsVal < 0) {
      alert('Enter a valid number of reps for this set.');
      return;
    }

    const rawW = wStr !== '' ? parseFloat(wStr) : NaN;
    const hasPositiveWeight = !Number.isNaN(rawW) && rawW > 0;
    let weightVal;
    let usedCarryover = false;
    let carryoverBw = false;

    if (hasPositiveWeight) {
      weightVal = rawW;
    } else {
      const prev = getLastStrengthCarryover(ex, excl);
      if (prev == null) {
        weightVal = null;
      } else if (prev.kind === 'bw') {
        weightVal = null;
        usedCarryover = true;
        carryoverBw = true;
      } else {
        weightVal = prev.val;
        usedCarryover = true;
      }
    }

    if (!ex.sets) ex.sets = [];
    const entry = { weightKg: weightVal, reps: repsVal };
    if (excl != null) {
      ex.sets[excl] = entry;
      state.editingSetIndex = null;
    } else {
      ex.sets.push(entry);
    }

    clearWorkoutInputs();

    if (usedCarryover) {
      const hint = $('workout-session-hint');
      if (hint) {
        hint.textContent = carryoverBw
          ? 'Saved as bodyweight (matching your previous set).'
          : `Saved using ${weightVal} kg from your previous set.`;
        setTimeout(() => {
          if (hint && hint.textContent.indexOf('Saved') === 0) hint.textContent = '';
        }, 2800);
      }
    }

    renderSessionUI();
    await persistSession();
  }

  async function onNextExercise() {
    const n = state.session.exercises.length;
    if (state.session.currentIndex < n - 1) {
      state.session.currentIndex++;
      state.editingSetIndex = null;
      clearWorkoutInputs();
      renderSessionUI();
      await persistSession();
    } else {
      state.editingSetIndex = null;
      clearWorkoutInputs();
      closeSessionOverlay();
    }
  }

  async function onPrevExercise() {
    if (state.session.currentIndex <= 0) return;
    state.session.currentIndex--;
    state.editingSetIndex = null;
    clearWorkoutInputs();
    renderSessionUI();
    await persistSession();
  }

  async function onAddOneOff() {
    const inp = $('workout-oneoff-name');
    const name = inp && inp.value.trim();
    if (!name) {
      alert('Type a name for the extra exercise.');
      return;
    }
    state.session.exercises.push({
      templateId: null,
      oneOff: true,
      name,
      sets: []
    });
    state.session.currentIndex = state.session.exercises.length - 1;
    state.editingSetIndex = null;
    if (inp) inp.value = '';
    clearWorkoutInputs();
    renderSessionUI();
    await persistSession();
  }

  function renderHistoryPanelBody() {
    const body = $('workout-history-body');
    const content = $('workout-history-content');
    const moreBtn = $('workout-history-more');
    const hist = state.historyListForPanel || [];
    if (!content || !body || !moreBtn) return;

    const limit = !hist.length
      ? 0
      : state.historyShowAll
        ? hist.length
        : Math.min(3, hist.length);

    if (!hist.length) {
      content.innerHTML =
        '<p class="workout-history-empty">No previous logs for this exercise.</p>';
    } else {
      const rows = hist.slice(0, limit);
      content.innerHTML = rows
        .map((h) => {
          const wStr = String(h.weightKg);
          const wCol = /\bmin\b/i.test(wStr) || wStr === 'Bodyweight' ? wStr : `${wStr} kg`;
          return `<div class="workout-history-line"><span class="workout-history-date">${escapeHtml(h.datePath)}</span> <span class="workout-history-w">${escapeHtml(wCol)}</span> <span class="workout-history-r">${escapeHtml(h.repsDisplay)}</span></div>`;
        })
        .join('');
    }

    if (state.historyCollapsed) {
      body.style.display = 'none';
      body.setAttribute('aria-hidden', 'true');
      moreBtn.style.display = hist.length > 0 ? '' : 'none';
      moreBtn.textContent = 'More';
      return;
    }

    body.style.display = '';
    body.removeAttribute('aria-hidden');

    if (!hist.length) {
      moreBtn.style.display = 'none';
      return;
    }

    if (state.historyShowAll) {
      moreBtn.style.display = '';
      moreBtn.textContent = 'Less';
    } else if (hist.length > 3) {
      moreBtn.style.display = '';
      moreBtn.textContent = 'More';
    } else {
      moreBtn.style.display = 'none';
    }
  }

  async function refreshExerciseHistoryPanel() {
    const ex = currentExercise();
    if (!ex) {
      state.historyListForPanel = [];
      renderHistoryPanelBody();
      return;
    }
    const ws = window.workoutStore;
    if (!ws) {
      state.historyListForPanel = [];
      renderHistoryPanelBody();
      return;
    }
    const { path } = ws.splitDatePath(state.session.isoDate);
    const hist = await ws.getExerciseHistory(ex.templateId, ex.name, path, 80);
    state.historyListForPanel = hist;
    renderHistoryPanelBody();
  }

  function closeHistory() {
    state.historyCollapsed = true;
    state.historyShowAll = false;
    renderHistoryPanelBody();
  }

  /* ---- Edit workout days A/B/C ---- */
  async function openEditModal() {
    const ws = window.workoutStore;
    state.templatesCache = await ws.getTemplates();
    state.editDay = 'A';
    state.editRows = (state.templatesCache.A || []).map((t) => ({ id: t.id, name: t.name }));
    openModal($('edit-workout-day-modal'));
    renderEditTabs();
    renderEditList();
  }

  function closeEditModal() {
    closeModal($('edit-workout-day-modal'));
  }

  function renderEditTabs() {
    document.querySelectorAll('[data-edit-day]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-edit-day') === state.editDay);
    });
  }

  function renderEditList() {
    const ul = $('edit-workout-list');
    if (!ul) return;
    ul.innerHTML = '';
    state.editRows.forEach((row, i) => {
      const li = document.createElement('li');
      li.className = 'edit-workout-item';
      li.innerHTML = `
        <input type="text" class="edit-workout-name-input" data-edit-index="${i}" value="${escapeHtml(row.name)}" placeholder="Exercise name" aria-label="Exercise name">
        <div class="edit-workout-item-actions">
          <button type="button" class="edit-workout-move" data-edit-up="${i}" aria-label="Move up">↑</button>
          <button type="button" class="edit-workout-move" data-edit-down="${i}" aria-label="Move down">↓</button>
          <button type="button" class="edit-workout-delete" data-edit-del="${i}" aria-label="Delete">×</button>
        </div>`;
      ul.appendChild(li);
    });
  }

  function switchEditDay(day) {
    if (day === state.editDay) return;
    const names = readEditRowsFromDom();
    state.templatesCache[state.editDay] = names
      .filter((r) => r.name.length)
      .map((r) => ({ id: r.id, name: r.name }));
    state.editDay = day;
    state.editRows = (state.templatesCache[day] || []).map((t) => ({ id: t.id, name: t.name }));
    renderEditTabs();
    renderEditList();
  }

  function readEditRowsFromDom() {
    const inputs = [...document.querySelectorAll('.edit-workout-name-input')];
    return inputs.map((inp, i) => ({
      id: state.editRows[i] ? state.editRows[i].id : uid(),
      name: inp.value.trim()
    }));
  }

  async function saveEditModal() {
    const names = readEditRowsFromDom();
    state.templatesCache[state.editDay] = names
      .filter((r) => r.name.length)
      .map((r) => ({ id: r.id, name: r.name }));
    await window.workoutStore.saveTemplates({ ...state.templatesCache });
    closeEditModal();
  }

  function onEditListClick(e) {
    const t = e.target.closest('[data-edit-up], [data-edit-down], [data-edit-del]');
    if (!t) return;
    const up = t.getAttribute('data-edit-up');
    const down = t.getAttribute('data-edit-down');
    const del = t.getAttribute('data-edit-del');
    const idx = up != null ? +up : down != null ? +down : del != null ? +del : -1;
    if (idx < 0) return;
    state.editRows = readEditRowsFromDom();
    if (up != null && idx > 0) {
      const t = state.editRows[idx - 1];
      state.editRows[idx - 1] = state.editRows[idx];
      state.editRows[idx] = t;
    } else if (down != null && idx < state.editRows.length - 1) {
      const t = state.editRows[idx + 1];
      state.editRows[idx + 1] = state.editRows[idx];
      state.editRows[idx] = t;
    } else if (del != null) {
      state.editRows.splice(idx, 1);
    }
    renderEditList();
  }

  function pathToSortTime(path) {
    const parts = (path || '').split('/');
    const y = parseInt(parts[0], 10);
    const mo = parseInt(parts[1], 10);
    const da = parseInt(parts[2], 10);
    if (Number.isNaN(y) || Number.isNaN(mo) || Number.isNaN(da)) return 0;
    return new Date(y, mo - 1, da).getTime();
  }

  /* ---- View progress ---- */
  async function openProgressModal() {
    const ws = window.workoutStore;
    const rawPaths = await ws.getRecentSessionPaths(120);
    const list = $('view-progress-list');
    const detail = $('view-progress-detail');
    state.progressSelectedPath = null;
    if (detail) detail.style.display = 'none';
    if (!list) return;
    const withWork = [];
    for (const p of rawPaths) {
      const sess = await ws.loadSessionByPath(p);
      if (ws.sessionRecordHasWork(sess)) withWork.push(p);
    }
    withWork.sort((a, b) => pathToSortTime(b) - pathToSortTime(a));
    const paths = withWork.slice(0, 25);
    if (!paths.length) {
      list.innerHTML = '<li class="workout-progress-empty">No logged sessions yet.</li>';
    } else {
      list.innerHTML = paths
        .map(
          (p) =>
            `<li class="workout-progress-li"><button type="button" class="workout-progress-item" data-session-path="${escapeHtml(p)}">${escapeHtml(formatProgressListLabel(p))}</button></li>`
        )
        .join('');
    }
    openModal($('view-progress-modal'));
  }

  async function showProgressSessionDetail(path) {
    state.progressSelectedPath = path;
    const detail = $('view-progress-detail');
    const titleEl = $('view-progress-detail-title');
    const body = $('view-progress-detail-body');
    if (!detail || !titleEl || !body) return;
    const ws = window.workoutStore;
    const session = await ws.loadSessionByPath(path);
    titleEl.textContent = formatProgressListLabel(path);
    if (!session || !Array.isArray(session.exercises) || !session.exercises.length) {
      body.innerHTML = '<p class="workout-progress-detail-empty">No exercises recorded for this day.</p>';
    } else {
      const withSets = session.exercises.filter((ex) => Array.isArray(ex.sets) && ex.sets.length > 0);
      if (!withSets.length) {
        body.innerHTML =
          '<p class="workout-progress-detail-empty">No sets logged for this day.</p>';
      } else {
        body.innerHTML = withSets
          .map((ex) => {
            const sets = ex.sets || [];
            const name = ex.name || 'Exercise';
            const stub = { name };
            const lines = sets
              .map((s, i) => `<li>${escapeHtml(formatSetLine(stub, s, i + 1))}</li>`)
              .join('');
            return `<div class="workout-progress-ex"><strong>${escapeHtml(name)}</strong><ul class="workout-progress-ex-sets">${lines}</ul></div>`;
          })
          .join('');
      }
    }
    detail.style.display = 'block';
  }

  function onProgressListClick(e) {
    const btn = e.target.closest('.workout-progress-item[data-session-path]');
    if (!btn) return;
    const path = btn.getAttribute('data-session-path');
    document.querySelectorAll('.workout-progress-item.is-selected').forEach((b) => b.classList.remove('is-selected'));
    btn.classList.add('is-selected');
    showProgressSessionDetail(path);
  }

  function closeProgressModal() {
    state.progressSelectedPath = null;
    const detail = $('view-progress-detail');
    if (detail) detail.style.display = 'none';
    closeModal($('view-progress-modal'));
  }

  async function exportAllWorkoutSessions() {
    const ws = window.workoutStore;
    if (!ws || typeof ws.exportAllWorkoutSessionsJson !== 'function') {
      alert('Export is not available.');
      return;
    }
    const btn = $('view-progress-export-btn');
    const prevText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Exporting…';
    }
    try {
      const data = await ws.exportAllWorkoutSessionsJson();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `workout-sessions-export-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Export failed. Try again after signing in, or check the browser console.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevText || 'Export all sessions';
      }
    }
  }

  function bindNavToggle() {
    const header = document.querySelector('.header');
    const btn = $('nav-toggle');
    const nav = document.querySelector('.app-nav');
    const root = document.documentElement;
    if (!btn || !header) return;

    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => {
      const openLocal = header.classList.toggle('nav-open');
      const openGlobal = root.classList.toggle('nav-open');
      btn.setAttribute('aria-expanded', String(openLocal || openGlobal));
    });

    nav &&
      nav.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') {
          header.classList.remove('nav-open');
          root.classList.remove('nav-open');
          btn.setAttribute('aria-expanded', 'false');
        }
      });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if ($('log-workout-modal') && $('log-workout-modal').style.display === 'flex') {
          if (typeof window.closeLogWorkoutModal === 'function') window.closeLogWorkoutModal();
          return;
        }
        if ($('workout-session-overlay') && $('workout-session-overlay').style.display === 'flex') {
          closeSessionOverlay();
          return;
        }
        if ($('edit-workout-day-modal') && $('edit-workout-day-modal').style.display === 'flex') {
          closeEditModal();
          return;
        }
        if ($('view-progress-modal') && $('view-progress-modal').style.display === 'flex') {
          closeProgressModal();
          return;
        }
        header.classList.remove('nav-open');
        root.classList.remove('nav-open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function initWorkoutTrackerPage() {
    bindNavToggle();

    $('log-workout-btn') && $('log-workout-btn').addEventListener('click', openLogWorkoutModal);
    $('log-workout-modal-close') &&
      $('log-workout-modal-close').addEventListener('click', closeLogWorkoutModal);
    $('log-workout-cancel') && $('log-workout-cancel').addEventListener('click', closeLogWorkoutModal);
    $('log-workout-modal-backdrop') &&
      $('log-workout-modal-backdrop').addEventListener('click', closeLogWorkoutModal);

    $('log-workout-continue') &&
      $('log-workout-continue').addEventListener('click', async () => {
        const dateInput = $('log-workout-date');
        const iso = dateInput && dateInput.value;
        if (!iso) {
          alert('Choose a workout date.');
          return;
        }
        const dayPlan = document.querySelector('input[name="workout-day"]:checked');
        const raw = dayPlan && dayPlan.value;
        const plan = raw === 'B' || raw === 'C' ? raw : 'A';
        await openSessionOverlay(iso, plan);
      });

    $('workout-session-close') &&
      $('workout-session-close').addEventListener('click', () => closeSessionOverlay());
    $('workout-session-backdrop') &&
      $('workout-session-backdrop').addEventListener('click', () => closeSessionOverlay());

    const setForm = $('workout-set-form');
    setForm &&
      setForm.addEventListener('submit', (e) => {
        e.preventDefault();
        onSaveSet();
      });
    $('workout-save-set-cardio-btn') &&
      $('workout-save-set-cardio-btn').addEventListener('click', () => onSaveSet());
    $('workout-cancel-edit-set-btn') &&
      $('workout-cancel-edit-set-btn').addEventListener('click', () => cancelEditSet());
    $('workout-next-exercise-btn') &&
      $('workout-next-exercise-btn').addEventListener('click', () => onNextExercise());
    $('workout-prev-exercise-btn') &&
      $('workout-prev-exercise-btn').addEventListener('click', () => onPrevExercise());

    $('workout-change-date-btn') &&
      $('workout-change-date-btn').addEventListener('click', () => {
        const p = $('workout-change-date-panel');
        if (p && p.style.display !== 'none') closeChangeDatePanel();
        else openChangeDatePanel();
      });
    $('workout-change-date-apply') &&
      $('workout-change-date-apply').addEventListener('click', () => applyWorkoutSessionDateChange());
    $('workout-change-date-cancel') &&
      $('workout-change-date-cancel').addEventListener('click', () => closeChangeDatePanel());

    const weightInput = $('workout-weight-input');
    const repsInput = $('workout-reps-input');
    if (weightInput) {
      weightInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (repsInput) repsInput.focus();
      });
    }
    if (repsInput) {
      repsInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        onSaveSet();
      });
    }

    const cardioMin = $('workout-cardio-minutes');
    const cardioSel = $('workout-cardio-activity');
    const cardioOther = $('workout-cardio-other');
    if (cardioMin) {
      cardioMin.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (cardioSel) cardioSel.focus();
      });
    }
    if (cardioSel) {
      cardioSel.addEventListener('change', () => syncCardioOtherVisibility());
      cardioSel.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (cardioSel.value === '__other__') {
          if (cardioOther) cardioOther.focus();
        } else {
          onSaveSet();
        }
      });
    }
    if (cardioOther) {
      cardioOther.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        onSaveSet();
      });
    }

    const setsUl = $('workout-sets-today');
    setsUl &&
      setsUl.addEventListener('click', (e) => {
        const delBtn = e.target.closest('[data-set-del]');
        if (delBtn) {
          e.preventDefault();
          deleteSetAtIndex(+delBtn.getAttribute('data-set-del'));
          return;
        }
        const editBtn = e.target.closest('[data-set-index]');
        if (editBtn) {
          beginEditSet(+editBtn.getAttribute('data-set-index'));
        }
      });

    const outlineList = $('workout-day-outline-list');
    outlineList &&
      outlineList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-outline-index]');
        if (!btn) return;
        const i = +btn.getAttribute('data-outline-index');
        if (Number.isNaN(i) || i < 0 || i >= state.session.exercises.length) return;
        if (i === state.session.currentIndex) return;
        state.session.currentIndex = i;
        state.editingSetIndex = null;
        clearWorkoutInputs();
        renderSessionUI();
        persistSession();
      });

    $('view-progress-list') &&
      $('view-progress-list').addEventListener('click', onProgressListClick);
    $('workout-history-more') &&
      $('workout-history-more').addEventListener('click', () => {
        const hist = state.historyListForPanel || [];
        if (state.historyCollapsed) {
          state.historyCollapsed = false;
          state.historyShowAll = false;
        } else if (state.historyShowAll) {
          state.historyShowAll = false;
        } else if (hist.length > 3) {
          state.historyShowAll = true;
        }
        renderHistoryPanelBody();
      });
    $('workout-history-close') && $('workout-history-close').addEventListener('click', closeHistory);
    $('workout-add-oneoff-btn') &&
      $('workout-add-oneoff-btn').addEventListener('click', () => onAddOneOff());

    $('edit-workout-day-btn') &&
      $('edit-workout-day-btn').addEventListener('click', () => {
        openEditModal();
      });
    $('edit-workout-day-close') &&
      $('edit-workout-day-close').addEventListener('click', () => closeEditModal());
    $('edit-workout-day-backdrop') &&
      $('edit-workout-day-backdrop').addEventListener('click', () => closeEditModal());
    $('edit-workout-cancel') &&
      $('edit-workout-cancel').addEventListener('click', () => closeEditModal());
    $('edit-workout-save') && $('edit-workout-save').addEventListener('click', () => saveEditModal());
    $('edit-workout-add') &&
      $('edit-workout-add').addEventListener('click', () => {
        state.editRows = readEditRowsFromDom();
        state.editRows.push({ id: uid(), name: '' });
        renderEditList();
      });

    document.querySelectorAll('[data-edit-day]').forEach((btn) => {
      btn.addEventListener('click', () => switchEditDay(btn.getAttribute('data-edit-day')));
    });

    const editList = $('edit-workout-list');
    editList && editList.addEventListener('click', onEditListClick);

    $('view-progress-btn') &&
      $('view-progress-btn').addEventListener('click', () => openProgressModal());
    $('view-progress-close') &&
      $('view-progress-close').addEventListener('click', () => closeProgressModal());
    $('view-progress-backdrop') &&
      $('view-progress-backdrop').addEventListener('click', () => closeProgressModal());
    $('view-progress-export-btn') &&
      $('view-progress-export-btn').addEventListener('click', () => exportAllWorkoutSessions());

    window.addEventListener('workout-firebase-ready', async () => {
      if (window.workoutStore) {
        state.templatesCache = await window.workoutStore.getTemplates();
      }
    });

    setTimeout(() => {
      if (window.storage && window.storage._firebaseReady && window.workoutStore) {
        window.dispatchEvent(new CustomEvent('workout-firebase-ready'));
      }
    }, 1200);
  }

  document.addEventListener('DOMContentLoaded', initWorkoutTrackerPage);
})();
