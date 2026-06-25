/**
 * 工具函数模块
 * 包含 HTML 转义、LaTeX 处理、Markdown 渲染、文本处理等工具函数
 */

import { IDENTITY_REPLY } from './config.js';

// ================================================================
// HTML 转义
// ================================================================

export function escapeHtml(s) {
  if (s == null) return "";
  var str = String(s);
  // 快路径：无任何需转义字符时直接返回
  if (str.indexOf('&') === -1 && str.indexOf('<') === -1 && str.indexOf('>') === -1 &&
      str.indexOf('"') === -1 && str.indexOf("'") === -1) return str;
  // 有特殊字符：链式 replace
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ================================================================
// 身份过滤
// ================================================================

/**
 * 统一身份回复：屏蔽 AI 自述为 Sapiens/Agnes 的语句
 */
export function sanitizeIdentity(text) {
  if (!text) return text;
  var identityPhrases = [
    /我(是|由|为)(由)?\s*[Ss]apiens[^。\n]{0,25}开发的[^。！？\n]*[。！？.!?]?/,
    /我(是|由|为)(由)?\s*[Ss]apiens[^。！？\n]{0,40}开发[^。！？\n]*[。！？.!?]?/,
    /我(是|由)(一个)?\s*[Aa]gnes[^。\n]{0,25}开发的[^。！？\n]*[。！？.!?]?/,
    /我(是|为)(一个)?\s*[Aa]gnes[^。！？\n]{0,40}开发[^。！？\n]*[。！？.!?]?/,
    /我叫?[Aa]gnes[^。！？\n]{0,30}开发[^。！？\n]*[。！？.!?]?/,
    /[Ss]apiens[^。！？\n]{0,30}开发的[^。！？\n]*[。！？.!?]?/,
    /[Aa]gnes[^。！？\n]{0,30}开发[^。！？\n]*[。！？.!?]?/,
    /您好！我是\s*[Aa]gnes[^。！？\n]*[。！？.!?]?/,
    /你好！我是\s*[Aa]gnes[^。！？\n]*[。！？.!?]?/,
    /我是(一款|一个)?(基于)?\s*[Aa]gnes[^。！？\n]*(开发)?[^。！？\n]*[。！？.!?]?/,
  ];
  var result = text;
  var replaced = false;
  for (var i = 0; i < identityPhrases.length; i++) {
    if (identityPhrases[i].test(result)) {
      result = result.replace(identityPhrases[i], IDENTITY_REPLY);
      replaced = true;
    }
  }
  // 如果整个回复只有身份自述（没有其他有效内容），直接用统一回复
  var trimmed = result.trim();
  if (!replaced && trimmed.length < 40) {
    var low = trimmed.toLowerCase();
    if (/sapiens|agnes|我是由|你好.*我是.*开发/.test(low)) {
      return IDENTITY_REPLY;
    }
  }
  return result;
}

// ================================================================
// LaTeX 处理
// ================================================================

export function fixLatex(text) {
  if (!text) return text;
  var needsLatex = text.indexOf("\\") !== -1;
  var needsGreek = /[παβγδεθλμρστφψωΔΣΩ]/.test(text);
  var needsSymbol = /[√×÷≤≥≠→←↔∞∑∫∏∂∇∈∉⊂⊃∪∩°±∓]/.test(text);
  if (!needsLatex && !needsGreek && !needsSymbol) return text;

  var result = text;

  if (needsLatex) {
    result = result
      .replace(/\\sqrt\{([^{}]+)\}\{([^{}]+)\}/g, "\\sqrt[$1]{$2}")
      .replace(/\\sqrt(\d)/g, "\\sqrt{$1}")
      .replace(/\\sqrt(\[[^\]]+\])([a-zA-Z])/g, "\\sqrt$1{$2}")
      .replace(/\\frac(\d)(\d)/g, "\\frac{$1}{$2}")
      .replace(/\\frac(\d)\{([^{}]+)\}/g, "\\frac{$1}{$2}")
      .replace(/\\frac\{([^{}]+)\}(\d)/g, "\\frac{$1}{$2}");
  }

  if (needsSymbol) {
    result = result
      .replace(/√/g, "\\sqrt ")
      .replace(/×/g, "\\times ")
      .replace(/÷/g, "\\div ")
      .replace(/≤/g, "\\leq ")
      .replace(/≥/g, "\\geq ")
      .replace(/≠/g, "\\neq ")
      .replace(/→/g, "\\rightarrow ")
      .replace(/←/g, "\\leftarrow ")
      .replace(/↔/g, "\\leftrightarrow ")
      .replace(/∞/g, "\\infty ")
      .replace(/∑/g, "\\sum ")
      .replace(/∫/g, "\\int ")
      .replace(/∏/g, "\\prod ")
      .replace(/∂/g, "\\partial ")
      .replace(/∇/g, "\\nabla ")
      .replace(/∈/g, "\\in ")
      .replace(/∉/g, "\\notin ")
      .replace(/⊂/g, "\\subset ")
      .replace(/⊃/g, "\\supset ")
      .replace(/∪/g, "\\cup ")
      .replace(/∩/g, "\\cap ")
      .replace(/∀/g, "\\forall ")
      .replace(/∃/g, "\\exists ")
      .replace(/°/g, "^\\circ ")
      .replace(/±/g, "\\pm ")
      .replace(/∓/g, "\\mp ");
  }

  if (needsGreek) {
    result = result
      .replace(/(?<!\\)π/g, "$\\pi$")
      .replace(/(?<!\\)α/g, "$\\alpha$")
      .replace(/(?<!\\)β/g, "$\\beta$")
      .replace(/(?<!\\)γ/g, "$\\gamma$")
      .replace(/(?<!\\)δ/g, "$\\delta$")
      .replace(/(?<!\\)ε/g, "$\\varepsilon$")
      .replace(/(?<!\\)θ/g, "$\\theta$")
      .replace(/(?<!\\)λ/g, "$\\lambda$")
      .replace(/(?<!\\)μ/g, "$\\mu$")
      .replace(/(?<!\\)ρ/g, "$\\rho$")
      .replace(/(?<!\\)σ/g, "$\\sigma$")
      .replace(/(?<!\\)τ/g, "$\\tau$")
      .replace(/(?<!\\)φ/g, "$\\varphi$")
      .replace(/(?<!\\)ψ/g, "$\\psi$")
      .replace(/(?<!\\)ω/g, "$\\omega$")
      .replace(/(?<!\\)Δ/g, "$\\Delta$")
      .replace(/(?<!\\)Σ/g, "$\\Sigma$")
      .replace(/(?<!\\)Ω/g, "$\\Omega$");
  }

  return result;
}

