const { gradeAlternatives, parseOutput } = require("./assert-tools.cjs");

module.exports = (output, context) => {
  try {
    const plan = parseOutput(output);
    if (plan.kind !== "tool_calls") return { pass: false, score: 0, reason: `期望tool_calls，实际${plan.kind || "无有效kind"}。` };
    return gradeAlternatives(plan.calls || [], {
      ...context.vars,
      expectedAlternatives: context.vars.expectedPlannerAlternatives || context.vars.expectedAlternatives
    });
  } catch (error) {
    return { pass: false, score: 0, reason: `无法解析Planner输出：${error.message}` };
  }
};
