import { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_KEY = "care-compass-chat";
const SESSION_KEY = "care-compass-session";

function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

const SCHEME_BUTTONS = [
  { label: "Home Caregiving Grant", emoji: "🏠" },
  { label: "Long Term Care Subsidy", emoji: "🏥" },
  { label: "Caregiver Training Grant", emoji: "📚" },
  { label: "Tax Relief", emoji: "💰" },
];

function formatMessage(text) {
  return text
    .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

export default function CareCompass() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load saved conversation on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.length > 0) {
          setMessages(parsed);
          setHasStarted(true);
        }
      }
    } catch (e) {
      // No saved conversation or parse error
    }
    setIsRestoring(false);
  }, []);

  // Save conversation whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || isLoading) return;

    setHasStarted(true);
    const userMsg = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    let assistantText = "";
    let streamStarted = false;

    try {
      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: getSessionId(),
          messages: apiMessages,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "delta") {
              assistantText += data.text;
              if (!streamStarted) {
                streamStarted = true;
                setIsLoading(false);
                setMessages(prev => [...prev, { role: "assistant", content: assistantText }]);
              } else {
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: assistantText };
                  return updated;
                });
              }
            }
          } catch (e) {
            // skip unparseable lines
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sorry, I'm having trouble connecting right now. Please try again in a moment, or call AIC at 1800-650-6060 for immediate help.",
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading]);

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleSchemeClick = (label) => {
    sendMessage(label);
  };

  const handleNewChat = () => {
    setMessages([]);
    setHasStarted(false);
    setInput("");
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_KEY);
  };

  if (isRestoring) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.loadingText}>Care Compass</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div>
            <div style={styles.headerTitle}>Care Compass</div>
            <div style={styles.headerSub}>Caregivers' guide to support</div>
          </div>
        </div>
        {hasStarted && (
          <button onClick={handleNewChat} style={styles.newChatBtn}>
            New chat
          </button>
        )}
      </div>

      {/* Messages area */}
      <div style={styles.messagesArea}>
        {!hasStarted ? (
          <div style={styles.welcome}>
            <h1 style={styles.welcomeTitle}>Tell me about your caregiving situation and I'll help find the right support for you.</h1>
            <p style={styles.welcomeIntro}>Hi, I'm Care Compass, your guide to financial support for caregivers.</p>

            {/* Primary input area in welcome */}
            <form onSubmit={handleSubmit} style={styles.welcomeInputForm}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="E.g. My mother needs help at home..."
                style={styles.welcomeTextInput}
                disabled={isLoading}
                autoFocus
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                style={{
                  ...styles.sendBtn,
                  opacity: !input.trim() || isLoading ? 0.4 : 1,
                }}
              >
                ➤
              </button>
            </form>

            <div style={styles.schemeDivider}>
              <span style={styles.schemeDividerLine}></span>
              <span style={styles.schemeDividerText}>or explore a scheme</span>
              <span style={styles.schemeDividerLine}></span>
            </div>

            <div style={styles.schemeButtons}>
              {SCHEME_BUTTONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => handleSchemeClick(s.label)}
                  style={styles.schemeBtn}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#E8F0E8';
                    e.currentTarget.style.borderColor = '#4A7C59';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#F5F9F5';
                    e.currentTarget.style.borderColor = '#C8DCC8';
                  }}
                >
                  <span style={styles.schemeBtnEmoji}>{s.emoji}</span>
                  <span style={styles.schemeBtnLabel}>{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={styles.messagesList}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  ...styles.messageBubbleWrap,
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                {msg.role === "assistant" && (
                  <div style={styles.avatarSmall}>C</div>
                )}
                <div
                  style={
                    msg.role === "user"
                      ? styles.userBubble
                      : styles.assistantBubble
                  }
                  dangerouslySetInnerHTML={{
                    __html: msg.role === "assistant"
                      ? formatMessage(msg.content)
                      : msg.content.replace(/\n/g, '<br/>')
                  }}
                />
              </div>
            ))}
            {isLoading && (
              <div style={styles.messageBubbleWrap}>
                <div style={styles.avatarSmall}>C</div>
                <div style={styles.assistantBubble}>
                  <div style={styles.typing}>
                    <span style={styles.dot1}></span>
                    <span style={styles.dot2}></span>
                    <span style={styles.dot3}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area - only during conversation */}
      {hasStarted && (
      <div style={styles.inputArea}>
        <form onSubmit={handleSubmit} style={styles.inputForm}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            style={styles.textInput}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            style={{
              ...styles.sendBtn,
              opacity: !input.trim() || isLoading ? 0.4 : 1,
            }}
          >
            ➤
          </button>
        </form>
        <div style={styles.disclaimer}>
          Care Compass provides guidance only — not formal eligibility decisions.
        </div>
      </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=DM+Sans:wght@400;500;600&display=swap');

        @keyframes dotPulse {
          0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1); }
        }

        input::placeholder {
          color: #999;
        }

        button:active {
          transform: scale(0.97);
        }
      `}</style>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100%",
    background: "#FAFAF7",
    fontFamily: "'DM Sans', sans-serif",
    color: "#2D2D2D",
    overflow: "hidden",
  },
  loadingScreen: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    background: "#FAFAF7",
    fontFamily: "'DM Sans', sans-serif",
  },
  loadingText: {
    fontSize: "20px",
    fontWeight: 600,
    color: "#3D6B4F",
    fontFamily: "'Source Serif 4', serif",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 20px",
    background: "#3D6B4F",
    color: "white",
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  headerLogo: {
    fontSize: "28px",
  },
  headerTitle: {
    fontSize: "17px",
    fontWeight: 600,
    fontFamily: "'Source Serif 4', serif",
    lineHeight: 1.2,
  },
  headerSub: {
    fontSize: "12px",
    opacity: 0.8,
    lineHeight: 1.2,
  },
  newChatBtn: {
    background: "rgba(255,255,255,0.15)",
    border: "1px solid rgba(255,255,255,0.3)",
    color: "white",
    padding: "6px 14px",
    borderRadius: "20px",
    fontSize: "13px",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    transition: "background 0.2s",
  },
  messagesArea: {
    flex: 1,
    overflowY: "auto",
    padding: "20px",
  },
  welcome: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "32px 20px 20px",
    maxWidth: "480px",
    margin: "0 auto",
    minHeight: "100%",
  },
  welcomeTitle: {
    fontSize: "30px",
    fontWeight: 700,
    fontFamily: "'DM Sans', sans-serif",
    color: "#2D2D2D",
    margin: "0 0 14px",
    lineHeight: 1.3,
    maxWidth: "520px",
  },
  welcomeIntro: {
    fontSize: "15px",
    color: "#888",
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 400,
    margin: "0 0 28px",
    lineHeight: 1.5,
  },
  welcomeInputForm: {
    display: "flex",
    gap: "8px",
    width: "100%",
    maxWidth: "420px",
  },
  welcomeTextInput: {
    flex: 1,
    padding: "14px 18px",
    border: "2px solid #3D6B4F",
    borderRadius: "24px",
    fontSize: "15px",
    fontFamily: "'DM Sans', sans-serif",
    outline: "none",
    background: "white",
    color: "#2D2D2D",
    transition: "border-color 0.2s",
  },
  schemeDivider: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    maxWidth: "420px",
    margin: "24px 0 16px",
  },
  schemeDividerLine: {
    flex: 1,
    height: "1px",
    background: "#DDD",
  },
  schemeDividerText: {
    fontSize: "12px",
    color: "#AAA",
    whiteSpace: "nowrap",
  },
  schemeButtons: {
    display: "flex",
    gap: "8px",
    width: "100%",
    maxWidth: "420px",
    flexWrap: "wrap",
  },
  schemeBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 14px",
    background: "#F5F9F5",
    border: "1px solid #C8DCC8",
    borderRadius: "20px",
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.2s",
    fontFamily: "'DM Sans', sans-serif",
    flex: "1 1 auto",
    justifyContent: "center",
  },
  schemeBtnEmoji: {
    fontSize: "15px",
    flexShrink: 0,
  },
  schemeBtnLabel: {
    fontSize: "13px",
    fontWeight: 500,
    color: "#2D3D2D",
  },
  messagesList: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    maxWidth: "680px",
    margin: "0 auto",
    width: "100%",
  },
  messageBubbleWrap: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
  },
  avatarSmall: {
    width: "30px",
    height: "30px",
    borderRadius: "50%",
    background: "#3D6B4F",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
    fontWeight: 600,
    color: "white",
    flexShrink: 0,
    marginTop: "2px",
    fontFamily: "'Source Serif 4', serif",
  },
  userBubble: {
    background: "#3D6B4F",
    color: "white",
    padding: "12px 16px",
    borderRadius: "18px 18px 4px 18px",
    maxWidth: "75%",
    fontSize: "14.5px",
    lineHeight: 1.6,
  },
  assistantBubble: {
    background: "white",
    color: "#2D2D2D",
    padding: "12px 16px",
    borderRadius: "18px 18px 18px 4px",
    maxWidth: "75%",
    fontSize: "14.5px",
    lineHeight: 1.7,
    fontFamily: "'Source Serif 4', serif",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    border: "1px solid #EEEEE8",
  },
  typing: {
    display: "flex",
    gap: "5px",
    padding: "4px 0",
  },
  dot1: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background: "#3D6B4F",
    display: "inline-block",
    animation: "dotPulse 1.2s infinite",
    animationDelay: "0s",
  },
  dot2: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background: "#3D6B4F",
    display: "inline-block",
    animation: "dotPulse 1.2s infinite",
    animationDelay: "0.2s",
  },
  dot3: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background: "#3D6B4F",
    display: "inline-block",
    animation: "dotPulse 1.2s infinite",
    animationDelay: "0.4s",
  },
  inputArea: {
    padding: "12px 20px 16px",
    background: "#FAFAF7",
    borderTop: "1px solid #E8E8E0",
    flexShrink: 0,
  },
  inputForm: {
    display: "flex",
    gap: "8px",
    maxWidth: "680px",
    margin: "0 auto",
  },
  textInput: {
    flex: 1,
    padding: "12px 16px",
    border: "1.5px solid #D8D8D0",
    borderRadius: "24px",
    fontSize: "15px",
    fontFamily: "'DM Sans', sans-serif",
    outline: "none",
    background: "white",
    color: "#2D2D2D",
    transition: "border-color 0.2s",
  },
  sendBtn: {
    width: "44px",
    height: "44px",
    borderRadius: "50%",
    border: "none",
    background: "#3D6B4F",
    color: "white",
    fontSize: "18px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "opacity 0.2s",
    fontFamily: "'DM Sans', sans-serif",
  },
  disclaimer: {
    fontSize: "11px",
    color: "#AAA",
    textAlign: "center",
    marginTop: "8px",
    maxWidth: "680px",
    margin: "8px auto 0",
  },
};
