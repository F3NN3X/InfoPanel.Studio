import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./overlay.css";
import { suppressNativeMenu } from "@/lib/native-menu";
import { Overlay } from "./overlay";

suppressNativeMenu();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Overlay />
  </React.StrictMode>
);
