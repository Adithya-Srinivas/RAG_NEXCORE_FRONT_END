import { useState } from "react";
import "./App.css";
import Chat from "./Chat";
import Dashboard from "./Dashboard";

type Tab = "chat" | "dashboard";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");

  return (
    <div className="app">
      <nav className="tabs">
        <button
          className={activeTab === "chat" ? "active" : ""}
          onClick={() => setActiveTab("chat")}
        >
          Chat
        </button>
        <button
          className={activeTab === "dashboard" ? "active" : ""}
          onClick={() => setActiveTab("dashboard")}
        >
          Eval Dashboard
        </button>
      </nav>

      <main>
        {activeTab === "chat" && <Chat />}
        {activeTab === "dashboard" && <Dashboard />}
      </main>
    </div>
  );
}

export default App;