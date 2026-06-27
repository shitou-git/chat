console.log("Testing chat.js...");
try {
  await import('./js/chat.js');
  console.log("chat.js loaded successfully");
} catch (e) {
  console.error("Error:", e.message);
}
