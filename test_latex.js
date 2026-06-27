
// 测试 LaTeX 朗读
const latex = `\\text{煮豆持作羹，漉菽以为汁。} \\\\
\\text{萁在釜下燃，豆在釜中泣。} \\\\
\\text{本自同根生，相煎何太急？}`;

console.log('输入 LaTeX:', latex);
console.log('');

// 模拟 escaped 对象
const escaped = {
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

console.log('escaped["\\\\"]:', JSON.stringify(escaped['\\']));
console.log('');

// 简单测试
const testStr = '\\\\';
console.log('测试 "\\\\\\\\" (双反斜杠):');
console.log('escaped[testStr[1]]:', JSON.stringify(escaped[testStr[1]]));
