function parseOutput(output) {
  if (output && typeof output === "object") return output;
  return JSON.parse(String(output || ""));
}

function partialMatch(actual, expected) {
  if (expected == null || typeof expected !== "object") return actual === expected;
  if (Array.isArray(expected)) return Array.isArray(actual) && expected.every((item, index) => partialMatch(actual[index], item));
  return Object.entries(expected).every(([key, value]) => partialMatch(actual?.[key], value));
}

function gradeCalls(actualCalls, expectedCalls) {
  const components = [];
  components.push({
    pass: actualCalls.length === expectedCalls.length,
    score: actualCalls.length === expectedCalls.length ? 1 : 0,
    reason: `期望${expectedCalls.length}个工具调用，实际${actualCalls.length}个。`
  });
  expectedCalls.forEach((expected, index) => {
    const actual = actualCalls[index];
    const pass = Boolean(actual) && actual.name === expected.name && partialMatch(actual.arguments || {}, expected.arguments || {});
    components.push({
      pass,
      score: pass ? 1 : 0,
      reason: pass ? `第${index + 1}个任务匹配${expected.name}。` : `第${index + 1}个任务期望${JSON.stringify(expected)}，实际${JSON.stringify(actual || null)}。`
    });
  });
  const score = components.reduce((sum, item) => sum + item.score, 0) / components.length;
  return { pass: components.every(item => item.pass), score, reason: components.filter(item => !item.pass).map(item => item.reason).join(" ") || "所有任务均被正确规划。", componentResults: components };
}

function gradeAlternatives(actualCalls, vars = {}) {
  const alternatives = Array.isArray(vars.expectedAlternatives) && vars.expectedAlternatives.length
    ? vars.expectedAlternatives
    : [vars.expectedCalls || []];
  const graded = alternatives.map(expected => gradeCalls(actualCalls, expected));
  const passed = graded.find(result => result.pass);
  if (passed) return passed;
  return graded.sort((a, b) => b.score - a.score)[0];
}

module.exports = { gradeAlternatives, gradeCalls, parseOutput };
