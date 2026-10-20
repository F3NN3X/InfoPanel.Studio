import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./help.css";
import { isTauri } from "@/lib/desktop";
import { suppressNativeMenu } from "@/lib/native-menu";
import { HelpApp } from "./app";
import { EnvProvider, pageEnv } from "./env";

// Only the app's own right-click menus: the webview's (Back, Reload, Inspect...) stays off outside text fields.
if (isTauri()) suppressNativeMenu();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <EnvProvider value={pageEnv()}>
      <HelpApp />
    </EnvProvider>
  </React.StrictMode>
);
