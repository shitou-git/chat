console.log("Testing state.js...");
try {
  await import('./js/state.js');
  console.log("state.js loaded successfully");
} catch (e) {
  console.error("Error:", e.message);
  console.error(e.stack.split('\n').slice(0, 5).join('\n'));
}
