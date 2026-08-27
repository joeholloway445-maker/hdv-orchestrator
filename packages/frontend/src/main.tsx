import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { useAuthStore } from "./store/auth";
import "./index.css";

// Clear any expired JWT tokens before the app mounts
useAuthStore.getState().init();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
