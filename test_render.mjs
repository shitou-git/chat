console.log("Testing render.js...");
try {
  await import('./js/render.js');
  console.log("render.js loaded successfully");
} catch (e) {
  console.error("Error:", e.message);
  console.error(e.stack.split('\n').slice(0, 5).join('\n'));
}
