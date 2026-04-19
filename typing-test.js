/* =========================================================
   FINGERS ON FIRE — Typing Speed Test
   ========================================================= */

(() => {
  'use strict';

  // ---------- Text corpora ----------
  const CORPORA = {
    prose: [
      "The quiet hum of a well-designed tool is the sound of friction disappearing. You press a key, the screen responds, and somewhere in that instant a small happiness occurs. Good software feels less like a machine and more like a trusted hand.",
      "A good writer is not one who uses fancy words but one who knows exactly which plain word to use and where. Clarity is a kind of kindness. Every extra adjective is a small betrayal of the reader's time, and every rescued sentence is a tiny victory.",
      "If you want to build something worth using, start by using it yourself every day. The feedback loop of your own inconvenience is the fastest path to a product that does not suck. Dogfood is not a buzzword, it is a survival strategy.",
      "Consistency is boring on day one and magical on day one thousand. The compounding of small, reliable actions is where almost all real progress hides. Skill is mostly showing up when you do not feel like it, and pressing the key anyway.",
      "The internet forgot how to be weird. Every site looks like every other site, every header has the same words, every button lives in the same corner. A little strangeness, a little craft, is the rebellion we owe to the next generation of the web.",
      "Reading is underrated as a form of thinking. When you read a good sentence carefully, you are not consuming content, you are borrowing the author's mind for a few minutes. The best books leave you standing up from the couch slightly rearranged.",
    ],
    quotes: [
      "The only way to do great work is to love what you do. If you have not found it yet, keep looking. Do not settle. As with all matters of the heart, you will know when you find it.",
      "We are what we repeatedly do. Excellence, then, is not an act, but a habit. The discipline of a small daily practice outperforms the theatrics of a single grand attempt every time.",
      "Simplicity is the ultimate sophistication. It takes a lot of hard work to make something simple, to truly understand the underlying challenges and come up with elegant solutions that feel effortless.",
      "The unexamined life is not worth living. The unpracticed skill is not worth claiming. The uncommitted idea is not worth sharing. Examine, practice, commit, and then speak softly and with confidence.",
      "Be yourself, everyone else is already taken. The world already has enough copies of everybody, what it is short of is people who are willing to sound, look, and think like themselves on a Tuesday afternoon.",
    ],
    code: [
      "function debounce(fn, delay) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => fn.apply(this, args), delay); }; }",
      "const fibonacci = (n) => n <= 1 ? n : fibonacci(n - 1) + fibonacci(n - 2); const memoized = (fn) => { const cache = new Map(); return (n) => cache.has(n) ? cache.get(n) : cache.set(n, fn(n)).get(n); };",
      "async function fetchWithRetry(url, retries = 3) { for (let i = 0; i < retries; i++) { try { const res = await fetch(url); if (res.ok) return res.json(); } catch (e) { if (i === retries - 1) throw e; } } }",
      "class EventEmitter { constructor() { this.events = {}; } on(e, fn) { (this.events[e] = this.events[e] || []).push(fn); return this; } emit(e, ...a) { (this.events[e] || []).forEach(f => f(...a)); } }",
      "const pipe = (...fns) => (x) => fns.reduce((v, f) => f(v), x); const compose = (...fns) => (x) => fns.reduceRight((v, f) => f(v), x); const curry = (fn) => (...a) => a.length >= fn.length ? fn(...a) : curry(fn.bind(null, ...a));",
    ]
  };

  // ---------- State ----------
  const state = {
    duration: 30,
    mode: 'prose',
    text: '',
    typed: '',
    started: false,
    finished: false,
    startTime: 0,
    timer: null,
    correctChars: 0,
    incorrectChars: 0,
    totalKeystrokes: 0,
    timeLeft: 30,
  };

  // ---------- DOM refs ----------
  const $zone   = document.getElementById('typing-zone');
  const $display= document.getElementById('text-display');
  const $input  = document.getElementById('hidden-input');
  const $timeVal= document.getElementById('time-val');
  const $wpmVal = document.getElementById('wpm-val');
  const $accVal = document.getElementById('acc-val');
  const $errVal = document.getElementById('err-val');
  const $progress = document.getElementById('progress');
  const $progressLabel = document.getElementById('progress-label');
  const $result = document.getElementById('result');
  const $retry  = document.getElementById('retry-btn');
  const $reset  = document.getElementById('reset-btn');
  const $finalWpm  = document.getElementById('final-wpm');
  const $finalAcc  = document.getElementById('final-acc');
  const $finalChars= document.getElementById('final-chars');
  const $finalErr  = document.getElementById('final-err');
  const $verdict   = document.getElementById('verdict');

  // ---------- Helpers ----------
  const pickText = (mode) => {
    const arr = CORPORA[mode] || CORPORA.prose;
    return arr[Math.floor(Math.random() * arr.length)];
  };

  const renderText = () => {
    $display.innerHTML = state.text
      .split('')
      .map((ch, i) => {
        const escaped = ch === ' ' ? '&nbsp;' : (ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch);
        return `<span class="char" data-i="${i}">${escaped}</span>`;
      })
      .join('');
    highlightCurrent();
  };

  const highlightCurrent = () => {
    const chars = $display.querySelectorAll('.char');
    chars.forEach(c => c.classList.remove('current'));
    const idx = state.typed.length;
    if (idx < chars.length) chars[idx].classList.add('current');
  };

  const updateCharClasses = () => {
    const chars = $display.querySelectorAll('.char');
    for (let i = 0; i < chars.length; i++) {
      chars[i].classList.remove('correct', 'incorrect');
      if (i < state.typed.length) {
        if (state.typed[i] === state.text[i]) chars[i].classList.add('correct');
        else chars[i].classList.add('incorrect');
      }
    }
    highlightCurrent();
  };

  const calcWPM = () => {
    if (!state.started) return 0;
    const elapsedMin = (state.duration - state.timeLeft) / 60;
    if (elapsedMin <= 0) return 0;
    // standard: 5 chars = 1 word, based on correctly typed characters
    const wordsTyped = state.correctChars / 5;
    return Math.round(wordsTyped / elapsedMin);
  };

  const calcAccuracy = () => {
    if (state.totalKeystrokes === 0) return 100;
    return Math.round((state.correctChars / state.totalKeystrokes) * 100);
  };

  const updateStats = () => {
    $timeVal.textContent = state.timeLeft;
    $wpmVal.textContent = calcWPM();
    $accVal.textContent = calcAccuracy();
    $errVal.textContent = state.incorrectChars;

    const pct = Math.min(100, Math.round((state.typed.length / state.text.length) * 100));
    $progress.style.width = pct + '%';
    $progressLabel.textContent = pct + '% complete';
  };

  const verdictFor = (wpm, acc) => {
    if (acc < 80)  return "Speed is cheap. Accuracy is the flex.";
    if (wpm < 30)  return "Slow and sure. Keep the rhythm, speed will find you.";
    if (wpm < 50)  return "Solid pace. You could out-type most of the internet.";
    if (wpm < 75)  return "Fast. The keys are a little bit afraid of you.";
    if (wpm < 100) return "Very fast. Your fingers are auditioning for the orchestra.";
    return "Inhuman. Please consider leaving some WPM for the rest of us.";
  };

  // ---------- Core loop ----------
  function startTimer() {
    if (state.timer) clearInterval(state.timer);
    state.startTime = Date.now();
    state.timer = setInterval(tick, 100);
  }

  function tick() {
    const elapsedMs = Date.now() - state.startTime;
    const newTimeLeft = Math.max(0, state.duration - Math.floor(elapsedMs / 1000));

    if (newTimeLeft !== state.timeLeft) {
      state.timeLeft = newTimeLeft;
      updateStats();
    }

    if (newTimeLeft <= 0) finish();
  }

  function handleKey(e) {
    if (state.finished) return;

    // Allow only printable keys, backspace
    if (e.key === 'Tab') { e.preventDefault(); return; }
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta' || e.key === 'CapsLock') return;
    if (e.ctrlKey || e.metaKey) return;

    if (!state.started) {
      state.started = true;
      startTimer();
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      if (state.typed.length > 0) {
        const removedIdx = state.typed.length - 1;
        // if the removed character was incorrect, decrement error counter visually
        if (state.typed[removedIdx] !== state.text[removedIdx]) {
          state.incorrectChars = Math.max(0, state.incorrectChars - 1);
        } else {
          state.correctChars = Math.max(0, state.correctChars - 1);
        }
        state.totalKeystrokes = Math.max(0, state.totalKeystrokes - 1);
        state.typed = state.typed.slice(0, -1);
        updateCharClasses();
        updateStats();
      }
      return;
    }

    if (e.key.length !== 1) return; // ignore other non-character keys

    e.preventDefault();
    if (state.typed.length >= state.text.length) {
      // Text completed — finish early
      finish();
      return;
    }

    const expected = state.text[state.typed.length];
    const typed = e.key;

    state.typed += typed;
    state.totalKeystrokes++;

    if (typed === expected) state.correctChars++;
    else state.incorrectChars++;

    updateCharClasses();
    updateStats();

    // If text completed and time still left, finish
    if (state.typed.length === state.text.length) {
      finish();
    }
  }

  function finish() {
    if (state.finished) return;
    state.finished = true;
    clearInterval(state.timer);

    // Final WPM — based on actual elapsed time
    const elapsedMin = Math.max(0.01, (Date.now() - state.startTime) / 60000);
    const wordsTyped = state.correctChars / 5;
    const finalWpm = Math.round(wordsTyped / elapsedMin);
    const finalAcc = calcAccuracy();

    $finalWpm.textContent = finalWpm;
    $finalAcc.textContent = finalAcc;
    $finalChars.textContent = state.correctChars;
    $finalErr.textContent = state.incorrectChars;
    $verdict.textContent = verdictFor(finalWpm, finalAcc);

    $result.classList.add('active');
    $result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function reset() {
    clearInterval(state.timer);
    state.text = pickText(state.mode);
    state.typed = '';
    state.started = false;
    state.finished = false;
    state.correctChars = 0;
    state.incorrectChars = 0;
    state.totalKeystrokes = 0;
    state.timeLeft = state.duration;

    $result.classList.remove('active');
    renderText();
    updateStats();
    focusZone();
  }

  function focusZone() {
    $input.focus({ preventScroll: true });
    $zone.classList.add('focused');
  }

  // ---------- Event wiring ----------
  $zone.addEventListener('click', focusZone);
  $zone.addEventListener('focus', focusZone);

  $input.addEventListener('blur', () => $zone.classList.remove('focused'));
  $input.addEventListener('focus', () => $zone.classList.add('focused'));

  // Listen to keydown globally so it works regardless of focus
  document.addEventListener('keydown', (e) => {
    // Ignore if user is typing in another field (like the dev tools, etc.)
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active !== $input) return;
    // Only react when zone is focused OR when any non-modifier key is pressed on the page
    if (document.activeElement !== $input && !$zone.classList.contains('focused')) {
      // first key focuses the zone
      if (e.key.length === 1 || e.key === 'Backspace') {
        focusZone();
      }
    }
    handleKey(e);
  });

  // Duration chips
  document.querySelectorAll('[data-duration]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-duration]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.duration = parseInt(btn.dataset.duration, 10);
      reset();
    });
  });

  // Mode chips
  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
      reset();
    });
  });

  $reset.addEventListener('click', reset);
  $retry.addEventListener('click', reset);

  // ---------- Init ----------
  reset();
})();
