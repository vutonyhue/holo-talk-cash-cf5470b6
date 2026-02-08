import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Global error handlers to catch unhandled errors
window.addEventListener('error', (event) => {
  console.error('[Global Error]', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Rejection]', event.reason);
});

createRoot(document.getElementById("root")!).render(<App />);
