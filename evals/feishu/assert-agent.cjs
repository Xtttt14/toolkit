const { gradeAlternatives, parseOutput } = require("./assert-tools.cjs");

module.exports = (output, context) => {
  try {
    const trajectory = parseOutput(output);
    const graded = gradeAlternatives(trajectory.executedCalls || [], context.vars);
    if (trajectory.status !== "completed") {
      return { ...graded, pass: false, score: graded.score * 0.8, reason: `Agent状态为${trajectory.status}。${graded.reason}` };
    }
    return graded;
  } catch (error) {
    return { pass: false, score: 0, reason: `无法解析Agent轨迹：${error.message}` };
  }
};
