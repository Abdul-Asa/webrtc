import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CallProvider } from "./contexts/call-context";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CallProvider>
      <App />
    </CallProvider>
  </StrictMode>,
);