// ================================================================
// Markdown 渲染
// ================================================================

/** 将文本+公式混合内容渲染为 HTML */
export function renderContent(text) {
  if (!text) return "";
  var fixed = fixLatex(text);

  // 第 1 轮：提取代码块
  var codeBlocks = [];
  fixed = fixed.replace(/```(\w*)\n?([\s\S]*?)```/g, function (m, lang, code) {
    var idx = codeBlocks.length;
    codeBlocks.push({ lang: lang, code: code.replace(/\n$/, "") });
    return "\x00CODE" + idx + "\x00";
  });

  // 第 2 轮：分离公式与文本
  var regex = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  var parts = [];
  var lastEnd = 0;
  var match;

  while ((match = regex.exec(fixed)) !== null) {
    if (match.index > lastEnd) {
      parts.push({ type: "text", content: fixed.substring(lastEnd, match.index) });
    }
    if (match[1] !== undefined) {
      parts.push({ type: "block", content: match[1].trim() });
    } else {
      parts.push({ type: "inline", content: match[2].trim() });
    }
    lastEnd = match.index + match[0].length;
  }
  if (lastEnd < fixed.length) {
    parts.push({ type: "text", content: fixed.substring(lastEnd) });
  }

  // 第 3 轮：渲染各部分
  var result = "";
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (p.type === "text") {
      var textContent = p.content;
      if (i > 0 && parts[i - 1].type === "block") {
        textContent = textContent.replace(/^\n+/, "");
      }
      if (i < parts.length - 1 && parts[i + 1].type === "block") {
        textContent = textContent.replace(/\n+$/, "");
      }
      result += renderText(textContent);
    } else {
      try {
        if (typeof katex === "undefined") {
          result += '<code class="math-fallback">' + escapeHtml(p.content) + "</code>";
        } else {
          var html = katex.renderToString(p.content, {
            throwOnError: false,
            displayMode: p.type === "block",
            output: "html",
          });
          if (p.type === "block") {
            result += '<div class="katex-block">' + html + "</div>";
          } else {
            result += html;
          }
        }
      } catch (e) {
        result += '<code class="math-fallback">' + escapeHtml(p.content) + "</code>";
      }
    }
  }

  // 第 4 轮：还原代码块
  result = result.replace(/\x00CODE(\d+)\x00/g, function (m, idx) {
    var block = codeBlocks[parseInt(idx, 10)];
    if (!block) return m;
    return (
      '<pre class="code-block"><code>' +
      escapeHtml(block.code) +
      "</code></pre>"
    );
  });

  return result;
}

