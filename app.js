(function () {
  "use strict";

  var STORE = "secplus701.certmaster.v2";
  var app = document.getElementById("app");
  var modules = SECPLUS.modules.slice().sort(function (a, b) { return a.id - b.id; });
  var topics = window.SECPLUS_TOPICS || [];
  var db = loadDb();
  var view = { screen: "home", session: null, learn: null, cards: null, terms: null, topic: null };

  function blankDb() {
    return {
      progress: {},
      review: {},
      moduleBank: {},
      courseBank: {},
      learn: {},
      topicLearn: {},
      terms: {},
    };
  }

  function loadDb() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE));
      return raw && typeof raw === "object" ? Object.assign(blankDb(), raw) : blankDb();
    } catch (e) {
      return blankDb();
    }
  }

  function saveDb() {
    try { localStorage.setItem(STORE, JSON.stringify(db)); } catch (e) { /* ignore */ }
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function quizKey(mi, qi) { return "m" + mi + "-q" + qi; }
  function scoreClass(pct) { return pct >= 80 ? "good" : pct >= 60 ? "mid" : "low"; }
  function answerText(correct) { return (correct || []).join(" + "); }

  function briefWhy(why) {
    var parts = String(why || "").match(/[^.!?]+[.!?]+/g);
    return parts && parts.length ? parts[0].trim() : String(why || "").trim();
  }

  function splitWhy(why) {
    var parts = String(why || "").match(/[^.!?]+[.!?]+/g);
    if (!parts || !parts.length) return { rule: String(why || "").trim(), detail: "" };
    return { rule: parts[0].trim(), detail: String(why).slice(parts[0].length).trim() };
  }

  function bankId(moduleId, quizId, q) {
    return moduleId + "|" + quizId + "|" + q;
  }

  function norm(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function closeEnough(a, b) {
    var x = norm(a), y = norm(b);
    if (!x || !y) return false;
    if (x === y) return true;
    if (y.indexOf(x) >= 0 || x.indexOf(y) >= 0) return x.length >= Math.min(4, y.length);
    return false;
  }

  function stripTerms(text, correct) {
    var out = String(text || "");
    (correct || []).forEach(function (term) {
      if (!term || term.length > 80) return;
      var re = new RegExp("\\b" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "s?\\b", "gi");
      out = out.replace(re, "_____");
    });
    return out.replace(/_{3,}/g, "_____").replace(/\s+/g, " ").trim();
  }

  function ideaFromWhy(why, correct) {
    return briefWhy(stripTerms(why, correct)) || answerText(correct);
  }

  function looksLikeScenario(q) {
    return /^(A |An |Your |The (company|admin|user|analyst|attacker|security|network)|Users |During |When |After |While |Which |What (should|is the best|type)|An attacker|A user|A laptop|A certificate)/i.test(String(q || ""));
  }

  function fundamentalsStem(entry) {
    var q = entry.q || entry.sourceQ || "";
    if (q && !looksLikeScenario(q) && q.length > 24 && q.length < 420) {
      return stripTerms(q, entry.correct) || ideaFromWhy(entry.why, entry.correct);
    }
    return entry.concept || ideaFromWhy(entry.why, entry.correct);
  }

  /* -------- catalog / banks -------- */

  var catalog = {};
  modules.forEach(function (m) {
    m.quizzes.forEach(function (quiz) {
      quiz.questions.forEach(function (question) {
        catalog[question.q] = {
          moduleId: m.id,
          moduleTitle: m.title,
          quizId: quiz.id,
          quizTitle: quiz.title,
          q: question.q,
          correct: question.correct.slice(),
          wrong: question.wrong.slice(),
          why: question.why,
        };
      });
    });
  });

  function toEntry(meta, misses) {
    return {
      id: meta.id || bankId(meta.moduleId, meta.quizId, meta.q),
      moduleId: meta.moduleId,
      moduleTitle: meta.moduleTitle,
      quizId: meta.quizId,
      quizTitle: meta.quizTitle,
      q: meta.q,
      correct: meta.correct.slice(),
      wrong: (meta.wrong || []).slice(),
      why: meta.why,
      concept: ideaFromWhy(meta.why, meta.correct),
      term: answerText(meta.correct),
      misses: misses || 1,
      streak: 0,
      status: "learning",
    };
  }

  function recordMiss(qText, fallback) {
    var meta = catalog[qText] || fallback;
    if (!meta) return;
    var id = bankId(meta.moduleId, meta.quizId || "x", meta.q);
    var prev = db.review[qText] || db.courseBank[id];
    var entry = toEntry(Object.assign({ id: id }, meta), (prev && prev.misses ? prev.misses : 0) + 1);
    db.review[qText] = entry;
    if (!db.moduleBank[meta.moduleId]) db.moduleBank[meta.moduleId] = {};
    db.moduleBank[meta.moduleId][id] = entry;
    db.courseBank[id] = entry;
    db.learn[id] = { streak: 0, status: "learning" };
    saveDb();
  }

  function reviewLearning() {
    return Object.keys(db.review).map(function (k) { return db.review[k]; })
      .filter(function (e) { return e && e.status !== "mastered"; })
      .sort(function (a, b) {
        return (a.moduleId || 0) - (b.moduleId || 0) || (b.misses || 0) - (a.misses || 0);
      });
  }

  function reviewMastered() {
    return Object.keys(db.review).map(function (k) { return db.review[k]; })
      .filter(function (e) { return e && e.status === "mastered"; });
  }

  function moduleEntries(mid) {
    var bag = db.moduleBank[mid] || {};
    return Object.keys(bag).map(function (k) { return bag[k]; });
  }

  function courseEntries() {
    return Object.keys(db.courseBank).map(function (k) { return db.courseBank[k]; });
  }

  /* -------- paper rotation (canvas) -------- */

  function paperKey(list) {
    return list.map(function (q) { return q.q; }).sort().join("\0");
  }

  function takeWindow(ring, start, n) {
    var out = [], used = {}, i = 0;
    while (out.length < n && i < ring.length) {
      var q = ring[(start + i) % ring.length];
      if (!used[q.q]) { used[q.q] = true; out.push(q); }
      i++;
    }
    return out;
  }

  function paperFor(m, quiz, attempts) {
    var n = quiz.questions.length;
    var setIndex = Math.floor((attempts || 0) / 2);
    if (setIndex === 0) return quiz.questions.slice();
    var seen = {}, ring = [];
    m.quizzes.forEach(function (qz) {
      qz.questions.forEach(function (item) {
        if (seen[item.q]) return;
        seen[item.q] = true;
        ring.push(item);
      });
    });
    var own = {};
    quiz.questions.forEach(function (item) { own[item.q] = true; });
    var ordered = ring.filter(function (item) { return !own[item.q]; }).concat(quiz.questions);
    if (ordered.length <= n) return quiz.questions.slice();
    var out = quiz.questions.slice();
    for (var k = 1; k <= setIndex; k++) {
      var start = ((k - 1) * n) % ordered.length;
      var candidate = takeWindow(ordered, start, n);
      var shift = 1;
      while (paperKey(candidate) === paperKey(out) && shift < ordered.length) {
        candidate = takeWindow(ordered, (start + shift) % ordered.length, n);
        shift++;
      }
      out = candidate;
    }
    return out;
  }

  function sittingNote(attempts) {
    var done = attempts || 0;
    if (!done) return "";
    if (done % 2 === 1) return "Same scenarios as last try. Choices are reshuffled so the old pattern will not match.";
    return "New questions from this module. After every two attempts, the set rotates.";
  }

  function nextPaperLabel(attempts) {
    var done = attempts || 0;
    if (!done) return "";
    if (done % 2 === 1) return "one more round on these";
    return "new questions this round";
  }

  function prepareItem(question, extras) {
    var options = shuffle(
      question.correct.map(function (t) { return { text: t, ok: true }; })
        .concat(question.wrong.map(function (t) { return { text: t, ok: false }; }))
    );
    return Object.assign({
      q: question.q,
      why: question.why,
      options: options,
      need: question.correct.length,
      multi: question.correct.length > 1,
      sourceQ: question.q,
      correct: question.correct.slice(),
      wrong: question.wrong.slice(),
      term: answerText(question.correct),
      concept: ideaFromWhy(question.why, question.correct),
    }, extras || {});
  }

  function prepareConcept(entry) {
    var wrong = (entry.wrong || []).slice();
    courseEntries().forEach(function (other) {
      if (wrong.length >= 6) return;
      if (other.term && other.term !== entry.term && wrong.indexOf(other.term) < 0) wrong.push(other.term);
    });
    while (wrong.length < 3) wrong.push("Not applicable");
    var options = shuffle(
      [{ text: entry.term, ok: true }].concat(
        shuffle(wrong).slice(0, 3).map(function (t) { return { text: t, ok: false }; })
      )
    );
    var stem = fundamentalsStem(entry);
    return {
      q: stem,
      why: entry.why,
      options: options,
      need: 1,
      multi: false,
      sourceQ: entry.q,
      correct: entry.correct.slice(),
      wrong: entry.wrong.slice(),
      term: entry.term,
      concept: stem,
      basics: true,
      bankId: entry.id,
      moduleId: entry.moduleId,
      quizId: entry.quizId,
      quizTitle: entry.quizTitle,
      moduleTitle: entry.moduleTitle,
    };
  }

  /* -------- overall -------- */

  function totalQuestions() {
    return modules.reduce(function (n, m) {
      return n + m.quizzes.reduce(function (k, q) { return k + q.questions.length; }, 0);
    }, 0);
  }

  function updateOverall() {
    var done = 0, total = 0, sum = 0;
    modules.forEach(function (m) {
      m.quizzes.forEach(function (q, qi) {
        total++;
        var r = db.progress[quizKey(m.id, qi)];
        if (r) { done++; sum += r.best; }
      });
    });
    var el = document.getElementById("overall");
    if (!el) return;
    el.innerHTML = "<b>" + done + "/" + total + "</b> quizzes taken" +
      (done ? " · avg best <b>" + Math.round(sum / done) + "%</b>" : "");
  }

  /* -------- screens -------- */

  function goHome() {
    view.screen = "home";
    view.session = null;
    view.learn = null;
    view.cards = null;
    view.terms = null;
    view.topic = null;
    render();
  }

  function render() {
    updateOverall();
    if (view.session) return renderSession();
    if (view.learn) return renderLearn();
    if (view.topic) return renderTopic();
    if (view.screen === "topics") return renderTopicsHome();
    return renderHome();
  }

  function renderHome() {
    var quizCount = modules.reduce(function (n, m) { return n + m.quizzes.length; }, 0);
    var taken = Object.keys(db.progress).length;
    var avg = 0;
    if (taken) {
      avg = Math.round(Object.keys(db.progress).reduce(function (s, k) { return s + db.progress[k].best; }, 0) / taken);
    }
    var html = "";
    html += "<h1>CompTIA Security+ SY0-701 quizzes</h1>";
    html += '<p class="lead">Modules 1 to 5 of the 16-module course. ' +
      totalQuestions() + " questions across " + quizCount + " quizzes. Miss one and it is saved under Review again. " +
      "After two tries, a quiz switches to different questions from that module.</p>";

    html += '<div class="stats-row">' +
      '<div class="stat"><b>' + taken + "/" + quizCount + "</b> Quizzes taken</div>" +
      '<div class="stat"><b>' + (taken ? avg + "%" : "—") + "</b> Average best score</div>" +
      '<div class="stats-actions">' +
      '<button class="btn primary" data-act="mixed-all">Mixed review: 25 random questions</button>' +
      '<button class="btn ghost" data-act="reset">Reset scores</button>' +
      "</div></div>";

    html += renderReviewBank();

    modules.forEach(function (m) {
      html += '<section class="module" id="module-' + m.id + '">';
      html += '<div class="module-head"><div class="module-num">' + m.id + "</div><div class=\"module-copy\">" +
        "<h2>" + esc(m.title) + "</h2>" +
        '<div class="module-domain">' + esc(m.domain) + "</div>" +
        '<div class="tags">' + m.objectives.map(function (o) {
          return '<span class="tag">' + esc(o) + "</span>";
        }).join("") + "</div></div>" +
        '<div class="module-actions">' +
        '<button class="btn small ghost" data-act="mixed-module" data-m="' + m.id + '">Whole-module review (15)</button>' +
        "</div></div>";

      if (m.topics && m.topics.length) {
        html += '<details class="topics"><summary>Everything this module covers</summary><ul>' +
          m.topics.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></details>";
      }

      html += '<div class="quiz-list">';
      m.quizzes.forEach(function (q, qi) {
        var r = db.progress[quizKey(m.id, qi)];
        var badge = r
          ? '<span class="badge ' + scoreClass(r.best) + '">Best ' + r.best + "%</span>"
          : '<span class="badge">New</span>';
        var note = r && r.attempts ? " · " + nextPaperLabel(r.attempts) : "";
        html += '<div class="quiz-card">' +
          '<div class="qc-head"><span class="qc-id">Quiz ' + esc(q.id) + "</span>" + badge + "</div>" +
          '<div class="qc-title">' + esc(q.title) + "</div>" +
          '<div class="qc-focus">' + esc(q.focus) + "</div>" +
          '<div class="qc-meta"><span>' + q.questions.length + " questions" + note + "</span>" +
          '<button class="btn primary small" data-act="start" data-m="' + m.id + '" data-q="' + qi + '">' +
          (r ? "Retake" : "Start") + "</button></div></div>";
      });
      html += "</div></section>";
    });

    html += '<p class="home-extra"><button class="btn ghost small" data-act="open-topics">Topic drills (ports, OSI, firewall)</button></p>';

    app.innerHTML = html;
    window.scrollTo(0, 0);
  }

  function renderReviewBank() {
    var learning = reviewLearning();
    var mastered = reviewMastered();
    if (!learning.length && !mastered.length) return "";
    var html = '<section class="module review-bank">';
    html += '<div class="module-head"><div class="module-num">R</div><div class="module-copy">' +
      "<h2>Review again</h2>" +
      '<div class="module-domain"><span class="pill warn">' + learning.length + " still learning</span> " +
      (mastered.length ? '<span class="pill good">' + mastered.length + " cleared</span>" : "") +
      "</div></div></div>";
    html += '<p class="lead">Misses from quizzes land here. Practice them as multiple choice — two correct in a row clears a card.</p>';
    if (learning.length) {
      html += '<div class="toolbar" style="margin-bottom:14px">' +
        '<button class="btn primary" data-act="learn-open">Practice missed (' + learning.length + ")</button>" +
        '<button class="btn ghost" data-act="clear-review">Clear review</button></div>';
      html += '<div class="review-list">';
      learning.forEach(function (entry) {
        html += '<div class="review-row">' +
          "<div><strong>" + esc(entry.term) + "</strong>" +
          '<div class="note-meta">Module ' + entry.moduleId + " · Quiz " + esc(entry.quizId || "") +
          " · missed " + (entry.misses || 1) + "×" +
          (entry.streak === 1 ? " · one more correct clears it" : "") +
          "</div></div></div>";
      });
      html += "</div>";
    }
    if (mastered.length) {
      html += '<details class="topics"><summary>Cleared (' + mastered.length + ")</summary>";
      mastered.forEach(function (entry) {
        html += '<div class="cleared-row"><span>' + esc(entry.term) +
          ' <span class="note-meta">· Module ' + entry.moduleId + "</span></span>" +
          '<button class="btn small" data-act="restudy" data-key="' + encodeURIComponent(entry.q) + '">Study again</button></div>';
      });
      html += "</details>";
    }
    html += "</section>";
    return html;
  }

  /* -------- quiz session -------- */

  function startQuiz(opts) {
    view.session = {
      kind: opts.basics ? "concept" : "quiz",
      title: opts.title,
      moduleId: opts.moduleId,
      quizIndex: opts.quizIndex,
      note: opts.note || "",
      items: opts.items,
      index: 0,
      selected: [],
      answered: false,
      results: [],
      retry: !!opts.retry,
    };
    render();
  }

  function startStored(mi, qi) {
    var m = modules.filter(function (x) { return x.id === mi; })[0];
    var quiz = m.quizzes[qi];
    var attempts = (db.progress[quizKey(mi, qi)] || {}).attempts || 0;
    startQuiz({
      title: "Quiz " + quiz.id + ": " + quiz.title,
      moduleId: m.id,
      quizIndex: qi,
      note: sittingNote(attempts),
      items: shuffle(paperFor(m, quiz, attempts)).map(function (q) {
        return prepareItem(q, { moduleId: m.id, quizId: quiz.id, quizTitle: quiz.title, moduleTitle: m.title });
      }),
    });
  }

  function startMixed(mod) {
    var pool = [];
    (mod ? [mod] : modules).forEach(function (m) {
      m.quizzes.forEach(function (quiz) {
        quiz.questions.forEach(function (q) {
          pool.push(prepareItem(q, { moduleId: m.id, quizId: quiz.id, quizTitle: quiz.title, moduleTitle: m.title }));
        });
      });
    });
    startQuiz({
      title: mod ? "Whole-module review: Module " + mod.id : "Mixed review: Modules 1–5",
      moduleId: null,
      quizIndex: null,
      items: shuffle(pool).slice(0, mod ? 15 : 25),
    });
  }

  function startConceptReview(entries, title) {
    if (!entries.length) return;
    startQuiz({
      title: title || "Fundamentals review",
      moduleId: null,
      quizIndex: null,
      basics: true,
      note: "Fundamentals only — the core idea behind each miss, not the original scenario wording.",
      items: shuffle(entries).map(prepareConcept),
      retry: true,
    });
  }

  function renderSession() {
    var s = view.session;
    if (s.index >= s.items.length) return renderResults();
    var item = s.items[s.index];
    var total = s.items.length;
    var pct = Math.round((s.index / total) * 100);
    var letters = "ABCDEFGH";
    var html = "";
    html += '<div class="crumbs"><a href="#/" data-act="home">Home</a><span>/</span><span>' + esc(s.title) + "</span></div>";
    if (s.note && s.index === 0 && !s.answered && !s.results.length) {
      html += '<p class="hint fresh">' + esc(s.note) + "</p>";
    }
    html += '<div class="progress"><span style="width:' + pct + '%"></span></div>';
    html += '<div class="qmeta"><span>Question ' + (s.index + 1) + " of " + total + "</span><span>" +
      s.results.filter(function (r) { return r.correct; }).length + " correct so far</span></div>";
    html += '<div class="question-card">';
    if (item.basics) html += '<div class="kicker">Fundamentals</div>';
    html += '<p class="question-text">' + esc(item.q) + "</p>";
    html += item.basics
      ? '<p class="hint">Which term matches this idea?</p>'
      : (item.multi
        ? '<p class="hint multi">Select ' + item.need + " answers, then press Submit.</p>"
        : '<p class="hint">Select one answer.</p>');
    html += '<div class="options">';
    item.options.forEach(function (o, i) {
      var cls = "option";
      var mark = "";
      if (s.answered) {
        if (o.ok) { cls += " correct"; mark = "Correct"; }
        else if (s.selected.indexOf(i) >= 0) { cls += " wrong"; mark = "Your pick"; }
      } else if (s.selected.indexOf(i) >= 0) {
        cls += " selected";
      }
      html += '<button class="' + cls + '" data-act="pick" data-i="' + i + '"' + (s.answered ? " disabled" : "") + ">" +
        '<span class="key">' + letters[i] + "</span><span>" + esc(o.text) + '</span><span class="mark">' + mark + "</span></button>";
    });
    html += "</div>";
    if (s.answered) {
      var last = s.results[s.results.length - 1];
      html += '<div class="feedback ' + (last.correct ? "good" : "bad") + '">' +
        '<div class="verdict">' + (last.correct ? "Correct" : "Not quite — saved to Review again") + "</div>" +
        "<div>" + esc(item.why) + "</div></div>";
    }
    html += '<div class="actions"><button class="btn ghost" data-act="quit">Quit</button><div class="right">';
    if (!s.answered) {
      html += '<button class="btn primary" data-act="submit"' + (s.selected.length === item.need ? "" : " disabled") + ">Submit answer</button>";
    } else {
      html += '<button class="btn primary" data-act="next">' + (s.index + 1 === total ? "See results" : "Next question") + "</button>";
    }
    html += "</div></div>";
    html += '<div class="kbd">Shortcuts: <kbd>A</kbd>–<kbd>D</kbd> choose · <kbd>Enter</kbd> submit / continue</div>';
    html += "</div>";
    app.innerHTML = html;
    window.scrollTo(0, 0);
  }

  function pick(i) {
    var s = view.session;
    if (!s || s.answered) return;
    var item = s.items[s.index];
    var pos = s.selected.indexOf(i);
    if (item.multi) {
      if (pos >= 0) s.selected.splice(pos, 1);
      else if (s.selected.length < item.need) s.selected.push(i);
      else { s.selected.shift(); s.selected.push(i); }
    } else {
      s.selected = [i];
    }
    renderSession();
  }

  function submitAnswer() {
    var s = view.session;
    if (!s || s.answered) return;
    var item = s.items[s.index];
    if (s.selected.length !== item.need) return;
    var ok = s.selected.every(function (i) { return item.options[i].ok; });
    s.answered = true;
    s.results.push({ item: item, selected: s.selected.slice(), correct: ok });
    if (!ok && s.kind === "quiz") {
      recordMiss(item.sourceQ, {
        moduleId: item.moduleId || 0,
        moduleTitle: item.moduleTitle || "Mixed",
        quizId: item.quizId || "mix",
        quizTitle: item.quizTitle || s.title,
        q: item.sourceQ,
        correct: item.correct,
        wrong: item.wrong,
        why: item.why,
      });
    }
    if (s.kind === "concept" && item.bankId) {
      gradeLearnCard(item.bankId, ok);
    }
    renderSession();
  }

  function nextQuestion() {
    var s = view.session;
    if (!s || !s.answered) return;
    s.index++;
    s.selected = [];
    s.answered = false;
    if (s.index >= s.items.length) renderResults();
    else renderSession();
  }

  function renderResults() {
    var s = view.session;
    var total = s.results.length;
    var right = s.results.filter(function (r) { return r.correct; }).length;
    var pct = total ? Math.round((right / total) * 100) : 0;
    var missed = s.results.filter(function (r) { return !r.correct; });

    if (s.kind === "quiz" && s.moduleId !== null && s.quizIndex !== null && !s.retry) {
      var key = quizKey(s.moduleId, s.quizIndex);
      var prev = db.progress[key];
      db.progress[key] = {
        last: pct,
        best: prev ? Math.max(prev.best, pct) : pct,
        attempts: (prev ? prev.attempts : 0) + 1,
      };
      saveDb();
    }
    updateOverall();

    var color = pct >= 80 ? "var(--good)" : pct >= 60 ? "var(--warn)" : "var(--bad)";
    var msg = pct >= 90 ? "Excellent. You have this topic down."
      : pct >= 80 ? "Strong result. Review the few you missed."
      : pct >= 60 ? "Getting there. Read the explanations below and try again."
      : "Needs more study. Revisit the CertMaster module, then review what you missed.";

    var html = "";
    html += '<div class="crumbs"><a href="#/" data-act="home">Home</a><span>/</span><span>' + esc(s.title) + " results</span></div>";
    html += '<div class="question-card result-hero">';
    html += '<div class="score-ring" style="--pct:' + pct + ";--ring:" + color + '"><div><span>' + pct + "%<small>" + right + "/" + total + "</small></span></div></div>";
    html += "<h2>" + esc(s.title) + "</h2>";
    html += '<p class="lead" style="margin:8px auto 18px">' + msg;
    if (s.kind === "quiz" && s.moduleId !== null && !s.retry) {
      var taken = db.progress[quizKey(s.moduleId, s.quizIndex)].attempts;
      html += taken % 2 === 0
        ? " Next time this quiz uses different CertMaster-aligned scenarios from the module."
        : " One more try on these questions, then they change.";
    }
    html += "</p>";
    html += '<div class="toolbar" style="justify-content:center;margin:0">';
    if (missed.length) {
      html += '<button class="btn primary" data-act="concept-missed">Retry ' + missed.length + " missed (fundamentals)</button>";
    }
    if (s.moduleId !== null && !s.retry) {
      html += '<button class="btn' + (missed.length ? "" : " primary") + '" data-act="start" data-m="' + s.moduleId + '" data-q="' + s.quizIndex + '">Retake full quiz</button>';
    }
    html += '<button class="btn ghost" data-act="home">All quizzes</button></div></div>';

    html += '<div class="question-card" style="margin-top:18px"><h2 style="margin-bottom:6px">Attempt review</h2>';
    html += '<p class="lead">Every question — marked right or wrong, what you answered, the correct answer, and a short explanation.</p>';
    s.results.forEach(function (r, n) {
      var correctTexts = r.item.options.filter(function (o) { return o.ok; }).map(function (o) { return o.text; });
      var chosen = r.selected.map(function (i) { return r.item.options[i].text; });
      html += '<div class="review-item">';
      html += '<div class="review-q"><span class="pill ' + (r.correct ? "good" : "warn") + '">' +
        (r.correct ? "Right" : "Missed") + "</span> " + (n + 1) + ". " + esc(r.item.q) + "</div>";
      html += '<div class="review-line ' + (r.correct ? "ok" : "no") + '"><span class="lbl">Your answer: </span>' + esc(chosen.join(" + ")) + "</div>";
      if (!r.correct) {
        html += '<div class="review-line ok"><span class="lbl">Correct answer: </span>' + esc(correctTexts.join(" + ")) + "</div>";
      }
      html += '<div class="review-why">' + esc(briefWhy(r.item.why)) + "</div></div>";
    });
    if (missed.length && s.kind === "quiz") {
      html += '<p class="saved-line">Misses were added to Review again, the module bank, and the course bank.</p>';
    }
    html += "</div>";
    app.innerHTML = html;
    window.scrollTo(0, 0);
  }

  /* -------- learn / cards / terms -------- */

  function gradeLearnCard(id, ok) {
    var entry = null;
    Object.keys(db.review).forEach(function (k) {
      if (db.review[k].id === id || k === id) entry = db.review[k];
    });
    if (!entry && db.courseBank[id]) entry = db.courseBank[id];
    var st = db.learn[id] || { streak: 0, status: "learning" };
    st.streak = ok ? (st.streak || 0) + 1 : 0;
    st.status = ok && st.streak >= 2 ? "mastered" : "learning";
    db.learn[id] = st;
    if (entry) {
      entry.streak = st.streak;
      entry.status = st.status;
      db.review[entry.q] = entry;
      if (db.courseBank[entry.id]) db.courseBank[entry.id] = entry;
      if (db.moduleBank[entry.moduleId]) db.moduleBank[entry.moduleId][entry.id] = entry;
    }
    saveDb();
    return st;
  }

  function openLearn() {
    var learning = reviewLearning().map(function (e) {
      if (!e.id) e.id = bankId(e.moduleId || 0, e.quizId || "x", e.q);
      if (!e.term) e.term = answerText(e.correct);
      if (!e.concept) e.concept = fundamentalsStem(e);
      return e;
    });
    if (!learning.length) return;
    view.cards = null;
    view.terms = null;
    view.learn = {
      mode: "mc",
      queue: shuffle(learning.map(function (e) { return e.id; })),
      byId: learning.reduce(function (acc, e) { acc[e.id] = e; return acc; }, {}),
      selected: null,
      revealed: false,
      topicId: null,
    };
    render();
  }

  function openTopicLearn(topicId) {
    var topic = topics.filter(function (t) { return t.id === topicId; })[0];
    if (!topic) return;
    var entries = topic.cards.map(function (c) {
      var id = topicId + ":" + c.term;
      var st = db.topicLearn[id] || { streak: 0, status: "learning" };
      return {
        id: id,
        term: c.term,
        concept: c.definition,
        correct: [c.term],
        wrong: topic.cards.map(function (x) { return x.term; }).filter(function (t) { return t !== c.term; }),
        why: c.definition,
        q: c.term,
        status: st.status,
        moduleId: null,
      };
    }).filter(function (e) { return e.status !== "mastered"; });
    if (!entries.length) {
      alert("This topic deck is cleared. Reset it to study again.");
      return;
    }
    view.topic = topic;
    view.cards = null;
    view.terms = null;
    view.learn = {
      mode: "mc",
      queue: shuffle(entries.map(function (e) { return e.id; })),
      byId: entries.reduce(function (acc, e) { acc[e.id] = e; return acc; }, {}),
      selected: null,
      revealed: false,
      topicId: topicId,
    };
    render();
  }

  function learnDistractors(entry, L) {
    var out = [];
    var seen = {};
    seen[entry.term] = true;
    function push(t) {
      if (!t || seen[t] || out.length >= 3) return;
      seen[t] = true;
      out.push(t);
    }
    (entry.wrong || []).forEach(push);
    Object.keys(L.byId).forEach(function (k) {
      push(L.byId[k].term);
    });
    courseEntries().forEach(function (e) { push(e.term); });
    while (out.length < 3) push("Not applicable " + (out.length + 1));
    return out.slice(0, 3);
  }

  function afterLearn(id, ok) {
    var L = view.learn;
    var st;
    if (L.topicId) {
      var prev = db.topicLearn[id] || { streak: 0, status: "learning" };
      var streak = ok ? (prev.streak || 0) + 1 : 0;
      st = { streak: streak, status: ok && streak >= 2 ? "mastered" : "learning" };
      db.topicLearn[id] = st;
      saveDb();
    } else {
      st = gradeLearnCard(id, ok);
    }
    L._pending = { id: id, ok: ok, mastered: st.status === "mastered" };
    return st;
  }

  function advanceLearn() {
    var L = view.learn;
    var pending = L._pending;
    L._pending = null;
    L.selected = null;
    L.revealed = false;
    L.lastOk = false;
    L._mc = null;
    L._mcFor = null;
    if (!pending) return;
    var id = pending.id;
    var rest = L.queue.slice(1);
    if (pending.mastered) L.queue = rest;
    else {
      var pos = Math.min(pending.ok ? 3 : 1, rest.length);
      rest.splice(pos, 0, id);
      L.queue = rest;
    }
  }

  function renderLearn() {
    var L = view.learn;
    if (!L.queue.length) {
      app.innerHTML = '<div class="question-card"><h2>Cleared</h2><p class="lead">Everything in this set is mastered for now.</p>' +
        '<button class="btn primary" data-act="home">Back</button></div>';
      return;
    }
    var left = L.queue.length;
    var html = '<div class="crumbs"><a href="#/" data-act="home">Home</a><span>/</span><span>Review practice</span></div>';
    html += '<p class="hint fresh">' + left + " left · two correct in a row clears a card</p>";
    html += renderMc(L);
    app.innerHTML = html;
  }

  function renderMc(L) {
    var entry = L.byId[L.queue[0]];
    if (!entry) {
      L.queue = L.queue.slice(1);
      return '<div class="question-card"><p class="lead">That card is gone.</p>' +
        '<button class="btn primary" data-act="learn-next">Continue</button></div>';
    }
    if (!L._mc || L._mcFor !== entry.id) {
      var distractors = learnDistractors(entry, L);
      L._mc = shuffle([{ text: entry.term, ok: true }].concat(distractors.map(function (t) { return { text: t, ok: false }; })));
      L._mcFor = entry.id;
    }
    var options = L._mc;
    var stem = entry.concept || fundamentalsStem(entry) || briefWhy(entry.why) || entry.q;
    var html = '<div class="question-card"><div class="kicker">Fundamentals</div>' +
      '<p class="question-text">' + esc(stem) + "</p>" +
      '<p class="hint">Which term matches?</p><div class="options">';
    options.forEach(function (o, i) {
      var cls = "option";
      if (L.revealed) {
        if (o.ok) cls += " correct";
        else if (L.selected === i) cls += " wrong";
      } else if (L.selected === i) cls += " selected";
      html += '<button class="' + cls + '" data-act="learn-pick" data-i="' + i + '"' + (L.revealed ? " disabled" : "") + ">" +
        '<span class="key">' + "ABCD"[i] + "</span><span>" + esc(o.text) + '</span><span class="mark"></span></button>';
    });
    html += '</div>';
    if (L.revealed) {
      html += '<div class="feedback ' + (L.lastOk ? "good" : "bad") + '"><div class="verdict">' +
        (L.lastOk ? "Correct" : "Not quite") + "</div>" +
        '<div class="review-why">' + esc(briefWhy(entry.why) || stem) + "</div></div>";
    }
    html += '<div class="actions"><button class="btn ghost" data-act="home">Back</button><div class="right">';
    if (!L.revealed) html += '<button class="btn primary" data-act="learn-check-mc"' + (L.selected == null ? " disabled" : "") + ">Check</button>";
    else html += '<button class="btn primary" data-act="learn-next">Next</button>';
    html += "</div></div></div>";
    return html;
  }

  function renderTopicsHome() {
    var html = '<div class="crumbs"><a href="#/" data-act="home">Home</a><span>/</span><span>Topics</span></div>';
    html += "<h1>Topic drills</h1>";
    html += '<p class="lead">Focused CertMaster Module 5 decks — ports/protocols, OSI, and firewall layers &amp; placement.</p>';
    html += '<div class="topic-grid">';
    topics.forEach(function (t) {
      var left = t.cards.filter(function (c) {
        var st = db.topicLearn[t.id + ":" + c.term];
        return !st || st.status !== "mastered";
      }).length;
      html += '<button class="topic-card" data-act="open-topic" data-id="' + esc(t.id) + '">' +
        "<strong>" + esc(t.title) + "</strong>" +
        "<span>" + esc(t.blurb) + "</span>" +
        "<span>" + t.cards.length + " cards · " + left + " still learning</span>" +
        "<span>" + esc(t.source || "") + "</span></button>";
    });
    html += "</div>";
    app.innerHTML = html;
  }

  function renderTopic() {
    var t = view.topic;
    var html = '<div class="crumbs"><a href="#/" data-act="home">Home</a><span>/</span>' +
      '<a href="#/" data-act="open-topics">Topics</a><span>/</span><span>' + esc(t.title) + "</span></div>";
    html += "<h1>" + esc(t.title) + "</h1>";
    html += '<p class="lead">' + esc(t.blurb) + "</p>";
    html += '<div class="toolbar">' +
      '<button class="btn primary" data-act="topic-learn" data-id="' + esc(t.id) + '">Practice (multiple choice)</button>' +
      '<button class="btn ghost" data-act="reset-topic" data-id="' + esc(t.id) + '">Reset topic</button></div>';
    html += '<div class="question-card">';
    t.cards.forEach(function (c) {
      html += '<div class="note"><h3>' + esc(c.term) + "</h3><div class=\"qc-focus\">" + esc(c.definition) + "</div></div>";
    });
    html += "</div>";
    app.innerHTML = html;
  }

  /* -------- events -------- */

  app.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var act = btn.getAttribute("data-act");

    if (act === "home") { goHome(); return; }
    if (act === "start") { startStored(+btn.getAttribute("data-m"), +btn.getAttribute("data-q")); return; }
    if (act === "mixed-all") { startMixed(null); return; }
    if (act === "mixed-module") {
      startMixed(modules.filter(function (m) { return m.id === +btn.getAttribute("data-m"); })[0]);
      return;
    }
    if (act === "open-topics") { view.screen = "topics"; view.topic = null; view.learn = null; render(); return; }
    if (act === "open-topic") {
      view.topic = topics.filter(function (t) { return t.id === btn.getAttribute("data-id"); })[0];
      view.screen = "topics";
      renderTopic();
      return;
    }
    if (act === "topic-learn") {
      openTopicLearn(btn.getAttribute("data-id"));
      return;
    }
    if (act === "reset-topic") {
      var tid = btn.getAttribute("data-id");
      Object.keys(db.topicLearn).forEach(function (k) {
        if (k.indexOf(tid + ":") === 0) delete db.topicLearn[k];
      });
      saveDb();
      renderTopic();
      return;
    }
    if (act === "reset") {
      if (confirm("Reset quiz scores? Review banks stay.")) {
        db.progress = {};
        saveDb();
        render();
      }
      return;
    }
    if (act === "pick") { pick(+btn.getAttribute("data-i")); return; }
    if (act === "submit") { submitAnswer(); return; }
    if (act === "next") { nextQuestion(); return; }
    if (act === "quit") { goHome(); return; }
    if (act === "concept-missed") {
      var missed = view.session.results.filter(function (r) { return !r.correct; }).map(function (r) {
        var item = r.item;
        return toEntry({
          id: bankId(item.moduleId || 0, item.quizId || "x", item.sourceQ),
          moduleId: item.moduleId || 0,
          moduleTitle: item.moduleTitle,
          quizId: item.quizId,
          quizTitle: item.quizTitle,
          q: item.sourceQ,
          correct: item.correct,
          wrong: item.wrong,
          why: item.why,
        });
      });
      startConceptReview(missed, "Missed fundamentals");
      return;
    }
    if (act === "concept-course") { startConceptReview(courseEntries().map(function (e) { return e; }), "Course fundamentals"); return; }
    if (act === "concept-module") {
      startConceptReview(moduleEntries(+btn.getAttribute("data-m")), "Module " + btn.getAttribute("data-m") + " fundamentals");
      return;
    }
    if (act === "learn-open") { openLearn(); return; }
    if (act === "learn-pick") { if (!view.learn.revealed) { view.learn.selected = +btn.getAttribute("data-i"); render(); } return; }
    if (act === "learn-check-mc") {
      var ok = !!(view.learn._mc[view.learn.selected] && view.learn._mc[view.learn.selected].ok);
      view.learn.revealed = true;
      view.learn.lastOk = ok;
      afterLearn(view.learn.queue[0], ok);
      render();
      return;
    }
    if (act === "learn-next") {
      advanceLearn();
      render();
      return;
    }
    if (act === "clear-review") {
      if (confirm("Clear Review again?")) {
        db.review = {};
        db.learn = {};
        saveDb();
        render();
      }
      return;
    }
    if (act === "restudy") {
      var q = decodeURIComponent(btn.getAttribute("data-key") || "");
      if (db.review[q]) {
        db.review[q].status = "learning";
        db.review[q].streak = 0;
        if (db.review[q].id) db.learn[db.review[q].id] = { streak: 0, status: "learning" };
        saveDb();
        render();
      }
      return;
    }
  });

  window.addEventListener("keydown", function (e) {
    if (view.learn) {
      var L = view.learn;
      if (e.key === "Enter") {
        e.preventDefault();
        if (!L.revealed && L.selected != null) {
          var check = app.querySelector('[data-act="learn-check-mc"]');
          if (check) check.click();
        } else if (L.revealed) {
          advanceLearn();
          render();
        }
        return;
      }
      if (L.revealed) return;
      var lmap = { a: 0, b: 1, c: 2, d: 3, "1": 0, "2": 1, "3": 2, "4": 3 };
      var lk = e.key.toLowerCase();
      if (lmap[lk] != null && L._mc && lmap[lk] < L._mc.length) {
        e.preventDefault();
        L.selected = lmap[lk];
        render();
      }
      return;
    }
    if (!view.session) return;
    var s = view.session;
    if (s.index >= s.items.length) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (!s.answered) submitAnswer();
      else nextQuestion();
      return;
    }
    if (s.answered) return;
    var map = { a: 0, b: 1, c: 2, d: 3, "1": 0, "2": 1, "3": 2, "4": 3 };
    var key = e.key.toLowerCase();
    if (map[key] != null && map[key] < s.items[s.index].options.length) {
      e.preventDefault();
      pick(map[key]);
    }
  });

  window.addEventListener("hashchange", function () {
    if (location.hash === "" || location.hash === "#/") goHome();
  });

  render();
})();
