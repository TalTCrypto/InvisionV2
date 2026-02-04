"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Plus,
  Trash2,
  MessageSquare,
  Loader2,
  Bot,
  User,
  Brain,
  Lightbulb,
  TrendingUp,
  Zap,
  ChevronDown,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { AnimatedCard } from "~/components/ui/animated-card";
import { BlurFade } from "~/components/ui/blur-fade";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

type AgentType = "orchestrator" | "content" | "performance" | "strategy";

interface AgentInfo {
  type: AgentType;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  placeholder: string;
}

const AGENTS: Record<AgentType, AgentInfo> = {
  orchestrator: {
    type: "orchestrator",
    name: "Orchestrator",
    description: "Agent polyvalent pour toutes vos questions",
    icon: Brain,
    color: "text-purple-500",
    placeholder: "Posez n'importe quelle question...",
  },
  content: {
    type: "content",
    name: "Content Creator",
    description: "Expert en création de contenu viral (hooks, scripts, CTAs)",
    icon: Lightbulb,
    color: "text-yellow-500",
    placeholder: "Ex: Crée-moi 3 hooks pour un reel fitness...",
  },
  performance: {
    type: "performance",
    name: "Performance Analyst",
    description: "Expert en analyse de métriques et optimisation",
    icon: TrendingUp,
    color: "text-blue-500",
    placeholder: "Ex: Analyse mes stats Instagram...",
  },
  strategy: {
    type: "strategy",
    name: "Strategy Planner",
    description: "Expert en stratégie de contenu et croissance",
    icon: Zap,
    color: "text-green-500",
    placeholder: "Ex: Crée une stratégie pour passer de 2K à 10K followers...",
  },
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// Labels shown to non-technical users while a tool runs.
// pending → while waiting | done → success | failed → error

export default function ChatPage() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [selectedAgent, setSelectedAgent] = useState<AgentType>("orchestrator");
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [streaming, setStreaming] = useState<{
    active: boolean;
    text: string;
    userMessage: string | null;
    reasoning: Array<{ type: string; content: string }>;
    tools: Array<{
      name: string;
      input: Record<string, unknown> | null;
      output: unknown;
      duration?: number;
      success?: boolean;
    }>;
  }>({ active: false, text: "", userMessage: null, reasoning: [], tools: [] });

  const utils = api.useUtils();

  const { data: sessions, isLoading: isLoadingSessions } =
    api.chatV2.getSessions.useQuery();

  const { data: currentSession, isLoading: isLoadingSession } =
    api.chatV2.getSession.useQuery(
      { sessionId: selectedSessionId ?? "" },
      { enabled: !!selectedSessionId },
    );

  const createSession = api.chatV2.createSession.useMutation({
    onSuccess: (newSession) => {
      setSelectedSessionId(newSession.id);
      void utils.chatV2.getSessions.invalidate();
    },
  });

  const deleteSession = api.chatV2.deleteSession.useMutation({
    onSuccess: () => {
      if (selectedSessionId) setSelectedSessionId(null);
      void utils.chatV2.getSessions.invalidate();
    },
  });

  useEffect(() => {
    setStreaming({
      active: false,
      text: "",
      userMessage: null,
      reasoning: [],
      tools: [],
    });
  }, [selectedSessionId]);

  // Auto-select first session on mount
  useEffect(() => {
    if (sessions && sessions.length > 0 && !selectedSessionId) {
      setSelectedSessionId(sessions[0]?.id ?? null);
    }
  }, [sessions, selectedSessionId]);

  const rawMessages: ChatMessage[] = currentSession?.messages ?? [];

  // While the user-message overlay is visible, the server may have already
  // persisted that same message (it does so before the first SSE event).
  // Hide only the very last element when it matches exactly so the overlay
  // and the DB copy don't coexist.  Older messages with identical text are
  // never touched.
  const displayMessages: ChatMessage[] = (() => {
    if (!streaming.userMessage || (!streaming.active && !streaming.text))
      return rawMessages;
    const last = rawMessages[rawMessages.length - 1];
    if (last?.role === "user" && last.content === streaming.userMessage)
      return rawMessages.slice(0, -1);
    return rawMessages;
  })();

  // Tail-checks: did the server already persist this round's messages?
  // We only look at the last N messages so a previous exchange with the same
  // text does not trigger a false positive.
  const recentSlice = displayMessages.slice(-4);
  const dbHasCurrentUser =
    !!streaming.userMessage &&
    recentSlice.some(
      (m) => m.role === "user" && m.content === streaming.userMessage,
    );
  const dbHasCurrentAssistant =
    !!streaming.text &&
    recentSlice.some(
      (m) => m.role === "assistant" && m.content === streaming.text,
    );

  // Once DB has the assistant response the frozen bubble can go.
  useEffect(() => {
    if (!streaming.text || streaming.active) return;
    if (dbHasCurrentAssistant) {
      setStreaming({
        active: false,
        text: "",
        userMessage: null,
        reasoning: [],
        tools: [],
      });
    }
  }, [
    currentSession?.messages,
    streaming.text,
    streaming.active,
    dbHasCurrentAssistant,
  ]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages, streaming]);

  // Focus input when session is ready
  useEffect(() => {
    if (selectedSessionId && !isLoadingSession && !streaming.active) {
      inputRef.current?.focus();
    }
  }, [selectedSessionId, isLoadingSession, streaming.active]);

  const handleSendMessage = useCallback(async () => {
    if (!message.trim() || !selectedSessionId || streaming.active) return;

    const messageText = message.trim();
    setMessage("");

    setStreaming({
      active: true,
      text: "",
      userMessage: messageText,
      reasoning: [],
      tools: [],
    });

    let assistantContent = "";

    try {
      const response = await fetch(
        `/api/chat/v2/stream?sessionId=${selectedSessionId}&message=${encodeURIComponent(messageText)}&agent=${selectedAgent}`,
      );

      if (!response.body) {
        setStreaming((prev) => ({ ...prev, active: false }));
        return;
      }

      // Server persists the user message before starting the LLM call,
      // so it's already in DB by the time headers arrive. Refetch now to
      // swap the optimistic copy for the real DB row seamlessly.
      void utils.chatV2.getSession.invalidate({ sessionId: selectedSessionId });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEventType = "";
      let endReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) {
            currentEventType = "";
            continue;
          }

          if (line.startsWith("event: ")) {
            currentEventType = line.slice(7).trim();
            continue;
          }

          if (!line.startsWith("data: ")) continue;

          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;

          let data: Record<string, unknown>;
          try {
            data = JSON.parse(dataStr) as Record<string, unknown>;
          } catch {
            continue;
          }

          const eventType =
            currentEventType ||
            (typeof data.type === "string" ? data.type : "message");

          if (eventType === "token") {
            const token = typeof data.token === "string" ? data.token : "";
            if (token) {
              assistantContent += token;
              setStreaming((prev) => ({ ...prev, text: prev.text + token }));
            }
          } else if (eventType === "tool") {
            const action = typeof data.action === "string" ? data.action : "";
            const thought =
              typeof data.thought === "string" ? data.thought : "";

            if (action && data.input !== undefined) {
              setStreaming((prev) => ({
                ...prev,
                reasoning: thought
                  ? [...prev.reasoning, { type: "thought", content: thought }]
                  : prev.reasoning,
                tools: [
                  ...prev.tools,
                  {
                    name: action,
                    input:
                      data.input &&
                      typeof data.input === "object" &&
                      !Array.isArray(data.input)
                        ? (data.input as Record<string, unknown>)
                        : null,
                    output: null,
                  },
                ],
              }));
            } else if (data.output !== undefined) {
              setStreaming((prev) => ({
                ...prev,
                tools: prev.tools.map((tool, idx) =>
                  idx === prev.tools.length - 1
                    ? {
                        ...tool,
                        output: data.output,
                        success:
                          typeof data.success === "boolean"
                            ? data.success
                            : true,
                        duration:
                          typeof data.duration === "number"
                            ? data.duration
                            : undefined,
                      }
                    : tool,
                ),
              }));
            }
          } else if (eventType === "message") {
            // "message" event carries the final content — capture it but don't
            // add to optimistic list yet; wait for "end" to do that once.
            const content =
              typeof data.content === "string" ? data.content : "";
            if (content) {
              assistantContent = content;
              setStreaming((prev) => ({ ...prev, text: content }));
            }
          } else if (eventType === "end") {
            endReceived = true;
            // Freeze the bubble in place (active → false keeps text visible).
            // A useEffect will clear it once the DB refetch delivers the message.
            setStreaming((prev) => ({ ...prev, active: false }));

            void utils.chatV2.getSession.invalidate({
              sessionId: selectedSessionId,
            });
            void utils.chatV2.getSessions.invalidate();
          }
        }
      }

      // Safety: if stream ended without an explicit "end" event
      if (!endReceived && assistantContent) {
        setStreaming((prev) => ({ ...prev, active: false }));
        void utils.chatV2.getSession.invalidate({
          sessionId: selectedSessionId,
        });
        void utils.chatV2.getSessions.invalidate();
      }
    } catch (error) {
      console.error("Stream error:", error);
      setStreaming({
        active: false,
        text: "",
        userMessage: null,
        reasoning: [],
        tools: [],
      });
    }
  }, [message, selectedSessionId, selectedAgent, streaming.active, utils]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  const currentAgentInfo = AGENTS[selectedAgent];

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Sidebar */}
      <BlurFade
        delay={0.1}
        className="border-border bg-muted/30 w-80 flex-shrink-0 border-r backdrop-blur-sm"
      >
        <div className="flex h-full flex-col">
          <div className="border-border space-y-3 border-b p-4">
            <Button
              onClick={() => createSession.mutate({})}
              className="w-full"
              disabled={createSession.isPending}
            >
              <Plus className="mr-2 size-4" />
              Nouvelle conversation
            </Button>

            {/* Agent selector */}
            <div className="space-y-2">
              <label className="text-muted-foreground text-xs font-medium">
                Agent Spécialisé
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <div className="flex items-center gap-2">
                      <currentAgentInfo.icon
                        className={cn("size-4", currentAgentInfo.color)}
                      />
                      <span className="text-sm">{currentAgentInfo.name}</span>
                    </div>
                    <ChevronDown className="size-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-80">
                  <DropdownMenuLabel>Sélectionner un agent</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {Object.values(AGENTS).map((agent) => (
                    <DropdownMenuItem
                      key={agent.type}
                      onClick={() => setSelectedAgent(agent.type)}
                      className="flex flex-col items-start gap-1 p-3"
                    >
                      <div className="flex w-full items-center gap-2">
                        <agent.icon className={cn("size-4", agent.color)} />
                        <span className="font-medium">{agent.name}</span>
                        {selectedAgent === agent.type && (
                          <span className="text-primary ml-auto text-xs">
                            ✓
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {agent.description}
                      </p>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto p-2">
            {isLoadingSessions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="text-muted-foreground size-6 animate-spin" />
              </div>
            ) : sessions && sessions.length > 0 ? (
              <div className="space-y-2">
                {sessions.map((session, index) => (
                  <BlurFade key={session.id} delay={0.1 + index * 0.05}>
                    <div
                      className={cn(
                        "group relative cursor-pointer rounded-lg border p-3 transition-all duration-200",
                        selectedSessionId === session.id
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border hover:bg-muted/50 hover:border-primary/20",
                      )}
                      onClick={() => setSelectedSessionId(session.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {session.title ?? "Nouvelle conversation"}
                          </p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {session.messageCount} message
                            {session.messageCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="hover:bg-destructive/10 hover:text-destructive size-6 opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession.mutate({ sessionId: session.id });
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </BlurFade>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <MessageSquare className="text-muted-foreground mb-4 size-12" />
                <p className="text-muted-foreground text-sm">
                  Aucune conversation
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Créez une nouvelle conversation pour commencer
                </p>
              </div>
            )}
          </div>
        </div>
      </BlurFade>

      {/* Main chat */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selectedSessionId ? (
          <>
            {/* Header */}
            <div className="border-border bg-muted/30 border-b py-3 pr-6">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 flex items-center gap-2 rounded-r-lg py-1.5 pr-3 pl-0">
                  <currentAgentInfo.icon
                    className={cn("ml-3 size-4", currentAgentInfo.color)}
                  />
                  <span className="text-sm font-medium">
                    {currentAgentInfo.name}
                  </span>
                </div>
                <span className="text-muted-foreground text-xs">
                  {currentAgentInfo.description}
                </span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6">
              {isLoadingSession &&
              !streaming.active &&
              !streaming.text &&
              !streaming.userMessage ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="text-muted-foreground size-6 animate-spin" />
                </div>
              ) : displayMessages.length > 0 ||
                streaming.active ||
                streaming.text ||
                streaming.userMessage ? (
                <div className="mx-auto max-w-3xl space-y-6">
                  {displayMessages.map((msg, index) => (
                    <BlurFade
                      key={`${msg.role}-${index}`}
                      delay={index * 0.03}
                      className={cn(
                        "flex gap-4",
                        msg.role === "user" ? "justify-end" : "justify-start",
                      )}
                    >
                      {msg.role === "assistant" && (
                        <div className="bg-primary/10 flex size-8 shrink-0 items-center justify-center rounded-full">
                          <Bot className="text-primary size-4" />
                        </div>
                      )}
                      <AnimatedCard
                        className={cn(
                          "max-w-[85%] rounded-2xl px-5 py-4 shadow-sm",
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground ml-auto"
                            : "bg-muted",
                        )}
                      >
                        {msg.role === "assistant" ? (
                          <div className="markdown-content text-sm leading-relaxed">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </p>
                        )}
                      </AnimatedCard>
                      {msg.role === "user" && (
                        <div className="bg-primary/10 flex size-8 shrink-0 items-center justify-center rounded-full">
                          <User className="text-primary size-4" />
                        </div>
                      )}
                    </BlurFade>
                  ))}

                  {/* Pending user message — shown until the DB copy arrives */}
                  {streaming.userMessage &&
                    !dbHasCurrentUser &&
                    (streaming.active || !!streaming.text) && (
                      <div className="flex justify-end gap-4">
                        <AnimatedCard className="bg-primary text-primary-foreground ml-auto max-w-[85%] rounded-2xl px-5 py-4 shadow-sm">
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {streaming.userMessage}
                          </p>
                        </AnimatedCard>
                        <div className="bg-primary/10 flex size-8 shrink-0 items-center justify-center rounded-full">
                          <User className="text-primary size-4" />
                        </div>
                      </div>
                    )}

                  {/* Streaming bubble — active while running, frozen until DB has the response */}
                  {(streaming.active ||
                    (!!streaming.text && !dbHasCurrentAssistant)) && (
                    <BlurFade className="flex justify-start gap-4">
                      <div className="bg-primary/10 flex size-8 shrink-0 items-center justify-center rounded-full">
                        <Bot className="text-primary size-4" />
                      </div>
                      <AnimatedCard className="bg-muted max-w-[85%] rounded-2xl px-5 py-4 shadow-sm">
                        {streaming.reasoning.length > 0 && (
                          <div className="border-border/50 mb-4 space-y-2 border-b pb-4">
                            {streaming.reasoning.map((r, idx) => (
                              <div
                                key={idx}
                                className="text-muted-foreground bg-muted/50 rounded-lg p-3 text-xs"
                              >
                                <div className="mb-1 font-medium">
                                  💭 Raisonnement
                                </div>
                                <div className="whitespace-pre-wrap">
                                  {r.content}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {streaming.tools.length > 0 && (
                          <div className="border-border/50 mb-4 space-y-2 border-b pb-4">
                            {streaming.tools.map((tool, idx) => (
                              <div
                                key={idx}
                                className="bg-muted/50 border-border/30 rounded-lg border p-3 text-xs"
                              >
                                {/* Header: status dot + name + duration */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 font-medium">
                                    <span
                                      className={cn(
                                        "size-2 rounded-full",
                                        tool.output === null
                                          ? "animate-pulse bg-amber-400"
                                          : tool.success === false
                                            ? "bg-red-500"
                                            : "bg-emerald-500",
                                      )}
                                    />
                                    <span className="text-muted-foreground">
                                      🔧
                                    </span>
                                    <span className="text-foreground">
                                      {tool.name}
                                    </span>
                                  </div>
                                  {tool.duration && (
                                    <span className="text-muted-foreground font-normal">
                                      {tool.duration}ms
                                    </span>
                                  )}
                                </div>

                                {/* Input — collapsible, closed by default */}
                                {tool.input && (
                                  <details className="mt-2">
                                    <summary className="text-muted-foreground hover:text-foreground cursor-pointer font-medium select-none">
                                      ▸ Input
                                    </summary>
                                    <pre className="text-muted-foreground mt-1 whitespace-pre-wrap">
                                      {JSON.stringify(tool.input, null, 2)}
                                    </pre>
                                  </details>
                                )}

                                {/* Output — open by default, green on success / red on error */}
                                {tool.output !== null && (
                                  <details className="mt-2" open>
                                    <summary
                                      className={cn(
                                        "cursor-pointer font-medium select-none",
                                        tool.success === false
                                          ? "text-red-500"
                                          : "text-emerald-600 dark:text-emerald-400",
                                      )}
                                    >
                                      {tool.success === false
                                        ? "▾ Erreur"
                                        : "▾ Output"}
                                    </summary>
                                    <pre
                                      className={cn(
                                        "mt-1 whitespace-pre-wrap",
                                        tool.success === false
                                          ? "text-red-400"
                                          : "text-muted-foreground",
                                      )}
                                    >
                                      {typeof tool.output === "string"
                                        ? tool.output
                                        : JSON.stringify(tool.output, null, 2)}
                                    </pre>
                                  </details>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {streaming.text ? (
                          <div className="markdown-content relative text-sm leading-relaxed">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {streaming.text}
                            </ReactMarkdown>
                            {streaming.active && (
                              <span className="bg-primary ml-1 inline-block h-4 w-0.5 animate-pulse align-middle" />
                            )}
                          </div>
                        ) : streaming.active ? (
                          <div className="flex items-center gap-3">
                            <Loader2 className="text-muted-foreground size-4 animate-spin" />
                            <span className="text-muted-foreground text-sm">
                              {currentAgentInfo.name} réfléchit...
                            </span>
                          </div>
                        ) : null}
                      </AnimatedCard>
                    </BlurFade>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <BlurFade className="max-w-md text-center">
                    <div className="mb-6 flex justify-center">
                      <div className="bg-primary/10 flex size-16 items-center justify-center rounded-full">
                        <currentAgentInfo.icon
                          className={cn("size-8", currentAgentInfo.color)}
                        />
                      </div>
                    </div>
                    <h3 className="mb-2 text-xl font-semibold">
                      Commencez la conversation
                    </h3>
                    <p className="text-muted-foreground mb-6 text-sm">
                      {currentAgentInfo.description}
                    </p>
                    <div className="bg-muted/50 rounded-lg border p-4 text-left">
                      <p className="text-muted-foreground mb-2 text-xs font-medium">
                        Agent actif
                      </p>
                      <p className="text-sm font-medium">
                        {currentAgentInfo.name}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {currentAgentInfo.description}
                      </p>
                    </div>
                  </BlurFade>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-border bg-background/80 border-t backdrop-blur-sm">
              <div className="mx-auto max-w-3xl p-4">
                <div className="border-border bg-background focus-within:border-primary focus-within:ring-primary/20 relative flex items-end gap-3 rounded-2xl border p-2 shadow-sm transition-all focus-within:ring-2">
                  <Input
                    ref={inputRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={currentAgentInfo.placeholder}
                    disabled={streaming.active}
                    className="flex-1 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  <Button
                    onClick={() => void handleSendMessage()}
                    disabled={!message.trim() || streaming.active}
                    size="icon"
                    className="shrink-0 rounded-xl"
                  >
                    {streaming.active ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <BlurFade className="max-w-md text-center">
              <div className="mb-6 flex justify-center">
                <div className="bg-primary/10 flex size-20 items-center justify-center rounded-full">
                  <MessageSquare className="text-primary size-10" />
                </div>
              </div>
              <h3 className="mb-2 text-2xl font-semibold">
                Sélectionnez une conversation
              </h3>
              <p className="text-muted-foreground mb-6 text-sm">
                Choisissez une conversation existante ou créez-en une nouvelle
              </p>
              <Button onClick={() => createSession.mutate({})} size="lg">
                <Plus className="mr-2 size-4" />
                Nouvelle conversation
              </Button>
            </BlurFade>
          </div>
        )}
      </div>
    </div>
  );
}
