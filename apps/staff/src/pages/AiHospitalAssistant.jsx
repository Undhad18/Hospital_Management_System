import { useState, useEffect, useRef } from "react";
import FormattedMarkdown from "../components/FormattedMarkdown";
import {
  queryAiAssistant,
  getAiConversations,
  getAiConversationMessages,
  deleteAiConversation,
  clearAllAiConversations,
} from "../services/api";

const CATEGORIZED_PROMPTS = [
  {
    category: "Inpatient & Wards",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
    color: "text-emerald-600 bg-emerald-50 border-emerald-200",
    prompts: [
      { label: "Bed Occupancy", query: "How many beds are currently occupied?" },
      { label: "Ward Availability", query: "Which wards have available beds?" },
    ],
  },
  {
    category: "Appointments & Queue",
    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    color: "text-sky-600 bg-sky-50 border-sky-200",
    prompts: [
      { label: "Today's Appointments", query: "How many appointments are scheduled today?" },
      { label: "Patient Queue", query: "How many patients are waiting in queue?" },
    ],
  },
  {
    category: "Doctors & Clinical Roster",
    icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    color: "text-indigo-600 bg-indigo-50 border-indigo-200",
    prompts: [
      { label: "Doctor Availability", query: "Which doctors are available?" },
      { label: "Hospital Statistics", query: "What are today's hospital statistics and operational overview?" },
    ],
  },
  {
    category: "Pharmacy & Formulary",
    icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
    color: "text-amber-600 bg-amber-50 border-amber-200",
    prompts: [
      { label: "Low Stock Drugs", query: "Which medicines are running low in stock?" },
      { label: "Expiring Batches", query: "Which medicines are approaching expiry?" },
    ],
  },
  {
    category: "Diagnostics & Finance",
    icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
    color: "text-purple-600 bg-purple-50 border-purple-200",
    prompts: [
      { label: "Pending Lab Tests", query: "How many laboratory tests are pending?" },
      { label: "Unpaid Invoices", query: "Which pharmacy bills are unpaid?" },
    ],
  },
];

const QUICK_CHIPS = [
  "Appointments Today",
  "Available Beds",
  "Doctor Availability",
  "Patient Queue",
  "Low Stock Medicines",
  "Expiring Drugs",
  "Pending Lab Tests",
  "Unpaid Bills",
  "Hospital Overview",
];

