
/**
 * 工具函数模块
 * 包含 HTML 转义、LaTeX 处理、Markdown 渲染、文本处理等工具函数
 */
 
import { IDENTITY_REPLY } from './config.js?v=1.3.4';
 
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
          var speakable = latexToSpeakable(p.content);
          var ttsChars = 0;
          for (var ci = 0; ci < speakable.length; ci++) {
            var cc = speakable.charCodeAt(ci);
            if ((cc >= 0x4E00 && cc <= 0x9FFF) ||
                (cc >= 0x3400 && cc <= 0x4DBF) ||
                (cc >= 65 && cc <= 90) ||
                (cc >= 97 && cc <= 122) ||
                (cc >= 48 && cc <= 57) ||
                (cc >= 0xFF10 && cc <= 0xFF19) ||
                (cc >= 0xFF21 && cc <= 0xFF3A) ||
                (cc >= 0xFF41 && cc <= 0xFF5A)) {
              ttsChars++;
            }
          }
          var dataAttr = ' data-tts-chars="' + ttsChars + '"';
          if (typeof katex === "undefined") {
            result += '<code class="math-fallback"' + dataAttr + '>' + escapeHtml(p.content) + "</code>";
          } else {
            var html = katex.renderToString(p.content, {
              throwOnError: false,
              displayMode: p.type === "block",
              output: "html",
              strict: function (errorCode, errorContent, token) {
                if (errorCode === 'newLineInDisplayMode') return false;
                return errorContent;
              }
            });
            if (p.type === "block") {
              result += '<div class="katex-block"' + dataAttr + '>' + html + "</div>";
            } else {
              result += '<span class="katex-inline"' + dataAttr + '>' + html + "</span>";
            }
          }
        } catch (e) {
          result += '<code class="math-fallback"' + dataAttr + '>' + escapeHtml(p.content) + "</code>";
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

  // 第 5 轮：统一切分句子并包裹 tts-sentence（确保公式、代码块等都被包含在句子中）
  result = wrapTtsSentences(result);

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
 
/** 将纯文本按句子切分，返回句子数组
 *  统一使用固定结束符 。？！ 进行切分，与 wrapTtsSentences 保持一致 */
export function splitIntoSentences(text) {
  if (!text) return [];
  var sentenceEndings = ['。', '！', '？', '，', '：', '!', '?', ',', ':'];

  function isEnding(ch) {
    for (var j = 0; j < sentenceEndings.length; j++) {
      if (ch === sentenceEndings[j]) return true;
    }
    return false;
  }

  var sentences = [];
  var cur = '';
  var k = 0;
  while (k < text.length) {
    var ch = text[k];
    cur += ch;

    if (isEnding(ch)) {
      var next = text[k + 1] || '';
      if (next === '"' || next === '"' || next === "'" || next === "'" ||
          next === '）' || next === ')' || next === '」' || next === '』') {
        cur += next;
        k++;
      }
      sentences.push(cur);
      cur = '';
    }
    k++;
  }
  if (cur) sentences.push(cur);
  return sentences;
}

/** 将 HTML 字符串中的纯文本按句子切分，用 span.tts-sentence 包裹
 *  改进：跨 HTML 标签累积文本，只在结束符（。？！）处切分，
 *  避免列表项/换行等被独立分段，与 TTS 文本分段保持一致。
 *  使用"平衡标签"算法保证 span 不破坏 HTML 结构。 */
export function wrapTtsSentences(html) {
  if (!html) return '';

  var sentenceEndings = ['。', '！', '？', '，', '：', '!', '?', ',', ':'];
  var endingsSet = {};
  for (var e = 0; e < sentenceEndings.length; e++) endingsSet[sentenceEndings[e]] = true;

  var VOID_TAGS = { br:1, img:1, hr:1, input:1, meta:1, link:1, area:1, base:1, col:1, embed:1, source:1, track:1, wbr:1 };
  var BLOCK_TAGS = { p:1, div:1, h1:1, h2:1, h3:1, h4:1, h5:1, h6:1, ul:1, ol:1, li:1, table:1, thead:1, tbody:1, tr:1, th:1, td:1, pre:1, blockquote:1, section:1, article:1, header:1, footer:1, main:1, nav:1, aside:1, figure:1, figcaption:1, details:1, summary:1 };

  function getTagName(tag) {
    var m = tag.match(/^<\/?(\w+)/);
    return m ? m[1].toLowerCase() : '';
  }

  function hasVisibleText(seg) {
    for (var j = 0; j < seg.length; j++) {
      if (seg[j] === '<') {
        var end = seg.indexOf('>', j);
        if (end === -1) break;
        j = end;
      } else if (!/\s/.test(seg[j])) {
        return true;
      }
    }
    return false;
  }

  var result = '';
  var i = 0;
  var len = html.length;
  var sentenceStart = null;
  var sentenceIdx = 0;
  var preClosed = [];

  function flush(endPos) {
    if (sentenceStart === null || endPos <= sentenceStart) return;
    var seg = html.substring(sentenceStart, endPos);
    if (!hasVisibleText(seg)) {
      result += seg;
      sentenceStart = endPos;
      if (sentenceStart >= len) sentenceStart = null;
      return;
    }

    var openStack = [];
    var unmatchedCloses = [];
    var j = 0;
    while (j < seg.length) {
      if (seg[j] === '<') {
        var tagEnd = seg.indexOf('>', j);
        if (tagEnd === -1) break;
        var tagStr = seg.substring(j, tagEnd + 1);
        var tName = getTagName(tagStr);
        var isEnd = tagStr[1] === '/';
        var isSelf = tagStr[tagStr.length - 2] === '/' || VOID_TAGS[tName];
        if (isEnd) {
          var found = -1;
          for (var k = openStack.length - 1; k >= 0; k--) {
            if (openStack[k] === tName) { found = k; break; }
          }
          if (found >= 0) {
            openStack.splice(found);
          } else {
            unmatchedCloses.push(tName);
          }
        } else if (!isSelf) {
          openStack.push(tName);
        }
        j = tagEnd + 1;
      } else {
        j++;
      }
    }

    var prefix = '';
    for (var k = 0; k < unmatchedCloses.length; k++) {
      prefix += '<' + unmatchedCloses[k] + '>';
    }
    var suffix = '';
    for (var k = openStack.length - 1; k >= 0; k--) {
      suffix += '</' + openStack[k] + '>';
      preClosed.push(openStack[k]);
    }

    result += '<span class="tts-sentence" data-tts-idx="' + sentenceIdx + '">' + prefix + seg + suffix + '</span>';
    sentenceIdx++;
    sentenceStart = endPos;
    if (sentenceStart >= len) sentenceStart = null;
  }

  while (i < len) {
    if (html[i] === '<') {
      var endIdx = html.indexOf('>', i);
      if (endIdx === -1) { i = len; break; }
      var tag = html.substring(i, endIdx + 1);
      var tagName = getTagName(tag);
      var isEndTag = tag[1] === '/';
      var isBlock = BLOCK_TAGS[tagName];

      if (isEndTag) {
        var preIdx = -1;
        for (var k = preClosed.length - 1; k >= 0; k--) {
          if (preClosed[k] === tagName) { preIdx = k; break; }
        }
        if (preIdx >= 0) {
          preClosed.splice(preIdx, 1);
          i = endIdx + 1;
          continue;
        }
      }

      if (sentenceStart === null) {
        sentenceStart = i;
      }
      i = endIdx + 1;
    } else {
      if (sentenceStart === null) {
        sentenceStart = i;
      }
      var ch = html[i];
      if (endingsSet[ch]) {
        var endPos = i + 1;
        var nextCh = html[endPos];
        if (nextCh && nextCh !== '<' &&
            (nextCh === '"' || nextCh === '"' || nextCh === "'" || nextCh === "'" ||
             nextCh === '）' || nextCh === ')' || nextCh === '」' || nextCh === '』')) {
          endPos++;
        }
        flush(endPos);
        i = endPos;
      } else {
        i++;
      }
    }
  }

  if (sentenceStart !== null) {
    flush(len);
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
// LaTeX 公式转中文朗读文本
// ================================================================

var _latexCmdMap = null;

function getLatexCmdMap() {
  if (_latexCmdMap) return _latexCmdMap;
  _latexCmdMap = {
    'alpha': '阿尔法',
    'beta': '贝塔',
    'gamma': '伽马',
    'delta': '德尔塔',
    'epsilon': '艾普西龙',
    'varepsilon': '艾普西龙',
    'zeta': '泽塔',
    'eta': '伊塔',
    'theta': '西塔',
    'vartheta': '西塔',
    'iota': '约塔',
    'kappa': '卡帕',
    'lambda': '兰姆达',
    'mu': '缪',
    'nu': '纽',
    'xi': '克西',
    'omicron': '奥米克戎',
    'pi': '派',
    'varpi': '派',
    'rho': '柔',
    'varrho': '柔',
    'sigma': '西格马',
    'varsigma': '西格马',
    'tau': '陶',
    'upsilon': '宇普西龙',
    'phi': '斐',
    'varphi': '斐',
    'chi': '卡伊',
    'psi': '普西',
    'omega': '欧米伽',
    'Gamma': '大写伽马',
    'Delta': '大写德尔塔',
    'Theta': '大写西塔',
    'Lambda': '大写兰姆达',
    'Xi': '大写克西',
    'Pi': '大写派',
    'Sigma': '大写西格马',
    'Upsilon': '大写宇普西龙',
    'Phi': '大写斐',
    'Psi': '大写普西',
    'Omega': '大写欧米伽',
    'times': '乘以',
    'div': '除以',
    'pm': '正负',
    'mp': '负正',
    'cdot': '乘以',
    'circ': '度',
    'leq': '小于等于',
    'le': '小于等于',
    'geq': '大于等于',
    'ge': '大于等于',
    'neq': '不等于',
    'ne': '不等于',
    'approx': '约等于',
    'equiv': '恒等于',
    'sim': '相似于',
    'propto': '正比于',
    'infty': '无穷大',
    'sum': '求和',
    'prod': '求积',
    'int': '积分',
    'iint': '二重积分',
    'iiint': '三重积分',
    'oint': '曲线积分',
    'partial': '偏',
    'nabla': '倒三角',
    'rightarrow': '右箭头',
    'to': '箭头',
    'leftarrow': '左箭头',
    'leftrightarrow': '双向箭头',
    'Rightarrow': '右箭头',
    'Leftarrow': '左箭头',
    'Leftrightarrow': '双向箭头',
    'uparrow': '上箭头',
    'downarrow': '下箭头',
    'in': '属于',
    'notin': '不属于',
    'subset': '包含于',
    'supset': '包含',
    'subseteq': '包含于',
    'supseteq': '包含',
    'cup': '并集',
    'cap': '交集',
    'emptyset': '空集',
    'forall': '对任意',
    'exists': '存在',
    'therefore': '所以',
    'because': '因为',
    'angle': '角',
    'perp': '垂直于',
    'parallel': '平行于',
    'triangle': '三角形',
    'square': '正方形',
    'circ': '圆',
    'log': '对数',
    'ln': '自然对数',
    'sin': '正弦',
    'cos': '余弦',
    'tan': '正切',
    'cot': '余切',
    'sec': '正割',
    'csc': '余割',
    'arcsin': '反正弦',
    'arccos': '反余弦',
    'arctan': '反正切',
    'sinh': '双曲正弦',
    'cosh': '双曲余弦',
    'tanh': '双曲正切',
    'exp': '指数',
    'sqrt': '根号',
    'frac': '分数',
    'text': '',
    'mathrm': '',
    'mathbf': '',
    'mathcal': '',
    'mathit': '',
    'mathbb': '',
    'underline': '下划线',
    'overline': '上划线',
    'hat': '帽子',
    'tilde': '波浪',
    'dot': '点',
    'ddot': '两点',
    'vec': '向量',
    'bar': '横线',
    'breve': '短音符号',
    'check': '抑扬符',
    'acute': '重音',
    'grave': '抑音',
  };
  return _latexCmdMap;
}

function readLatexGroup(s, startIdx) {
  if (s.charAt(startIdx) !== '{') {
    return { content: s.charAt(startIdx), end: startIdx + 1 };
  }
  var depth = 1;
  var content = '';
  var i = startIdx + 1;
  while (i < s.length && depth > 0) {
    var ch = s.charAt(i);
    if (ch === '\\' && i + 1 < s.length) {
      content += ch + s.charAt(i + 1);
      i += 2;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth > 0) content += ch;
    i++;
  }
  return { content: content, end: i };
}

function latexToSpeakableSingle(latex) {
  var s = latex.trim();
  if (!s) return '';

  var cmdMap = getLatexCmdMap();
  var result = '';
  var i = 0;

  while (i < s.length) {
    var ch = s.charAt(i);

    if (ch === '\\') {
      i++;
      if (i >= s.length) break;
      var nextCh = s.charAt(i);

      if (/[a-zA-Z]/.test(nextCh)) {
        var cmdName = '';
        while (i < s.length && /[a-zA-Z*]/.test(s.charAt(i))) {
          cmdName += s.charAt(i);
          i++;
        }

        var baseCmd = cmdName.replace(/\*$/, '');

        if (cmdMap.hasOwnProperty(baseCmd)) {
          var spoken = cmdMap[baseCmd];

          if (baseCmd === 'sqrt') {
            var optArg = null;
            if (i < s.length && s.charAt(i) === '[') {
              var optEnd = s.indexOf(']', i);
              if (optEnd !== -1) {
                optArg = s.substring(i + 1, optEnd);
                i = optEnd + 1;
              }
            }
            if (i < s.length && s.charAt(i) === '{') {
              var grp = readLatexGroup(s, i);
              i = grp.end;
              var inner = latexToSpeakableSingle(grp.content);
              if (optArg) {
                result += optArg + '次根号下' + inner;
              } else {
                result += '根号下' + inner;
              }
            } else {
              result += spoken;
            }
          } else if (baseCmd === 'frac') {
            if (i < s.length && s.charAt(i) === '{') {
              var numGrp = readLatexGroup(s, i);
              i = numGrp.end;
              var num = latexToSpeakableSingle(numGrp.content);
              if (i < s.length && s.charAt(i) === '{') {
                var denGrp = readLatexGroup(s, i);
                i = denGrp.end;
                var den = latexToSpeakableSingle(denGrp.content);
                result += den + '分之' + num;
              } else {
                result += '分数' + num;
              }
            } else {
              result += spoken;
            }
          } else if (baseCmd === 'text' || baseCmd === 'mathrm' || baseCmd === 'mathbf' ||
                     baseCmd === 'mathcal' || baseCmd === 'mathit' || baseCmd === 'mathbb') {
            if (i < s.length && s.charAt(i) === '{') {
              var txtGrp = readLatexGroup(s, i);
              i = txtGrp.end;
              result += txtGrp.content;
            }
          } else if (baseCmd === 'sum' || baseCmd === 'prod' || baseCmd === 'int' ||
                     baseCmd === 'iint' || baseCmd === 'iiint') {
            result += spoken;
            if (i < s.length && s.charAt(i) === '_') {
              i++;
              if (i < s.length) {
                var subGrp = readLatexGroup(s, i);
                i = subGrp.end;
                var subText = latexToSpeakableSingle(subGrp.content);
                result += '从' + subText;
                if (i < s.length && s.charAt(i) === '^') {
                  i++;
                  var supGrp = readLatexGroup(s, i);
                  i = supGrp.end;
                  var supText = latexToSpeakableSingle(supGrp.content);
                  result += '到' + supText;
                }
              }
            } else if (i < s.length && s.charAt(i) === '^') {
              i++;
              var supGrp2 = readLatexGroup(s, i);
              i = supGrp2.end;
              result += '到' + latexToSpeakableSingle(supGrp2.content);
            }
          } else if (baseCmd === 'log' || baseCmd === 'ln' || baseCmd === 'sin' ||
                     baseCmd === 'cos' || baseCmd === 'tan' || baseCmd === 'cot' ||
                     baseCmd === 'sec' || baseCmd === 'csc' || baseCmd === 'arcsin' ||
                     baseCmd === 'arccos' || baseCmd === 'arctan' || baseCmd === 'sinh' ||
                     baseCmd === 'cosh' || baseCmd === 'tanh' || baseCmd === 'exp') {
            result += spoken;
            if (i < s.length && s.charAt(i) === '^') {
              i++;
              var powGrp = readLatexGroup(s, i);
              i = powGrp.end;
              result += '的' + latexToSpeakableSingle(powGrp.content) + '次方';
            }
          } else if (baseCmd === 'overline' || baseCmd === 'underline' ||
                     baseCmd === 'hat' || baseCmd === 'tilde' || baseCmd === 'dot' ||
                     baseCmd === 'ddot' || baseCmd === 'vec' || baseCmd === 'bar') {
            if (i < s.length && s.charAt(i) === '{') {
              var decGrp = readLatexGroup(s, i);
              i = decGrp.end;
              result += latexToSpeakableSingle(decGrp.content) + spoken;
            } else {
              result += spoken;
            }
          } else {
            result += spoken;
          }
        } else {
          result += cmdName;
        }

        while (i < s.length && (s.charAt(i) === ' ' || s.charAt(i) === '\t')) {
          i++;
        }
      } else {
        // 反斜杠是LaTeX命令前缀，不朗读，只跳过
        // 对于特殊符号，只读符号本身，不加描述词
        var escaped = {
          '{': '左括号',
          '}': '右括号',
          '$': '美元',
          '%': '百分之',
          '&': '和',
          '#': '井号',
          '_': '',
          '^': '',
          '\\': '',
          '~': '',
          ' ': ' ',
          '-': '负',
          '+': '正',
        };
        var mappedVal = escaped[nextCh];
        result += mappedVal !== undefined ? mappedVal : nextCh;
        i++;
      }
    } else if (ch === '^') {
      i++;
      if (i < s.length) {
        var supGroup = readLatexGroup(s, i);
        i = supGroup.end;
        var supContent = latexToSpeakableSingle(supGroup.content);
        if (/^[0-9]+$/.test(supContent) && parseInt(supContent) <= 10) {
          var powMap = { '1': '一次方', '2': '平方', '3': '立方', '4': '四次方',
                         '5': '五次方', '6': '六次方', '7': '七次方', '8': '八次方',
                         '9': '九次方', '10': '十次方' };
          result += powMap[supContent] || (supContent + '次方');
        } else if (supContent === '-1') {
          result += '的负一次方';
        } else {
          result += '的' + supContent + '次方';
        }
      }
    } else if (ch === '_') {
      i++;
      if (i < s.length) {
        var subGroup = readLatexGroup(s, i);
        i = subGroup.end;
        var subContent = latexToSpeakableSingle(subGroup.content);
        result += '下标' + subContent;
      }
    } else if (ch === '{') {
      var grpResult = readLatexGroup(s, i);
      i = grpResult.end;
      result += latexToSpeakableSingle(grpResult.content);
    } else if (ch === '(' || ch === '[' || ch === '|') {
      result += ch;
      i++;
    } else if (ch === ')' || ch === ']' || ch === '|') {
      result += ch;
      i++;
    } else if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      if (result.length > 0 && !/\s$/.test(result)) {
        result += ' ';
      }
      i++;
    } else if (/[0-9a-zA-Z\u4e00-\u9fa5]/.test(ch)) {
      result += ch;
      i++;
    } else if (ch === '+' || ch === '-' || ch === '=' || ch === ',' || ch === ';' || ch === ':') {
      var opMap = { '+': '加', '-': '减', '=': '等于', ',': '逗号', ';': '分号', ':': '冒号' };
      result += opMap[ch] || ch;
      i++;
    } else if (ch === '/') {
      result += '除以';
      i++;
    } else if (ch === '<') {
      if (i + 1 < s.length && s.charAt(i + 1) === '=') {
        result += '小于等于';
        i += 2;
      } else {
        result += '小于';
        i++;
      }
    } else if (ch === '>') {
      if (i + 1 < s.length && s.charAt(i + 1) === '=') {
        result += '大于等于';
        i += 2;
      } else {
        result += '大于';
        i++;
      }
    } else {
      result += ch;
      i++;
    }
  }

  return result;
}

export function latexToSpeakable(latex) {
  if (!latex) return '公式';
  try {
    var result = latexToSpeakableSingle(latex);
    if (!result || result.trim().length === 0) return '公式';
    return result.trim().replace(/\s+/g, ' ');
  } catch (e) {
    return '公式';
  }
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

  t = t.replace(/\$\$([\s\S]+?)\$\$/g, function (m, content) {
    return '，' + latexToSpeakable(content) + '，';
  });
  t = t.replace(/\$([^$]+?)\$/g, function (m, content) {
    return latexToSpeakable(content);
  });

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
