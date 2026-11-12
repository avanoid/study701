var SECPLUS = { modules: [] };

/**
 * Question helper.
 * correct: a string (single answer) or an array of strings (select-all-that-apply).
 * wrong:   array of distractor strings.
 * why:     explanation shown after answering.
 */
function Q(text, correct, wrong, why) {
  return {
    q: text,
    correct: Array.isArray(correct) ? correct : [correct],
    wrong: wrong,
    why: why,
  };
}

if (typeof window !== "undefined") {
  window.SECPLUS = SECPLUS;
  window.Q = Q;
}