export default function AiHospitalAssistant({ session }) {
  const token = session.token;
  const [conversations, setConversations] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputQuery, setInputQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load conversation list on mount
  useEffect(() => {
    loadConversations();
  }, [token]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function loadConversations() {
    try {
      const res = await getAiConversations(token);
      if (res.success && res.data) {
        setConversations(res.data);
      }
    } catch (err) {
      console.warn("Could not load AI conversations:", err.message);
    }
  }

  async function selectConversation(convId) {
    setActiveConversationId(convId);
    setError(null);
    setLoading(true);
    try {
      const res = await getAiConversationMessages(token, convId);
      if (res.success) {
        const rawMessages = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.messages)
          ? res.messages
          : Array.isArray(res.data?.messages)
          ? res.data.messages
          : [];
        setMessages(
          rawMessages.map((m) => ({
            id: m.id,
            role: m.role || m.sender || "user",
            content: m.content || m.message || "",
            intent: m.intent || m.metadata?.intent,
            sources: m.sources_used || m.metadata?.sources,
            confidence: m.confidence_score || m.metadata?.confidence,
            createdAt: m.created_at,
          }))
        );
      }
    } catch (err) {
      setError("Failed to load conversation history: " + err.message);
    } finally {
      setLoading(false);
      setSidebarOpen(false);
    }
  }

  function handleStartNewChat() {
    setActiveConversationId(null);
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  }

  async function handleDeleteConversation(convId, e) {
    e.stopPropagation();
    try {
      await deleteAiConversation(token, convId);
      if (activeConversationId === convId) {
        handleStartNewChat();
      }
      loadConversations();
    } catch (err) {
      setError("Failed to delete conversation: " + err.message);
    }
  }

  async function handleClearAllConversations() {
    try {
      await clearAllAiConversations(token);
      setShowClearConfirm(false);
      handleStartNewChat();
      setConversations([]);
    } catch (err) {
      setError("Failed to clear conversations: " + err.message);
    }
  }

  async function handleSendQuery(queryToSend) {
    const q = (queryToSend || inputQuery).trim();
    if (!q || loading) return;

    setError(null);
    setInputQuery("");

    // Append optimistic user message
    const userMsg = {
      id: "temp-" + Date.now(),
      role: "user",
      content: q,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await queryAiAssistant(token, {
        question: q,
        conversationId: activeConversationId,
      });

      if (res.success) {
        const assistantMsg = {
          id: res.messageId || res.data?.message_id || Date.now(),
          role: "assistant",
          content: res.answer || res.data?.answer || "No response received.",
          intent: res.metadata?.intent || res.data?.intent,
          sources: res.metadata?.sources || res.data?.sources,
          confidence: res.metadata?.confidence || res.data?.confidence || 1.0,
          createdAt: res.metadata?.timestamp || res.data?.timestamp || new Date().toISOString(),
          provider: res.metadata?.provider || res.data?.provider || "Local Heuristic",
          model: res.metadata?.model || res.data?.model || "local-heuristic-v1",
          latencyMs: res.metadata?.executionTimeMs || res.data?.execution_latency_ms,
        };

        setMessages((prev) => [...prev, assistantMsg]);

        const nextConvId = res.conversationId || res.data?.conversation_id;
        if (nextConvId && nextConvId !== activeConversationId) {
          setActiveConversationId(nextConvId);
          loadConversations();
        }
      }
    } catch (err) {
      setError(err.message || "Failed to reach AI Assistant");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleCopy(id, text) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const filteredConversations = conversations.filter((c) =>
    searchQuery
      ? (c.title || "").toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

  return (
    <div className="flex-1 min-h-0 h-full w-full flex bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden relative">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs md:hidden"
        ></div>
      )}

      {/* ======================= CONVERSATIONS SIDEBAR ======================= */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 h-full w-80 bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 transition-transform duration-200 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          }`}
      >
        {/* Top Sidebar Header */}
        <div className="p-3.5 border-b border-slate-200 bg-white/80 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-md bg-sky-100 text-sky-700 flex items-center justify-center">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <span className="text-xs font-bold text-slate-800">
                Inquiry History
              </span>
              <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded-full font-semibold border border-slate-200">
                {conversations.length}
              </span>
            </div>

            <div className="flex items-center space-x-1">
              <button
                onClick={handleStartNewChat}
                className="px-2.5 py-1 text-xs bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-md flex items-center space-x-1 cursor-pointer transition shadow-2xs"
                title="Start a fresh operational inquiry"
              >
                <span>+</span>
                <span>New</span>
              </button>

              {conversations.length > 0 && (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition cursor-pointer"
                  title="Clear all inquiry history"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}

              <button
                onClick={() => setSidebarOpen(false)}
                className="md:hidden p-1 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mt-2.5 relative">
            <input
              type="text"
              placeholder="Search past inquiries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100 border border-slate-200 rounded-lg pl-7 pr-6 py-1.5 text-xs text-slate-700 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none transition"
            />
            <svg
              className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="text-slate-400 hover:text-slate-600 absolute right-2 top-1.5 text-xs font-bold"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Conversation List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 space-y-2">
              <div className="w-9 h-9 mx-auto rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="font-medium text-slate-600">No Inquiries Yet</p>
              <p className="text-[11px] text-slate-400">
                Select a prompt card or type an operational query below.
              </p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">
              No inquiries match "{searchQuery}"
            </div>
          ) : (
            filteredConversations.map((c) => {
              const isActive = c.id === activeConversationId;
              return (
                <div
                  key={c.id}
                  onClick={() => selectConversation(c.id)}
                  className={`group relative p-2.5 rounded-lg border text-xs cursor-pointer transition flex items-start justify-between space-x-2 ${isActive
                      ? "bg-white text-sky-900 font-semibold shadow-xs border-sky-300 ring-1 ring-sky-200"
                      : "bg-white/70 border-slate-200/80 text-slate-700 hover:bg-white hover:border-slate-300"
                    }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-slate-800 leading-snug">
                      {c.title || "Hospital Inquiry"}
                    </p>
                    <div className="flex items-center space-x-1.5 mt-1 text-[10px] text-slate-400 font-mono">
                      <span>
                        {new Date(c.updated_at || c.created_at).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <span>•</span>
                      <span>
                        {new Date(c.updated_at || c.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleDeleteConversation(c.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 rounded transition shrink-0"
                    title="Delete inquiry"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-200 bg-white/90 shrink-0 text-[10px] text-slate-500 font-mono flex items-center justify-between">
          <span className="truncate">Node #H{session?.user?.hospitalId || 1} • {session?.user?.role || "admin"}</span>
          <span className="text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
            Online
          </span>
        </div>
      </aside>

      {/* ======================= CHAT MAIN WORKSPACE ======================= */}
      <div className="flex-1 flex flex-col min-w-0 h-full bg-white relative">
        {/* Pinned Top Bar */}
        <header className="h-14 px-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white z-10">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                AI
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-bold text-slate-900">
                    AI Hospital Operational Assistant
                  </h3>
                  <span className="inline-flex items-center space-x-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.2 rounded-full border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Grounded MySQL</span>
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono">
                  Real-time operational query answering with zero hallucinations
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleStartNewChat}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md transition"
            >
              New Chat
            </button>
          </div>
        </header>

        {/* Clinical Disclaimer Ribbon */}
        <div className="bg-amber-50/70 border-b border-amber-200/70 px-4 py-1.5 flex items-center space-x-2 text-[11px] text-amber-800 shrink-0">
          <svg className="w-3.5 h-3.5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="truncate">
            <strong>Operational Intelligence Notice:</strong> Statistics and telemetry retrieved live from MySQL. Does not provide medical diagnoses or alter prescriptions.
          </span>
        </div>

        {/* Scrollable Message Log */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 min-h-0">
          {messages.length === 0 ? (
            /* ================= HERO WELCOME STATE ================= */
            <div className="max-w-3xl mx-auto py-4 space-y-6 animate-in fade-in duration-200">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center shadow-md">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h4 className="text-base font-bold text-slate-900">
                  How can I assist hospital operations today?
                </h4>
                <p className="text-xs text-slate-500 max-w-lg mx-auto">
                  Ask natural language questions about active appointments, doctor rosters, inpatient bed census, pharmacy stock, or laboratory velocity.
                </p>
              </div>

              {/* Categorized Quick Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                {CATEGORIZED_PROMPTS.map((cat, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/60 hover:bg-slate-50 transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <span className={`w-5 h-5 rounded-md flex items-center justify-center ${cat.color}`}>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={cat.icon} />
                          </svg>
                        </span>
                        <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                          {cat.category}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {cat.prompts.map((p, pIdx) => (
                          <button
                            key={pIdx}
                            onClick={() => handleSendQuery(p.query)}
                            className="w-full text-left p-2 rounded-lg bg-white border border-slate-200/80 hover:border-sky-300 hover:bg-sky-50/50 transition text-xs text-slate-700 hover:text-sky-800 flex items-center justify-between group cursor-pointer shadow-2xs"
                          >
                            <span className="truncate pr-1">{p.label}</span>
                            <span className="text-slate-400 group-hover:text-sky-600 font-bold shrink-0 text-[10px]">→</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* ================= ACTIVE MESSAGES LOG ================= */
            messages.map((m, idx) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={m.id || idx}
                  className={`flex ${isUser ? "justify-end" : "justify-start"} items-start space-x-2.5 animate-in fade-in duration-150`}
                >
                  {!isUser && (
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-sky-600 to-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 shadow-2xs">
                      AI
                    </div>
                  )}

                  <div
                    className={`max-w-2xl rounded-2xl p-4 text-xs shadow-2xs leading-relaxed ${isUser
                        ? "bg-sky-600 text-white font-medium whitespace-pre-wrap"
                        : "bg-slate-50 border border-slate-200/90 text-slate-800"
                      }`}
                  >
                    {isUser ? (
                      <div>{m.content}</div>
                    ) : (
                      <FormattedMarkdown content={m.content} />
                    )}

                    {/* Metadata Footer for Assistant Response */}
                    {!isUser && (
                      <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 font-mono">
                        <div className="flex items-center space-x-2">
                          {m.sources && (
                            <span className="bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-600 font-semibold">
                              Sources: {Array.isArray(m.sources) ? m.sources.join(", ") : m.sources}
                            </span>
                          )}
                          {m.latencyMs && (
                            <span className="text-slate-500">~{m.latencyMs}ms</span>
                          )}
                          <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                            100% Grounded
                          </span>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleCopy(m.id, m.content)}
                            className="hover:text-slate-700 transition"
                          >
                            {copiedId === m.id ? "✓ Copied" : "Copy"}
                          </button>
                          <span>
                            {new Date(m.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {isUser && (
                    <div className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      You
                    </div>
                  )}
                </div>
              );
            })
          )}

          {loading && (
            <div className="flex items-center space-x-2.5 text-slate-500 text-xs py-2">
              <div className="w-7 h-7 rounded-lg bg-sky-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                AI
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex items-center space-x-2 text-xs text-slate-600">
                <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping"></span>
                <span>Grounding query with live hospital records...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="font-bold ml-2">×</button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Input Area */}
        <div className="p-3.5 border-t border-slate-200 bg-white shrink-0 space-y-2">
          {/* Quick Prompt Pills Bar */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
              Suggestions:
            </span>
            {QUICK_CHIPS.map((chip, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSendQuery(chip)}
                className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-sky-50 hover:text-sky-700 text-slate-600 text-[11px] font-medium border border-slate-200/80 transition whitespace-nowrap cursor-pointer shrink-0"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Text Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendQuery();
            }}
            className="flex items-center space-x-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask an operational question (e.g., 'Which doctors are available today?')..."
              className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none transition"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !inputQuery.trim()}
              className="bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white font-semibold px-4 py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center space-x-1.5 shadow-2xs shrink-0"
            >
              <span>Send</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </form>

          <p className="text-[10px] text-slate-400 text-center font-mono">
            Press Enter to submit • Grounded in MySQL • Data isolated to Hospital Facility
          </p>
        </div>
      </div>

      {/* ======================= CLEAR ALL CONFIRMATION MODAL ======================= */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full p-5 animate-in fade-in duration-150">
            <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h4 className="text-sm font-bold text-slate-900 text-center">
              Clear All Inquiry History?
            </h4>
            <p className="text-xs text-slate-500 text-center mt-1">
              This will permanently delete all past conversation threads and messages for this account.
            </p>

            <div className="mt-5 flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAllConversations}
                className="flex-1 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition shadow-2xs"
              >
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
