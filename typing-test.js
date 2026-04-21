/* =========================================================
   FINGERS ON FIRE — Typing Speed Test v3
   Mobile fix: transparent textarea overlay receives input on
   both desktop and mobile. On every input event we diff the
   textarea value against the passage rather than tracking
   individual keystrokes — this works perfectly on iOS/Android
   where composing, autocorrect, and swipe-to-type fire
   non-standard key events.
   ========================================================= */

(() => {
  'use strict';

  // ---------- Corpora ----------
  const CORPORA = {
    prose: [
      "The quiet hum of a well-designed tool is the sound of friction disappearing. You press a key, the screen responds, and somewhere in that instant a small happiness occurs. Good software feels less like a machine and more like a trusted hand.",
      "A good writer is not one who uses fancy words but one who knows exactly which plain word to use and where. Clarity is a kind of kindness. Every extra adjective is a small betrayal of the reader's time, and every rescued sentence is a tiny victory.",
      "If you want to build something worth using, start by using it yourself every day. The feedback loop of your own inconvenience is the fastest path to a product that works. Dogfood is not a buzzword, it is a survival strategy.",
      "Consistency is boring on day one and magical on day one thousand. The compounding of small, reliable actions is where almost all real progress hides. Skill is mostly showing up when you do not feel like it, and pressing the key anyway.",
      "The internet forgot how to be weird. Every site looks like every other site, every header has the same words, every button lives in the same corner. A little strangeness is the rebellion we owe to the next generation of the web.",
    ],
    quotes: [
      "The only way to do great work is to love what you do. If you have not found it yet, keep looking. Do not settle. As with all matters of the heart, you will know when you find it.",
      "We are what we repeatedly do. Excellence, then, is not an act, but a habit. The discipline of a small daily practice outperforms the theatrics of a single grand attempt every single time.",
      "Simplicity is the ultimate sophistication. It takes a lot of hard work to make something simple, to truly understand the underlying challenges and come up with elegant solutions that feel completely effortless.",
      "The unexamined life is not worth living. The unpracticed skill is not worth claiming. The uncommitted idea is not worth sharing. Examine, practice, commit, and then speak softly and with confidence.",
      "Be yourself, everyone else is already taken. The world already has enough copies of everybody. What it is short of is people willing to sound, look, and think like themselves on a Tuesday afternoon.",
    ],
    code: [
      "function debounce(fn, delay) { let t; return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), delay); }; }",
      "const pipe = (...fns) => (x) => fns.reduce((v, f) => f(v), x); const compose = (...fns) => (x) => fns.reduceRight((v, f) => f(v), x);",
      "async function retry(fn, n = 3) { for (let i = 0; i < n; i++) { try { return await fn(); } catch(e) { if (i === n-1) throw e; } } }",
      "class EventEmitter { constructor() { this.e = {}; } on(k,f) { (this.e[k]=this.e[k]||[]).push(f); return this; } emit(k,...a) { (this.e[k]||[]).forEach(f=>f(...a)); } }",
      "const memoize = (fn) => { const cache = new Map(); return (...args) => { const k = JSON.stringify(args); return cache.has(k) ? cache.get(k) : cache.set(k, fn(...args)).get(k); }; };",
    ],
  };

  // ---------- State ----------
  const state = {
    duration: 30,
    mode: 'prose',
    text: '',
    started: false,
    finished: false,
    startTime: 0,
    timer: null,
    timeLeft: 30,
    // Track by character index what the user has typed
    typed: '',
  };

  // ---------- DOM ----------
  const $zone      = document.getElementById('typing-zone');
  const $input     = document.getElementById('typing-input');
  const $display   = document.getElementById('text-display');
  const $hint      = document.getElementById('typing-hint');
  const $timeVal   = document.getElementById('time-val');
  const $wpmVal    = document.getElementById('wpm-val');
  const $accVal    = document.getElementById('acc-val');
  const $errVal    = document.getElementById('err-val');
  const $progress  = document.getElementById('progress');
  const $progLabel = document.getElementById('progress-label');
  const $result    = document.getElementById('result');
  const $retry     = document.getElementById('retry-btn');
  const $reset     = document.getElementById('reset-btn');
  const $finalWpm  = document.getElementById('final-wpm');
  const $finalAcc  = document.getElementById('final-acc');
  const $finalChars= document.getElementById('final-chars');
  const $finalErr  = document.getElementById('final-err');
  const $verdict   = document.getElementById('verdict');

  // ---------- Helpers ----------
  const pickText = () => {
    const arr = CORPORA[state.mode] || CORPORA.prose;
    return arr[Math.floor(Math.random() * arr.length)];
  };

  const renderText = () => {
    $display.innerHTML = state.text
      .split('')
      .map((ch, i) => {
        const safe = ch === ' ' ? '&nbsp;'
                   : ch === '<' ? '&lt;'
                   : ch === '>' ? '&gt;'
                   : ch === '&' ? '&amp;'
                   : ch;
        return `<span class="char" data-i="${i}">${safe}</span>`;
      })
      .join('');
    updateCharStyles();
  };

  const updateCharStyles = () => {
    const chars = $display.querySelectorAll('.char');
    const typedLen = state.typed.length;

    chars.forEach((c, i) => {
      c.classList.remove('correct', 'incorrect', 'current');
      if (i < typedLen) {
        c.classList.add(state.typed[i] === state.text[i] ? 'correct' : 'incorrect');
      } else if (i === typedLen) {
        c.classList.add('current');
      }
    });
  };

  const calcStats = () => {
    const elapsedSec = state.duration - state.timeLeft;
    const elapsedMin = Math.max(0.01, elapsedSec / 60);

    let correct = 0, errors = 0;
    for (let i = 0; i < state.typed.length; i++) {
      if (state.typed[i] === state.text[i]) correct++;
      else errors++;
    }

    const wpm = Math.round((correct / 5) / elapsedMin);
    const total = correct + errors;
    const acc = total > 0 ? Math.round((correct / total) * 100) : 100;

    return { wpm: Math.max(0, wpm), acc, correct, errors };
  };

  const updateStats = () => {
    const { wpm, acc, errors } = calcStats();
    $timeVal.textContent = state.timeLeft;
    $wpmVal.textContent  = state.started ? wpm : 0;
    $accVal.textContent  = acc;
    $errVal.textContent  = errors;

    const pct = state.text.length > 0
      ? Math.min(100, Math.round((state.typed.length / state.text.length) * 100))
      : 0;
    $progress.style.width = pct + '%';
    $progLabel.textContent = pct + '% complete';
  };

  // ---------- Timer ----------
  const startTimer = () => {
    if (state.timer) clearInterval(state.timer);
    const startMs = Date.now();
    const targetMs = state.duration * 1000;

    state.timer = setInterval(() => {
      const elapsed = Date.now() - startMs;
      const left = Math.max(0, state.duration - Math.floor(elapsed / 1000));

      if (left !== state.timeLeft) {
        state.timeLeft = left;
        updateStats();
      }

      if (elapsed >= targetMs) finish();
    }, 100);
  };

  // ---------- Finish ----------
  const finish = () => {
    if (state.finished) return;
    state.finished = true;
    clearInterval(state.timer);
    $input.blur();

    const elapsedMin = Math.max(0.01, (state.duration - state.timeLeft) / 60);
    let correct = 0, errors = 0;
    for (let i = 0; i < state.typed.length; i++) {
      if (state.typed[i] === state.text[i]) correct++;
      else errors++;
    }

    const wpm = Math.round((correct / 5) / elapsedMin);
    const total = correct + errors;
    const acc = total > 0 ? Math.round((correct / total) * 100) : 100;

    $finalWpm.textContent   = Math.max(0, wpm);
    $finalAcc.textContent   = acc;
    $finalChars.textContent = correct;
    $finalErr.textContent   = errors;
    $verdict.textContent    = verdictFor(wpm, acc);

    $result.classList.add('active');
    $result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const verdictFor = (wpm, acc) => {
    if (acc < 80)  return 'Speed is cheap. Accuracy is the real flex.';
    if (wpm < 30)  return 'Slow and sure. Keep the rhythm — speed will find you.';
    if (wpm < 50)  return 'Solid pace. You could out-type most of the internet.';
    if (wpm < 75)  return 'Fast. The keys are a little afraid of you now.';
    if (wpm < 100) return 'Very fast. Your fingers are auditioning for the orchestra.';
    return 'Inhuman. Please leave some WPM for the rest of us.';
  };

  // ---------- Reset ----------
  const reset = () => {
    clearInterval(state.timer);
    state.text     = pickText();
    state.typed    = '';
    state.started  = false;
    state.finished = false;
    state.timeLeft = state.duration;
    state.startTime = 0;

    $input.value = '';
    $result.classList.remove('active');
    $hint.style.display = '';
    renderText();
    updateStats();
  };

  // ---------- Input handler (works for BOTH desktop and mobile) ----------
  /*
   * On every input event we read the full current value of the textarea
   * and compare it to the passage character by character.
   * This handles:
   *   - Regular typing (desktop)
   *   - Backspace/delete
   *   - Mobile swipe keyboard (Gboard, SwiftKey)
   *   - iOS autocorrect/autocomplete
   *   - Copy-paste (we strip it to max passage length)
   */
  $input.addEventListener('input', (e) => {
    if (state.finished) {
      $input.value = '';
      return;
    }

    // Start timer on first character
    if (!state.started && $input.value.length > 0) {
      state.started = true;
      state.startTime = Date.now();
      startTimer();
      $hint.style.display = 'none';
    }

    // Clamp to passage length
    const raw = $input.value;
    const clamped = raw.slice(0, state.text.length);

    // If user pasted too much, correct the textarea value
    if (raw.length > state.text.length) {
      $input.value = clamped;
    }

    state.typed = clamped;
    updateCharStyles();
    updateStats();

    // Auto-finish if passage fully typed
    if (state.typed.length === state.text.length) {
      finish();
    }
  });

  // Focus / blur styling
  $input.addEventListener('focus', () => {
    $zone.classList.add('focused');
    if (!state.started) $hint.style.display = 'none';
  });

  $input.addEventListener('blur', () => {
    $zone.classList.remove('focused');
    if (!state.started) $hint.style.display = '';
  });

  // Clicking the zone focuses the textarea (enables mobile keyboard)
  $zone.addEventListener('click', () => {
    if (!state.finished) $input.focus();
  });

  // ---------- Config chips ----------
  document.querySelectorAll('[data-duration]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-duration]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.duration = parseInt(btn.dataset.duration, 10);
      reset();
    });
  });

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
