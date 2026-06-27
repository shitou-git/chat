const fs = require('fs');
const content = fs.readFileSync('./js/state.js', 'utf-8');
console.log("File length:", content.length);
try {
  new Function(content);
  console.log("Function() parse OK");
} catch (e) {
  console.log("Function() parse error:", e.message);
}
