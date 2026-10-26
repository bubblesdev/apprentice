import { cssVariables } from "@apprentice/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles/global.css";

// Design tokens from @apprentice/ui become CSS custom properties, so web and native share one source.
for (const [name, value] of Object.entries(cssVariables()))
  document.documentElement.style.setProperty(name, value);

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
