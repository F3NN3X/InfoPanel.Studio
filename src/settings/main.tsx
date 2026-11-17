import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./settings.css";
import "./ui/settings.css";
import "../select-scrollbar.css";
import { suppressNativeMenu } from "@/lib/native-menu";
import { installSelectFace } from "@/select-face";
import { SettingsApp } from "./app";

// Only the app's own right-click menus: the webview's (Back, Reload, Inspect...) stays off outside text fields.
suppressNativeMenu();
installSelectFace();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SettingsApp />
  </React.StrictMode>
);
