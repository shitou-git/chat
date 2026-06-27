import * as utils from './js/utils.js';
console.log("Utils loaded successfully");
console.log("stripMarkdown:", typeof utils.stripMarkdown);
console.log("latexToSpeakable:", typeof utils.latexToSpeakable);
console.log("escapeHtml:", typeof utils.escapeHtml);

// 测试
console.log("\nTest stripMarkdown:");
console.log(utils.stripMarkdown("x的解是$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$"));
console.log(utils.stripMarkdown("这是一个普通文本"));
console.log(utils.stripMarkdown("派的值是$\\pi$"));
