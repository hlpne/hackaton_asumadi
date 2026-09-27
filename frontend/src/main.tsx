import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthGate } from "./components/auth/AuthGate";
import { applyTheme, initialTheme } from "./theme";
import "./styles.css";
import "./liquid-glass.css";
import "./auth.css";

// Apply the saved theme before the login screen renders, not only once App mounts.
applyTheme(initialTheme());

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><AuthGate><App /></AuthGate></React.StrictMode>);
