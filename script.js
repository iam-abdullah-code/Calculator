/*ENGINE*/
    class CalcError extends Error { }
    const clean = v => {const n = Number(v.toPrecision(12)); return n === 0 ? 0 : n;};
    function evaluate(src) {
      const tokens = src.match(/\d+\.?\d*(?:e[+-]?\d+)?|\.\d+|[-+*/^%()√]|\S/g) || [];
      let i = 0;
      const peek = () => tokens[i];
      const fail = msg => {throw new CalcError(msg);};
      const expr = () => {
        let {v} = term();
        while (peek() === '+' || peek() === '-') {
          const op = tokens[i++], r = term();
          const rv = r.pct ? v * r.v : r.v; // 50 + 10% -> 50 + 5
          v = op === '+' ? v + rv : v - rv;
        }
        return {v};
      };
      const term = () => {
        const first = unary();
        let {v, pct} = first;
        while (['*', '/', '(', '√'].includes(peek())) {
          const op = (peek() === '*' || peek() === '/') ? tokens[i++] : '*';
          const r = unary(); pct = false;
          if (op === '/') {if (r.v === 0) fail('Cannot divide by zero'); v /= r.v;} else v *= r.v;
        }
        return {v, pct};
      };
      const unary = () => {
        if (peek() === '-') {i++; const r = unary(); return {v: -r.v, pct: r.pct};}
        if (peek() === '+') {i++; return unary();}
        return power();
      };
      const power = () => {
        const base = postfix();
        if (peek() === '^') {i++; return {v: Math.pow(base.v, unary().v), pct: false};}
        return base;
      };
      const postfix = () => {
        let r = primary();
        while (peek() === '%') {i++; r = {v: r.v / 100, pct: true};}
        return r;
      };
      const primary = () => {
        const t = tokens[i++];
        if (t === undefined) fail('Incomplete expression');
        if (t === '(') {const r = expr(); if (tokens[i++] !== ')') fail('Invalid expression'); return {v: r.v, pct: false};}
        if (t === '√') {const {v} = primary(); if (v < 0) fail('Invalid input'); return {v: Math.sqrt(v), pct: false};}
        if (/^[\d.]/.test(t)) return {v: Number(t), pct: false};
        return fail('Invalid expression');
      };
      const {v} = expr();
      if (i < tokens.length) fail('Invalid expression');
      if (Number.isNaN(v)) fail('Invalid input');
      if (!Number.isFinite(v)) fail('Result too large');
      return clean(v);
    }
    /*ENDENGINE*/

    const $ = id => document.getElementById(id);
    const els = {expr: $('expr'), value: $('value'), sr: $('sr'), mem: $('memInd'), list: $('list'), hist: $('history'), open: $('openHist')};
    const num = new Intl.NumberFormat('en-US', {maximumFractionDigits: 10});
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state = {expr: '', done: false, error: '', lastExpr: '', lastValue: 0, memory: 0, lastBig: '0', history: []};

    const formatValue = n => {
      const a = Math.abs(n);
      if (a >= 1e15 || (a > 0 && a < 1e-9)) return n.toExponential(6).replace(/\.?0+e/, 'e');
      return num.format(n);
    };
    const groupTyped = s => {const [i, d] = s.split('.'); const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ','); return d === undefined ? g : g + '.' + d;};
    const pretty = s => s.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−');
    const isPlain = s => /^-?\d*\.?\d*$/.test(s);
    const previewValue = s => {
      let e = s.replace(/[-+*/^(√]+$/, '');
      if (!e) return null;
      e += ')'.repeat(Math.max(0, (e.match(/\(/g) || []).length - (e.match(/\)/g) || []).length));
      try {return evaluate(e);} catch {return null;}
    };
    const currentValue = () => state.done ? state.lastValue : (previewValue(state.expr) ?? 0);

    /* Expression editing */
    const reset = () => {state.expr = ''; state.done = false; state.error = '';};
    const fresh = () => {if (state.error || state.done) reset();};
    const implicitMul = () => {if (/[\d.)%]$/.test(state.expr)) state.expr += '*';};
    function lastOperandStart(e) {
      if (e.endsWith(')')) {
        let depth = 0;
        for (let i = e.length - 1; i >= 0; i--) {
          if (e[i] === ')') depth++;
          else if (e[i] === '(' && --depth === 0) return e[i - 1] === '√' ? i - 1 : i;
        }
        return -1;
      }
      const m = e.match(/(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)$/);
      return m ? e.length - m[0].length : -1;
    }
    const actions = {
      digit(d) {
        fresh();
        if (/[)%]$/.test(state.expr)) state.expr += '*';
        const m = state.expr.match(/(\d*\.?\d*)$/)[0];
        if (m === '0') state.expr = state.expr.slice(0, -1);
        if (m.replace('.', '').length >= 15) return;
        state.expr += d;
      },
      dot() {
        fresh();
        if (/[)%]$/.test(state.expr)) state.expr += '*';
        const m = state.expr.match(/(\d*\.?\d*)$/)[0];
        if (m.includes('.')) return;
        state.expr += m ? '.' : '0.';
      },
      op(o) {
        if (state.error) reset();
        state.done = false;
        let e = state.expr;
        if (!e || e.endsWith('(')) {if (o === '-') state.expr += '-'; else if (!e) state.expr = '0' + o; return;}
        if (/[-+*/^]$/.test(e)) {
          if (o === '-' && /[*/^]$/.test(e)) {state.expr += '-'; return;}
          e = e.replace(/[-+*/^]+$/, '');
        }
        state.expr = e + o;
      },
      paren(p) {
        if (state.error || state.done) reset();
        const e = state.expr;
        if (p === '(') {implicitMul(); state.expr += '('; return;}
        const open = (e.match(/\(/g) || []).length - (e.match(/\)/g) || []).length;
        if (open > 0 && /[\d.)%]$/.test(e)) state.expr += ')';
      },
      pct() {if (state.error) reset(); state.done = false; if (/[\d.)%]$/.test(state.expr) && !/\.$/.test(state.expr)) state.expr += '%';},
      sq() {if (state.error) reset(); state.done = false; if (/[\d)]$/.test(state.expr)) state.expr += '^2';},
      sqrt() {
        if (state.error) reset();
        state.done = false;
        const s = lastOperandStart(state.expr);
        if (s >= 0) state.expr = state.expr.slice(0, s) + '√(' + state.expr.slice(s) + ')';
        else {implicitMul(); state.expr += '√(';}
      },
      recip() {
        if (state.error) reset();
        state.done = false;
        const s = lastOperandStart(state.expr);
        if (s >= 0) state.expr = state.expr.slice(0, s) + '(1/' + state.expr.slice(s) + ')';
      },
      sign() {
        if (state.error) reset();
        state.done = false;
        const e = state.expr;
        let m;
        if ((m = e.match(/\(-(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)\)$/))) state.expr = e.slice(0, -m[0].length) + m[1];
        else if ((m = e.match(/(^|[(+\-*/^])-(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)$/))) state.expr = e.slice(0, e.length - m[0].length) + m[1] + m[2];
        else if ((m = e.match(/(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)$/))) state.expr = e.slice(0, -m[0].length) + '(-' + m[0] + ')';
      },
      back() {
        if (state.error) {reset(); return;}
        state.done = false;
        state.expr = state.expr.endsWith('√(') ? state.expr.slice(0, -2) : state.expr.slice(0, -1);
      },
      clear() {reset();},
      eq() {
        if (state.error || state.done || !state.expr) return;
        let e = state.expr.replace(/[-+*/^(√]+$/, '');
        if (!e) return;
        e += ')'.repeat(Math.max(0, (e.match(/\(/g) || []).length - (e.match(/\)/g) || []).length));
        try {
          const v = evaluate(e);
          state.lastExpr = e; state.lastValue = v; state.expr = String(v); state.done = true;
          addHistory(e, v);
        } catch (err) {
          state.error = err instanceof CalcError ? err.message : 'Invalid expression';
        }
        if (!reduceMotion) els.value.animate([{opacity: .4, transform: 'translateY(6px)'}, {opacity: 1, transform: 'none'}], {duration: 160, easing: 'ease-out'});
      },
      mc() {state.memory = 0;},
      mr() {
        fresh();
        implicitMul();
        state.expr += state.memory < 0 ? `(-${-state.memory})` : String(state.memory);
      },
      mplus() {state.memory = clean(state.memory + currentValue());},
      mminus() {state.memory = clean(state.memory - currentValue());}
    };

    /* History */
    const STORE_KEY = 'calc.history.v1';
    try {state.history = JSON.parse(localStorage.getItem(STORE_KEY)) || [];} catch {state.history = [];}
    if (!Array.isArray(state.history)) state.history = [];
    const saveHistory = () => {try {localStorage.setItem(STORE_KEY, JSON.stringify(state.history));} catch { /* storage unavailable */} };
    function addHistory(e, v) {
      state.history.unshift({e, v});
      state.history.length = Math.min(state.history.length, 50);
      saveHistory();
    }
    function renderHistory() {
      els.list.textContent = '';
      if (!state.history.length) {
        const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'No calculations yet. Results appear here after you press =.';
        els.list.append(li); return;
      }
      state.history.forEach((h, idx) => {
        const li = document.createElement('li'), b = document.createElement('button');
        b.type = 'button'; b.className = 'item'; b.dataset.idx = idx;
        b.setAttribute('aria-label', `${pretty(h.e)} equals ${formatValue(h.v)}. Use this result`);
        b.innerHTML = '<small></small><b></b>';
        b.firstChild.textContent = pretty(h.e) + ' ='; b.lastChild.textContent = formatValue(h.v);
        li.append(b); els.list.append(li);
      });
    }
    const setHistoryOpen = open => {
      els.hist.classList.toggle('open', open);
      els.open.setAttribute('aria-expanded', open);
      if (open) $('closeHist').focus(); else if (!matchMedia('(min-width:860px)').matches) els.open.focus();
    };
    els.list.addEventListener('click', ev => {
      const b = ev.target.closest('.item'); if (!b) return;
      const h = state.history[b.dataset.idx];
      reset(); state.expr = String(h.v); state.done = true; state.lastExpr = h.e; state.lastValue = h.v;
      render();
      if (els.hist.classList.contains('open')) setHistoryOpen(false);
    });
    $('clearHist').addEventListener('click', () => {state.history = []; saveHistory(); renderHistory();});
    $('closeHist').addEventListener('click', () => setHistoryOpen(false));
    els.open.addEventListener('click', () => setHistoryOpen(true));

    /* Rendering */
    function fitValue() {
      const el = els.value; el.style.fontSize = ''; el.style.lineHeight = '';
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth && size > 18) {size -= 2; el.style.fontSize = size + 'px';}
    }
    function render() {
      let big, small = '';
      if (state.error) {big = 'Error'; small = state.error;}
      else if (state.done) {big = formatValue(state.lastValue); small = pretty(state.lastExpr) + ' =';}
      else {
        if (isPlain(state.expr)) big = state.expr ? groupTyped(state.expr) : '0';
        else {const p = previewValue(state.expr); big = p === null ? state.lastBig : formatValue(p); small = pretty(state.expr);}
      }
      state.lastBig = big;
      els.value.textContent = big;
      els.expr.textContent = small;
      els.expr.classList.toggle('err', !!state.error);
      els.expr.scrollLeft = els.expr.scrollWidth;
      els.mem.classList.toggle('on', state.memory !== 0);
      els.sr.textContent = state.error ? state.error : state.done ? `Result ${big}` : '';
      fitValue();
    }

    /* Keypad */
    const KEYS = [
      ['MC', 'mc', '', 'small', 'Memory clear'], ['MR', 'mr', '', 'small', 'Memory recall'], ['M+', 'mplus', '', 'small', 'Add to memory'], ['M−', 'mminus', '', 'small', 'Subtract from memory'],
      ['x²', 'sq', '', 'fn', 'Square'], ['√', 'sqrt', '', 'fn', 'Square root'], ['xʸ', 'op', '^', 'fn', 'Power'], ['1/x', 'recip', '', 'fn', 'Reciprocal'],
      ['AC', 'clear', '', 'clear', 'All clear', 'Escape'], ['(', 'paren', '(', 'fn', 'Open parenthesis', '('], [')', 'paren', ')', 'fn', 'Close parenthesis', ')'], ['⌫', 'back', '', 'fn', 'Delete', 'Backspace'],
      ['7', 'digit', '7'], ['8', 'digit', '8'], ['9', 'digit', '9'], ['÷', 'op', '/', 'op', 'Divide', '/'],
      ['4', 'digit', '4'], ['5', 'digit', '5'], ['6', 'digit', '6'], ['×', 'op', '*', 'op', 'Multiply', '*'],
      ['1', 'digit', '1'], ['2', 'digit', '2'], ['3', 'digit', '3'], ['−', 'op', '-', 'op', 'Subtract', '-'],
      ['±', 'sign', '', 'fn', 'Toggle sign'], ['0', 'digit', '0'], ['.', 'dot', '', '', 'Decimal point', '.'], ['+', 'op', '+', 'op', 'Add', '+'],
      ['%', 'pct', '', 'fn', 'Percent', '%'], ['=', 'eq', '', 'eq', 'Equals', 'Enter']
    ];
    const byKey = new Map();
    const keysEl = $('keys');
    let rowEl;
    KEYS.forEach(([t, a, v, c, label, key], idx) => {
      if (idx % 4 === 0 && idx <= 28) {rowEl = document.createElement('div'); rowEl.className = 'row'; keysEl.append(rowEl);}
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'k ' + (c || ''); b.textContent = t;
      b.dataset.action = a; b.dataset.value = v;
      if (label) b.setAttribute('aria-label', label);
      rowEl.append(b);
      const k = key ?? (a === 'digit' ? v : null);
      if (k) byKey.set(k, b);
      if (a === 'eq') byKey.set('=', b);
    });

    function press(action, value) {actions[action](value); render();}
    keysEl.addEventListener('click', ev => {
      const b = ev.target.closest('.k'); if (!b) return;
      press(b.dataset.action, b.dataset.value);
      if (ev.detail > 0) b.blur(); // pointer clicks should not keep focus, so Enter always means "="
    });

    /* Keyboard */
    document.addEventListener('keydown', ev => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key === 'Escape' && els.hist.classList.contains('open')) {setHistoryOpen(false); return;}
      if (ev.key === 'Enter' && ev.target.closest('.history, .top')) return; // keep native activation there
      if (ev.key === ' ' || (ev.key === 'Tab')) return;
      const key = ev.key === 'Delete' ? 'Escape' : ev.key === 'x' || ev.key === 'X' ? '*' : ev.key === ',' ? '.' : ev.key;
      const b = byKey.get(key); if (!b) return;
      ev.preventDefault();
      b.classList.add('pressed'); setTimeout(() => b.classList.remove('pressed'), 110);
      press(b.dataset.action, b.dataset.value);
    });
    new ResizeObserver(fitValue).observe(els.value);
    render();
    renderHistory();
