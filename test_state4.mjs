import fs from 'fs';
const content = fs.readFileSync('./js/state.js', 'utf-8');
console.log("First 100 chars:", JSON.stringify(content.substring(0, 100)));