/** 流式期间的轻量渲染 */
export function renderContentLight(text) {
  if (!text) return "";
  var work = text;
  var tickMatches = work.match(/```/g);
  if (tickMatches && tickMatches.length % 2 === 1) {
    work = work.substring(0, work.lastIndexOf("```"));
  }
  var parts = work.split(/(```\w*\n?[\s\S]*?```)/);
  var result = "";
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    if (part.substring(0, 3) === "```") {
      var nlIdx = part.indexOf("\n");
      var codeStart = nlIdx !== -1 ? nlIdx + 1 : 3;
      var codeEnd = part.lastIndexOf("```");
      if (codeEnd > codeStart) {
        var code = part.substring(codeStart, codeEnd).replace(/\n$/, "");
        result += '<pre class="code-block"><code>' + escapeHtml(code) + "</code></pre>";
      }
    } else {
      var html = escapeHtml(part);
      if (html.indexOf('`') !== -1) {
        html = html.replace(/`([^`]+)`/g, '<code class="code-inline">$1</code>');
      }
      if (html.indexOf('**') !== -1) {
        html = html.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
      }
      html = html.replace(/\n/g, "<br>");
      result += html;
    }
  }
  return result;
}

/** 渲染纯文本部分：Markdown 处理 */
export function renderText(text) {
  var tables = [];
  var safeText = text;

  // 表格预处理
  if (/\|/.test(safeText) && /\n\s*\|[-:\s|]+\|\s*\n/.test(safeText)) {
    var tableRegex = /(?:^|\n)((?:\|[^\n]*\|\n){1,}(?:\|[-:\s|]+\|\n)(?:\|[^\n]*\|\n?)+)/gm;
    safeText = safeText.replace(tableRegex, function (fullMatch, tableBlock) {
      var lines = tableBlock.trim().split(/\n+/).filter(function (l) {
        return /\|\s*$/.test(l) || /^\s*\|/.test(l);
      });
      if (lines.length < 3) return fullMatch;

      var sepLine = lines[1] || "";
      var aligns = sepLine.split("|").slice(1, -1).map(function (cell) {
        var c = (cell || "").trim();
        var left = /^:/.test(c);
        var right = /:$/.test(c);
        if (left && right) return "center";
        if (right) return "right";
        if (left) return "left";
        return "";
      });

      var processCell = function (content) {
        if (!content) return "";
        var s = escapeHtml((content || "").trim())
          .replace(/\s+/g, " ")
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          .replace(/`([^`]+)`/g, '<code class="code-inline">$1</code>');
        return s;
      };

      var headerCells = lines[0].split("|").slice(1, -1);
      var theadHtml = "<thead><tr>";
      for (var h = 0; h < headerCells.length; h++) {
        var a = aligns[h] || "";
        var alignAttr = a ? ' align="' + a + '"' : "";
        theadHtml += "<th" + alignAttr + ">" + processCell(headerCells[h]) + "</th>";
      }
      theadHtml += "</tr></thead>";

      var tbodyHtml = "<tbody>";
      for (var r = 2; r < lines.length; r++) {
        var cells = lines[r].split("|").slice(1, -1);
        tbodyHtml += "<tr>";
        for (var c = 0; c < cells.length; c++) {
          var alignA = aligns[c] || "";
          var alignAttr2 = alignA ? ' align="' + alignA + '"' : "";
          tbodyHtml += "<td" + alignAttr2 + ">" + processCell(cells[c]) + "</td>";
        }
        tbodyHtml += "</tr>";
      }
      tbodyHtml += "</tbody>";

      var tIdx = tables.length;
      tables.push('<table class="md-table">' + theadHtml + tbodyHtml + "</table>");
      return "\n\x02TABLE" + tIdx + "\x02\n";
    });
  }

  var html = escapeHtml(safeText);

  // 行内代码
  var inlineCodes = [];
  html = html.replace(/`([^`]+)`/g, function (m, code) {
    var idx = inlineCodes.length;
    inlineCodes.push(code);
    return "\x01INLINE" + idx + "\x01";
  });

  // 标题
  html = html.replace(/^#{1,6}\s+(.+)$/gm, function (m, content) {
    var level = m.match(/^#+/)[0].length;
    return "<h" + level + ">" + content + "</h" + level + ">";
  });

  // 加粗
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // 列表
  html = html.replace(/^[-*]\s+/gm, "• ");
  html = html.replace(/^(\d+\.)\s+/gm, "$1 ");

  // 换行
  html = html.replace(/\n/g, "<br>");

  // 还原行内代码
  html = html.replace(/\x01INLINE(\d+)\x01/g, function (m, idx) {
    return '<code class="code-inline">' + inlineCodes[parseInt(idx, 10)] + "</code>";
  });

  // 还原表格
  html = html.replace(/\x02TABLE(\d+)\x02/g, function (m, idx) {
    return tables[parseInt(idx, 10)] || "";
  });

  return html;
}

/** 渲染用户消息（纯文本） */
export function renderUserText(text) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

// ================================================================
// 相关问题处理
// ================================================================

/** 根据正文长度计算应该显示几条相关问题 */
export function calcFollowUpCount(bodyText) {
  var len = (bodyText || "").length;
  if (len < 300) return 1;
  if (len < 800) return 2;
  return 3;
}

/** 从 AI 回答中分离出正文与相关问题列表 */
export function extractFollowUpQuestions(text) {
  var emptyResult = { body: text || "", questions: [] };
  if (!text) return emptyResult;

  function isQuestionLine(line) {
    if (!line) return null;
    var s = line.trim();
    if (!s || s.length < 4) return null;
    var match = s.match(/^(?:[?？]|\d+[\.\、\)\．]|[-•·■▪➤▶])\s*(.+)$/);
    if (!match) return null;
    var q = match[1].trim();
    if (q.length < 2 || q.length > 80) return null;
    if (/[。！!；;]+$/.test(q)) q = q.replace(/[。！!；;]+$/, "");
    if (!/[?？]/.test(q) && !/[\u4e00-\u9fa5]{2,}/.test(q)) return null;
    return q;
  }

  function isSeparatorLine(line) {
    if (!line) return false;
    var s = line.trim();
    if (!s) return false;
    if (/^[-—－]{2,}\s*相关问题/.test(s)) return true;
    if (/^[-—－]{2,}\s*你可能还?想问/.test(s)) return true;
    if (/^[-—－]{2,}\s*扩展问题/.test(s)) return true;
    if (/^[-—－]{2,}\s*拓展问题/.test(s)) return true;
    if (/^[-—－]{2,}\s*继续提问/.test(s)) return true;
    if (/^[-—－]{2,}\s*推荐问题/.test(s)) return true;
    if (/^[-—－]{2,}\s*follow[- ]?up/i.test(s)) return true;
    if (/^[-—－]{2,}\s*more\s+questions?/i.test(s)) return true;
    if (/^相关问题[:：]?$/.test(s)) return true;
    if (/^你可能还?想问[:：]?$/.test(s)) return true;
    if (/^(推荐|拓展|扩展)?问题[:：]$/.test(s)) return true;
    if (/^[>＞]\s*相关问题/.test(s)) return true;
    return false;
  }

  var rawLines = text.split("\n");
  var separatorIdx = -1;
  for (var i = rawLines.length - 1; i >= 0; i--) {
    if (isSeparatorLine(rawLines[i])) {
      separatorIdx = i;
      break;
    }
  }

  var questions = [];
  var bodyLines;

  if (separatorIdx !== -1) {
    bodyLines = rawLines.slice(0, separatorIdx);
    var targetCount = calcFollowUpCount(bodyLines.join("\n"));
    var tailLines = rawLines.slice(separatorIdx + 1);
    for (var j = 0; j < tailLines.length; j++) {
      var q = isQuestionLine(tailLines[j]);
      if (q) questions.push(q);
      if (questions.length >= targetCount) break;
    }
  } else {
    var looksLikeQuestion = function (s) {
      if (!s) return false;
      if (/[?？]/.test(s)) return true;
      if (/(什么|怎么|为什么|为何|如何|能不能|能否|是否|哪里|哪个|谁|是不是|有没有|呢|难道)/.test(s)) return true;
      return false;
    };
    var bodyTextNoTail = rawLines.join("\n");
    var targetCount2 = calcFollowUpCount(bodyTextNoTail);
    for (var k = rawLines.length - 1; k >= Math.max(0, rawLines.length - 10); k--) {
      var q2 = isQuestionLine(rawLines[k]);
      if (q2 && looksLikeQuestion(q2)) questions.unshift(q2);
      else if (questions.length > 0) break;
      if (questions.length >= targetCount2) break;
    }
    bodyLines = (questions.length > 0) ? rawLines.slice(0, rawLines.length - questions.length) : rawLines;
  }

  if (questions.length === 0) return emptyResult;

  while (bodyLines.length && /^\s*$/.test(bodyLines[bodyLines.length - 1])) bodyLines.pop();
  return { body: bodyLines.join("\n"), questions: questions };
}

/** 兜底方案：自动生成追问 */
export function generateFallbackQuestions(text, userQuestion) {
  if (!text) return [];
  var keywords = [];
  var targetCount = calcFollowUpCount(text);

  var STOP_WORDS = {
    "总结": 1, "结论": 1, "核心": 1, "优势": 1, "特点": 1, "技术特点": 1,
    "主要用途": 1, "重要里程碑": 1, "其他": 1, "其他相关": 1,
    "好的": 1, "没问题": 1, "可以": 1, "是的": 1, "对的": 1,
    "内容": 1, "部分": 1, "问题": 1, "方面": 1, "方式": 1,
    "如何": 1, "什么": 1, "为什么": 1, "哪个": 1, "哪里": 1, "谁": 1,
  };

  // 从标题提取
  var titleRegex = /^\s*(?:#{1,6})\s*([^\n]{2,40})/gm;
  var tm;
  while ((tm = titleRegex.exec(text)) !== null) {
    keywords.push(tm[1].trim());
  }

  // 从加粗词提取
  var boldRegex = /\*\*([^*\n]{2,30})\*\*/g;
  var bm;
  while ((bm = boldRegex.exec(text)) !== null) {
    keywords.push(bm[1].trim());
  }

  // 从用户问题提取
  if (userQuestion) {
    var cleaned = userQuestion
      .replace(/(是什么|是什么意思|怎么理解|为什么|如何|怎么|什么|哪里|哪个|谁|吗|呢|吧|啊|哦|？|\?)/g, " ")
      .replace(/[。，、；：,.!?？]/g, " ")
      .trim();
    if (cleaned.length >= 2 && cleaned.length <= 30) keywords.push(cleaned);
  }

  // 大写英文缩写
  var acronymRegex = /\b([A-Z]{2,8})\b/g;
  var am;
  while ((am = acronymRegex.exec(text)) !== null) {
    keywords.push(am[1]);
  }

  // 首段中文片段
  var firstPart = (text.split(/\n\n|\r\n\r\n/)[0] || text).substring(0, 200);
  var nounMatches = firstPart.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
  for (var n = 0; n < nounMatches.length; n++) {
    if (!STOP_WORDS[nounMatches[n]] && nounMatches[n].length >= 2 && nounMatches[n].length <= 8) {
      keywords.push(nounMatches[n]);
    }
  }

  // 去重 + 过滤
  var seen = {};
  var uniqueKeywords = [];
  for (var ki = 0; ki < keywords.length; ki++) {
    var kw = keywords[ki].replace(/[。，,、.：:()（）「」\[\]【】"'`#!！@\$%\^\*]/g, "").trim();
    kw = kw.replace(/^\d{1,2}[\s\.\、\)\．:：]+/, "").trim();
    if (!kw || kw.length < 2 || kw.length > 20) continue;
    if (STOP_WORDS[kw]) continue;
    if (seen[kw]) continue;
    seen[kw] = true;
    uniqueKeywords.push(kw);
  }

  // 生成模板化追问
  var templates = [
    function (kw) { return "什么是" + kw + "？"; },
    function (kw) { return kw + "有什么实际应用？"; },
    function (kw) { return "如何理解" + kw + "？"; },
    function (kw) { return kw + "的核心是什么？"; },
    function (kw) { return "关于" + kw + "能举个例子吗？"; },
  ];

  var result = [];
  var takeCount = Math.min(uniqueKeywords.length, targetCount);
  for (var i = 0; i < takeCount; i++) {
    result.push(templates[i % templates.length](uniqueKeywords[i]));
  }

  if (result.length === 0) {
    if (targetCount >= 2 && userQuestion && userQuestion.length < 40) {
      var qTopic = userQuestion.replace(/[？?，。,.！!；;]/g, "").trim();
      if (qTopic.length > 0 && qTopic.length <= 20) {
        result.push("关于" + qTopic + "，能举个例子吗？");
        result.push("还有其他相关的吗？");
      } else {
        result.push("能举个具体例子吗？");
        result.push("还有其他相关的吗？");
      }
    } else {
      result.push("能再详细讲讲吗？");
    }
  }

  return result.slice(0, targetCount);
}

