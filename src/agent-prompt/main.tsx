import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./prompt.css";
import "../settings/ui/agent-prompt.css";
import { suppressNativeMenu } from "@/lib/native-menu";
import AgentPrompt from "./prompt";
import { answerRequest, useAgentRequests } from "./requests";

// The agent prompt window (app/agent-prompt.html, src-tauri/src/agent_prompt.rs): the oldest waiting request, answered here.

suppressNativeMenu();

function PromptWindow() {
  const requests = useAgentRequests();
  return <AgentPrompt requests={requests} answer={answerRequest} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PromptWindow />
  </React.StrictMode>
);
