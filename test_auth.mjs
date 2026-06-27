console.log("Testing auth.js...");
try {
  await import('./js/auth.js');
  console.log("auth.js loaded successfully");
} catch (e) {
  console.error("Error:", e.message);
}
