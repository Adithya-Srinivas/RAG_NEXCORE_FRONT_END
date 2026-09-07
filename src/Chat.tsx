import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: { source: string; score: number }[];
};

const DRAIN_INTERVAL_MS = 20; // how often we reveal one queued token to the UI

function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // Tokens arrive off the network in bursts (TCP doesn't preserve SSE message
  // boundaries), so we buffer them here and reveal them to the UI on a fixed
  // timer instead of rendering exactly when they arrive. That's what gives a
  // smooth per-token animation regardless of how bursty the actual delivery is.
  const tokenQueue = useRef<string[]>([]);
  const drainTimer = useRef<number | null>(null);
  const pendingSources = useRef<{ source: string; score: number }[] | null>(null);
  const streamDone = useRef(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  // Autoscroll to the bottom whenever messages change — including on every
  // token drained in, since each one calls setMessages and re-renders here.
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function appendToLastMessage(chunk: string) {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      updated[updated.length - 1] = { ...last, content: last.content + chunk };
      return updated;
    });
  }

  function finalizeLastMessage(sources: { source: string; score: number }[] | null) {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      updated[updated.length - 1] = { ...last, sources: sources ?? undefined };
      return updated;
    });
    setIsStreaming(false);
  }

  function stopDraining() {
    if (drainTimer.current !== null) {
      clearInterval(drainTimer.current);
      drainTimer.current = null;
    }
  }

  function startDraining() {
    if (drainTimer.current !== null) return;
    drainTimer.current = window.setInterval(() => {
      if (tokenQueue.current.length > 0) {
        const next = tokenQueue.current.shift()!;
        appendToLastMessage(next);
        return;
      }

      // Queue is empty. Only finish once the stream itself is done AND
      // every buffered token has been drained out — otherwise we'd cut
      // off the tail end of the response while it's still catching up.
      if (streamDone.current) {
        stopDraining();
        finalizeLastMessage(pendingSources.current);
        pendingSources.current = null;
        streamDone.current = false;
      }
    }, DRAIN_INTERVAL_MS);
  }

  async function sendMessage() {
    if (!input.trim() || isStreaming) return;

    const question = input;
    const history = messages.reduce<{ question: string; answer: string }[]>((acc, m, i) => {
      if (m.role === "assistant" && messages[i - 1]?.role === "user") {
        acc.push({ question: messages[i - 1].content, answer: m.content });
      }
      return acc;
    }, []);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "assistant", content: "" },
    ]);
    setInput("");
    setIsStreaming(true);
    tokenQueue.current = [];
    pendingSources.current = null;
    streamDone.current = false;

    const response = await fetch("http://localhost:8000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        if (!event.startsWith("data: ")) continue;
        const json = JSON.parse(event.slice(6));

        if (json.token) {
          tokenQueue.current.push(json.token);
          startDraining();
        }

        if (json.done) {
          pendingSources.current = json.sources ?? null;
          streamDone.current = true;
          startDraining(); // in case no tokens ever queued (e.g. empty answer)
        }
      }
    }
  }

  const suggestedPrompts = [
    "What are our Q4 priorities?",
    "Summarize the SOC 2 status",
    "Who leads the Sales org?",
  ];

  return (
    <div className="chat">
      <div className="messages" ref={messagesRef}>
        {messages.length === 0 && (
          <div className="empty-state">
            <p>Ask anything about NexCore AI — policies, financials, product, or people.</p>
            <div className="suggested-chips">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  className="suggested-chip"
                  onClick={() => setInput(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const isStreamingAssistant =
            isStreaming && msg.role === "assistant" && i === messages.length - 1;

          return (
            <div key={i} className={`message ${msg.role}`}>
              {msg.role === "assistant" ? (
                <>
                  <div className="assistant-header">
                    <svg
                      className="assistant-icon"
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                    >
                      <path
                        d="M8 1L9.3 6.2L14 8L9.3 9.8L8 15L6.7 9.8L2 8L6.7 6.2Z"
                        fill="currentColor"
                      />
                    </svg>
                    <span>NexCore Assistant</span>
                  </div>
                  <div className="assistant-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    {isStreamingAssistant && <span className="streaming-caret" />}
                  </div>
                </>
              ) : (
                <div className="bubble">{msg.content}</div>
              )}

              {msg.sources && (
                <div className="sources">
                  {msg.sources.map((s, idx) => (
                    <div className="source-chip" key={idx}>
                      <span className="source-index">{idx + 1}</span>
                      {s.source}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="input-dock">
        <div className="input-controls">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ask anything about NexCore AI…"
            disabled={isStreaming}
          />
          <button
            className="send-button"
            onClick={sendMessage}
            disabled={isStreaming || !input.trim()}
            aria-label="Send"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M4 14L14 4M14 4H6M14 4V12"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <div className="input-hint">Press Enter to send</div>
      </div>
    </div>
  );
}

export default Chat;