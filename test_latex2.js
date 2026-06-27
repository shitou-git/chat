// 完整的 LaTeX 朗读测试
function getLatexCmdMap() {
  const _latexCmdMap = {
    'alpha': '阿尔法',
    'beta': '贝塔',
    'gamma': '伽马',
    'delta': '德尔塔',
    // ... 省略其他希腊字母
    'text': '',  // 重要：这个是空的
    'mathrm': '',
    'mathbf': '',
    // ... 省略其他
    '\\\\': '',  // 反斜杠映射
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
  const s = latex.trim();
  if (!s) return '';

  const cmdMap = getLatexCmdMap();
  var result = '';
  var i = 0;

  const escaped = {
    '{': '左括号',
    '}': '右括号',
    '$': '美元',
    '%': '百分之',
    '&': '和',
    '#': '井号',
    '_': '',
    '^': '',
    '\\': '',  // 关键：反斜杠映射到空字符串
    '~': '',
    ' ': ' ',
    '-': '负',
    '+': '正',
  };

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

          if (baseCmd === 'text' || baseCmd === 'mathrm' || baseCmd === 'mathbf') {
            if (i < s.length && s.charAt(i) === '{') {
              var txtGrp = readLatexGroup(s, i);
              i = txtGrp.end;
              console.log(`  [\\text] 花括号内容: "${txtGrp.content}"`);
              result += latexToSpeakableSingle(txtGrp.content);  // 递归处理
            }
          } else {
            result += spoken;
          }
        } else {
          result += cmdName;
        }
      } else {
        // 特殊字符处理
        const mapped = escaped[nextCh];
        console.log(`  [特殊字符] \\${nextCh} -> "${mapped}"`);
        result += mapped !== undefined ? mapped : nextCh;
        i++;
      }
    } else {
      result += ch;
      i++;
    }
  }

  return result;
}

// 测试用户提供的公式
const test1 = '\\\\text{煮豆持作羹，漉菽以为汁。}';
const test2 = '\\\\text{煮豆持作羹，漉菽以为汁。} \\\\';
const test3 = '\\\\text{煮豆持作羹，漉菽以为汁。} \\\\\\\\';

console.log('测试1 (无换行符):');
console.log('输入:', test1);
console.log('输出:', latexToSpeakableSingle(test1));
console.log('');

console.log('测试2 (单反斜杠换行符):');
console.log('输入:', test2);
console.log('输出:', latexToSpeakableSingle(test2));
console.log('');

console.log('测试3 (双反斜杠换行符):');
console.log('输入:', test3);
console.log('输出:', latexToSpeakableSingle(test3));
