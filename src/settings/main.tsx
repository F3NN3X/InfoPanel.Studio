import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./settings.css";
import { suppressNativeMenu } from "@/lib/native-menu";
import { SettingsApp } from "./app";

// Only the app's own right-click menus: the webview's (Back, Reload, Inspect...) stays off outside text fields.
suppressNativeMenu();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SettingsApp />
  </React.StrictMode>
);