// ================================================================
// Markdown 文本处理（供 TTS 使用）
// ================================================================

/** 去除 Markdown 格式，提取纯文本 */
export function stripMarkdown(text) {
  if (!text) return "";
  var t = text;

  t = t.replace(/```(\w*)\n?([\s\S]*?)```/g, "$2");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/\$\$[\s\S]+?\$\$/g, "公式");
  t = t.replace(/\$[^$]+\$/g, "公式");
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1");
  t = t.replace(/\*([^*]+)\*/g, "$1");
  t = t.replace(/_([^_]+)_/g, "$1");
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/^[-*]\s+/gm, "");
  t = t.replace(/^\d+\.\s+/gm, "");
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  t = t.replace(/!\[[^\]]*\]\([^)]+\)/g, "");
  t = t.replace(/^>\s*/gm, "");
  t = t.replace(/^[-*_]{3,}\s*$/gm, "");
  t = t.replace(/<[^>]+>/g, "");
  t = t.replace(/\*/g, "");
  t = t.replace(/[\u{1F300}-\u{1F9FF}]/gu, "");
  t = t.replace(/[\u{2600}-\u{26FF}]/gu, "");
  t = t.replace(/[\u{2700}-\u{27BF}]/gu, "");
  t = t.replace(/\n{3,}/g, "\n\n").trim();

  return t;
}

// ================================================================
// KaTeX 缩放
// ================================================================

/** 长公式自动缩小字体 */
export function autoScaleKatex(container) {
  if (!container) return;
  var blocks = container.querySelectorAll(".katex-block");
  if (!blocks.length) return;
  var MIN_SCALE = 0.56;
  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i];
    if (block._autoScaled) continue;
    var parentWidth = block.clientWidth || (block.parentElement && block.parentElement.clientWidth) || 300;
    var inner = block.querySelector(".katex-display") || block.querySelector(".katex");
    if (!inner) { block._autoScaled = true; continue; }

    block.style.fontSize = "";
    var naturalWidth = inner.scrollWidth;
    if (naturalWidth <= parentWidth + 2) {
      block._autoScaled = true;
      continue;
    }
    var scale = parentWidth / naturalWidth;
    if (scale < MIN_SCALE) scale = MIN_SCALE;
    block.style.fontSize = scale + "em";
    block._autoScaled = true;
  }
}

// ================================================================
// 其他工具
// ================================================================

/** 延迟函数 */
export function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}
