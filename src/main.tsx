import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CallProvider } from "./contexts/call-context";
import App from "./App";
import { BackgroundRippleEffect } from "./components/ui/background-ripple-effect";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CallProvider>
      <div className="relative min-h-screen w-full">
        <BackgroundRippleEffect />
        <div className="relative z-10 pointer-events-none">
          <App />
        </div>
      </div>
    </CallProvider>
  </StrictMode>,
);
