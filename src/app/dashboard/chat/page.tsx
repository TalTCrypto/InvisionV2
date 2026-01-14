"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  Send,
  Plus,
  Trash2,
  MessageSquare,
  Loader2,
  Sparkles,
  Bot,
  User,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { AnimatedCard } from "~/components/ui/animated-card";
import { BlurFade } from "~/components/ui/blur-fade";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { useRouter } from "next/navigation";

export default function ChatPage() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Messages locaux pour l'affichage optimiste
  const [localMessages, setLocalMessages] = useState<
    Array<{
      role: "user" | "assistant";
      content: string;
      timestamp: string;
    }>
  >([]);

  const [streamingData, setStreamingData] = useState<{
    reasoning: Array<{ type: string; content: string }>;
    tools: Array<{
      name: string;
      input: Record<string, unknown> | null;
      output: unknown;
      duration?: number;
    }>;
    currentText: string;
    isStreaming: boolean;
  }>({
    reasoning: [],
    tools: [],
    currentText: "",
    isStreaming: false,
  });

  const utils = api.useUtils();
  const router = useRouter();

  // Récupérer les intégrations connectées de l'utilisateur
  const { data: connectedIntegrations } =
    api.integrations.getConnected.useQuery();

  // Récupérer la liste des intégrations disponibles pour obtenir les noms
  const { data: availableIntegrations } = api.integrations.list.useQuery();

  // État pour le dialog d'intégrations manquantes
  const [missingIntegrationsDialog, setMissingIntegrationsDialog] = useState<{
    open: boolean;
    missingIntegrations: string[];
  }>({ open: false, missingIntegrations: [] });

  // Récupérer les workflows disponibles
  const { data: workflows, isLoading: isLoadingWorkflows } =
    api.chat.getWorkflows.useQuery();

  // Récupérer les sessions
  const { data: sessions, isLoading: isLoadingSessions } =
    api.chat.getSessions.useQuery();

  // Récupérer la session sélectionnée
  const { data: currentSession, isLoading: isLoadingSession } =
    api.chat.getSession.useQuery(
      { sessionId: selectedSessionId ?? "" },
      { enabled: !!selectedSessionId },
    );

  // Workflow sélectionné ou workflow de la session
  const activeWorkflow = useMemo(() => {
    if (selectedWorkflowId) {
      return workflows?.find((w) => w.id === selectedWorkflowId);
    }
    if (currentSession?.workflowId) {
      return workflows?.find((w) => w.workflowId === currentSession.workflowId);
    }
    return workflows?.[0]; // Workflow par défaut
  }, [selectedWorkflowId, currentSession?.workflowId, workflows]);

  // Mutations
  const createSession = api.chat.createSession.useMutation({
    onSuccess: (newSession) => {
      setSelectedSessionId(newSession.id);
      void utils.chat.getSessions.invalidate();
    },
  });

  const sendMessage = api.chat.sendMessage.useMutation({
    onSuccess: () => {
      // Le message utilisateur est maintenant sauvegardé en DB
      // On rafraîchit la session mais on garde les messages locaux pour éviter qu'ils disparaissent
      // pendant le rechargement
      void utils.chat.getSession.invalidate({
        sessionId: selectedSessionId ?? "",
      });
      void utils.chat.getSessions.invalidate();
      inputRef.current?.focus();
    },
    onError: () => {
      // En cas d'erreur, garder quand même le message local pour l'UX
      console.error("Erreur lors de l'envoi du message");
    },
  });

  const deleteSession = api.chat.deleteSession.useMutation({
    onSuccess: () => {
      if (selectedSessionId) {
        setSelectedSessionId(null);
      }
      void utils.chat.getSessions.invalidate();
    },
  });

  // Combiner les messages de la session avec les messages locaux
  // Important : ne pas perdre les messages locaux même si la session est en cours de rechargement
  const displayMessages = useMemo(() => {
    const sessionMessages = currentSession?.messages ?? [];

    // Si on a des messages locaux, les combiner intelligemment avec les messages de la session
    if (localMessages.length > 0) {
      // Si la session est vide ou en cours de chargement, utiliser uniquement les messages locaux
      if (sessionMessages.length === 0 || isLoadingSession) {
        return localMessages;
      }

      // Créer un Set pour identifier rapidement les messages de session
      // On utilise le contenu complet et le rôle pour une identification précise
      const sessionMessageSet = new Set<string>();
      for (const msg of sessionMessages) {
        const key = `${msg.role}-${msg.content}`;
        sessionMessageSet.add(key);
      }

      // Ajouter les messages locaux qui ne sont pas déjà dans la session
      const uniqueLocalMessages = localMessages.filter((localMsg) => {
        const key = `${localMsg.role}-${localMsg.content}`;
        return !sessionMessageSet.has(key);
      });

      // Combiner tous les messages et trier par timestamp pour préserver l'ordre chronologique
      const allMessages = [...sessionMessages, ...uniqueLocalMessages];
      return allMessages.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeA - timeB;
      });
    }

    return sessionMessages;
  }, [currentSession?.messages, localMessages, isLoadingSession]);

  // Nettoyer les messages locaux quand ils sont tous présents dans la session
  // Mais seulement si la session a au moins autant de messages que les messages locaux
  useEffect(() => {
    if (localMessages.length === 0 || !currentSession?.messages) return;

    const sessionMessages = currentSession.messages;

    // Si la session a moins de messages que les messages locaux, ne pas nettoyer
    // (la DB n'est peut-être pas encore à jour)
    if (sessionMessages.length < localMessages.length) {
      return;
    }

    const sessionMessageMap = new Map<string, boolean>();
    for (const msg of sessionMessages) {
      const key = `${msg.role}-${msg.content}`;
      sessionMessageMap.set(key, true);
    }

    // Vérifier si tous les messages locaux sont dans la session
    const allLocalInSession = localMessages.every((localMsg) => {
      const key = `${localMsg.role}-${localMsg.content}`;
      return sessionMessageMap.has(key);
    });

    // Si tous les messages locaux sont dans la session ET que la session a au moins le même nombre de messages,
    // on peut les nettoyer après un délai pour être sûr
    if (
      allLocalInSession &&
      localMessages.length > 0 &&
      sessionMessages.length >= localMessages.length
    ) {
      const timeoutId = setTimeout(() => {
        setLocalMessages([]);
      }, 2000); // Délai plus long pour être sûr que la DB est à jour
      return () => clearTimeout(timeoutId);
    }
  }, [currentSession?.messages, localMessages]);

  // Auto-scroll vers le bas quand de nouveaux messages arrivent
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages, streamingData]);

  // Sélectionner la première session au chargement
  useEffect(() => {
    if (sessions && sessions.length > 0 && !selectedSessionId) {
      setSelectedSessionId(sessions[0]?.id ?? null);
    }
  }, [sessions, selectedSessionId]);

  // Focus sur l'input au chargement
  useEffect(() => {
    if (selectedSessionId && !isLoadingSession) {
      inputRef.current?.focus();
    }
  }, [selectedSessionId, isLoadingSession]);

  const handleSendMessage = async () => {
    if (!message.trim() || !selectedSessionId) return;

    const messageText = message.trim();

    // Vérifier les intégrations requises AVANT d'envoyer le message
    if (!activeWorkflow) {
      return;
    }

    const workflowRequiredIntegrations = (
      activeWorkflow as { requiredIntegrations?: string[] | null }
    )?.requiredIntegrations;

    if (
      workflowRequiredIntegrations &&
      workflowRequiredIntegrations.length > 0
    ) {
      const normalizeSlug = (slug: string) =>
        slug.toLowerCase().replace(/-/g, "");

      const connectedSlugs = new Set(
        (connectedIntegrations ?? []).map(normalizeSlug),
      );

      const missingIntegrations = workflowRequiredIntegrations.filter(
        (requiredSlug: string) =>
          !connectedSlugs.has(normalizeSlug(requiredSlug)),
      );

      if (missingIntegrations.length > 0) {
        // Obtenir les noms des intégrations manquantes
        const missingIntegrationNames = missingIntegrations.map(
          (slug: string) => {
            const integration = availableIntegrations?.find(
              (int) => normalizeSlug(int.slug) === normalizeSlug(slug),
            );
            return integration?.name ?? slug;
          },
        );

        // Afficher le dialog avec les intégrations manquantes
        setMissingIntegrationsDialog({
          open: true,
          missingIntegrations: missingIntegrationNames,
        });
        return; // Ne pas envoyer le message
      }
    }

    setMessage("");

    // AFFICHER LE MESSAGE UTILISATEUR IMMÉDIATEMENT (optimistic update)
    const userMessage = {
      role: "user" as const,
      content: messageText,
      timestamp: new Date().toISOString(),
    };

    // Ajouter le nouveau message utilisateur aux messages locaux existants
    // IMPORTANT : On garde TOUS les messages précédents pour éviter qu'ils disparaissent
    setLocalMessages((prev) => {
      // Vérifier si ce message n'existe pas déjà
      const exists = prev.some(
        (m) => m.role === "user" && m.content === messageText,
      );
      if (exists) return prev;
      // Ajouter le nouveau message à la fin
      return [...prev, userMessage];
    });

    // Sauvegarder le message utilisateur via tRPC (en arrière-plan)
    sendMessage.mutate(
      {
        sessionId: selectedSessionId,
        message: messageText,
      },
      {
        onError: (error) => {
          // Si l'erreur concerne les intégrations manquantes
          if (error.data?.code === "PRECONDITION_FAILED") {
            // Extraire les intégrations manquantes du message d'erreur
            const errorMessage = error.message ?? "";
            const missingIntegrationsMatch =
              /Les intégrations suivantes doivent être connectées : (.+)/.exec(
                errorMessage,
              );
            const missingIntegrations = missingIntegrationsMatch
              ? (missingIntegrationsMatch[1]?.split(", ") ?? [])
              : [];
            alert(
              `Les intégrations suivantes doivent être connectées avant d'utiliser ce workflow :\n\n${missingIntegrations.join("\n")}\n\nVeuillez les connecter dans la page Intégrations.`,
            );
            // Retirer le message utilisateur des messages locaux car l'envoi a échoué
            setLocalMessages((prev) =>
              prev.filter(
                (m) => !(m.role === "user" && m.content === messageText),
              ),
            );
            setMessage(messageText); // Remettre le message dans l'input
            return;
          }
          // Pour les autres erreurs, afficher un message générique
          alert(`Erreur lors de l'envoi du message : ${error.message}`);
          // Retirer le message utilisateur des messages locaux
          setLocalMessages((prev) =>
            prev.filter(
              (m) => !(m.role === "user" && m.content === messageText),
            ),
          );
          setMessage(messageText); // Remettre le message dans l'input
        },
      },
    );

    // Réinitialiser le streaming
    setStreamingData({
      reasoning: [],
      tools: [],
      currentText: "",
      isStreaming: true,
    });

    // Créer la connexion SSE avec fetch
    const response = await fetch(
      `/api/chat/stream?sessionId=${selectedSessionId}&message=${encodeURIComponent(messageText)}`,
    );

    if (!response.body) {
      console.error("Pas de body dans la réponse SSE");
      setStreamingData((prev) => ({ ...prev, isStreaming: false }));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const processStream = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let currentEventType = "message";
          for (const line of lines) {
            if (!line.trim()) continue;

            if (line.startsWith("event: ")) {
              currentEventType = line.slice(7).trim();
              continue;
            }

            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6).trim();
              if (!dataStr) continue;

              try {
                const data = JSON.parse(dataStr) as Record<string, unknown>;
                const eventType =
                  currentEventType ??
                  (typeof data.type === "string" ? data.type : null) ??
                  "message";

                // Debug: logger les événements importants (seulement pour les événements non-token ou tokens importants)
                if (eventType !== "token") {
                  console.log(`[SSE] Event: ${eventType}`, data);
                }

                if (eventType === "token") {
                  const fullText =
                    typeof data.fullText === "string"
                      ? data.fullText
                      : undefined;
                  const chunk =
                    typeof data.chunk === "string" ? data.chunk : undefined;
                  if (fullText || chunk) {
                    setStreamingData((prev) => ({
                      ...prev,
                      currentText: fullText ?? prev.currentText + (chunk ?? ""),
                    }));
                  }
                } else if (eventType === "reasoning") {
                  const content =
                    typeof data.content === "string" ? data.content : "";
                  if (content) {
                    setStreamingData((prev) => ({
                      ...prev,
                      reasoning: [
                        ...prev.reasoning,
                        { type: "reasoning", content },
                      ],
                    }));
                  }
                } else if (eventType === "tool") {
                  const name = typeof data.name === "string" ? data.name : "";
                  const duration =
                    typeof data.duration === "number"
                      ? data.duration
                      : undefined;
                  if (name) {
                    setStreamingData((prev) => ({
                      ...prev,
                      tools: [
                        ...prev.tools,
                        {
                          name,
                          input:
                            data.input &&
                            typeof data.input === "object" &&
                            !Array.isArray(data.input)
                              ? (data.input as Record<string, unknown>)
                              : null,
                          output: data.output,
                          duration,
                        },
                      ],
                    }));
                  }
                } else if (eventType === "message") {
                  const complete =
                    typeof data.complete === "boolean" ? data.complete : false;
                  const text =
                    typeof data.text === "string" ? data.text : undefined;

                  if (text && complete) {
                    // Message final reçu, mettre à jour les messages locaux
                    setLocalMessages((prev) => {
                      // Garder le message utilisateur et ajouter/mettre à jour le message assistant
                      const userMessages = prev.filter(
                        (m) => m.role === "user",
                      );
                      const hasAssistant = prev.some(
                        (m) => m.role === "assistant",
                      );

                      if (!hasAssistant) {
                        return [
                          ...userMessages,
                          {
                            role: "assistant",
                            content: text,
                            timestamp: new Date().toISOString(),
                          },
                        ];
                      }
                      // Mettre à jour le contenu du message assistant et garder les messages utilisateur
                      return [
                        ...userMessages,
                        ...prev
                          .filter((m) => m.role === "assistant")
                          .map((m) => ({
                            ...m,
                            content: text,
                          })),
                      ];
                    });
                    setStreamingData((prev) => ({
                      ...prev,
                      isStreaming: false,
                      currentText: text,
                    }));

                    // Rafraîchir la session pour récupérer les messages de la DB
                    // On garde les messages locaux - ils seront automatiquement filtrés par displayMessages
                    // si ils sont déjà dans la session
                    void utils.chat.getSession.invalidate({
                      sessionId: selectedSessionId ?? "",
                    });
                    void utils.chat.getSessions.invalidate();

                    // NE PAS nettoyer localMessages automatiquement
                    // Ils seront filtrés par displayMessages si déjà présents dans la session
                    // On les nettoie seulement quand on envoie un nouveau message
                  } else if (text) {
                    // Mise à jour du texte en cours
                    setStreamingData((prev) => ({
                      ...prev,
                      currentText: text,
                    }));
                  }
                } else if (eventType === "end") {
                  // Finaliser avec le texte actuel si disponible
                  setStreamingData((prev) => {
                    const finalText = prev.currentText;
                    if (finalText) {
                      // Utiliser setTimeout pour éviter les problèmes de closure
                      setTimeout(() => {
                        setLocalMessages((localPrev) => {
                          // Garder les messages utilisateur
                          const userMessages = localPrev.filter(
                            (m) => m.role === "user",
                          );
                          const hasAssistant = localPrev.some(
                            (m) => m.role === "assistant",
                          );

                          if (!hasAssistant) {
                            return [
                              ...userMessages,
                              {
                                role: "assistant",
                                content: finalText,
                                timestamp: new Date().toISOString(),
                              },
                            ];
                          }
                          // Mettre à jour le contenu du message assistant
                          return [
                            ...userMessages,
                            ...localPrev
                              .filter((m) => m.role === "assistant")
                              .map((m) => ({
                                ...m,
                                content: finalText,
                              })),
                          ];
                        });
                      }, 0);
                    }
                    return { ...prev, isStreaming: false };
                  });

                  // Rafraîchir la session
                  void utils.chat.getSession.invalidate({
                    sessionId: selectedSessionId ?? "",
                  });
                  void utils.chat.getSessions.invalidate();

                  // NE PAS nettoyer localMessages automatiquement
                  // Ils seront filtrés par displayMessages si déjà présents dans la session
                } else if (eventType === "error") {
                  console.error("Erreur SSE:", data);
                  setStreamingData((prev) => ({ ...prev, isStreaming: false }));
                }
              } catch (parseError) {
                console.error("Erreur parsing SSE:", parseError);
              }
            }
          }
        }
      } catch (error) {
        console.error("Erreur dans le stream:", error);
        setStreamingData((prev) => ({ ...prev, isStreaming: false }));
      }
    };

    void processStream().catch((error) => {
      console.error("Erreur dans processStream:", error);
      setStreamingData((prev) => ({ ...prev, isStreaming: false }));
    });
  };

  const handleCreateSession = () => {
    createSession.mutate({
      workflowId: activeWorkflow?.id,
    });
  };

  const handleDeleteSession = (sessionId: string) => {
    if (confirm("Êtes-vous sûr de vouloir supprimer cette conversation ?")) {
      deleteSession.mutate({ sessionId });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  const updateSession = api.chat.updateSession.useMutation({
    onSuccess: () => {
      void utils.chat.getSession.invalidate({
        sessionId: selectedSessionId ?? "",
      });
      void utils.chat.getSessions.invalidate();
    },
  });

  const handleWorkflowChange = (workflowId: string) => {
    setSelectedWorkflowId(workflowId);

    // Si une session est sélectionnée, vérifier si elle est vide
    if (selectedSessionId && currentSession) {
      const isSessionEmpty = currentSession.messages.length === 0;

      if (isSessionEmpty) {
        // Mettre à jour la session existante au lieu d'en créer une nouvelle
        updateSession.mutate({
          sessionId: selectedSessionId,
          workflowId,
        });
      } else {
        // Créer une nouvelle session si la session actuelle contient des messages
        createSession.mutate({ workflowId });
      }
    } else if (!selectedSessionId) {
      // Pas de session sélectionnée, créer une nouvelle session
      createSession.mutate({ workflowId });
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 overflow-hidden">
      {/* Sidebar - Liste des sessions */}
      <BlurFade
        delay={0.1}
        className="border-border bg-muted/30 w-80 flex-shrink-0 border-r backdrop-blur-sm"
      >
        <div className="flex h-full flex-col">
          {/* Header avec sélection de workflow */}
          <div className="border-border space-y-3 border-b p-4">
            <Button
              onClick={handleCreateSession}
              className="w-full"
              disabled={createSession.isPending || isLoadingWorkflows}
            >
              <Plus className="mr-2 size-4" />
              Nouvelle conversation
            </Button>

            {/* Sélecteur de workflow */}
            {workflows && workflows.length > 0 && (
              <div className="space-y-2">
                <label className="text-muted-foreground text-xs font-medium">
                  Workflow IA
                </label>
                <Select
                  value={activeWorkflow?.id ?? ""}
                  onValueChange={handleWorkflowChange}
                >
                  <SelectTrigger className="w-full">
                    <div className="flex items-center gap-2">
                      <Sparkles className="text-primary size-4" />
                      <SelectValue placeholder="Sélectionner un workflow" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {workflows.map((workflow) => (
                      <SelectItem key={workflow.id} value={workflow.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">{workflow.name}</span>
                          {workflow.description && (
                            <span className="text-muted-foreground text-xs">
                              {workflow.description}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Liste des sessions */}
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
                            handleDeleteSession(session.id);
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

      {/* Zone de chat principale */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selectedSessionId ? (
          <>
            {/* Header avec info du workflow */}
            {activeWorkflow && (
              <div className="border-border bg-muted/30 border-b py-3 pr-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 flex items-center gap-2 rounded-r-lg py-1.5 pr-3 pl-0">
                      <Sparkles className="text-primary ml-3 size-4" />
                      <span className="text-sm font-medium">
                        {activeWorkflow.name}
                      </span>
                    </div>
                    {activeWorkflow.description && (
                      <span className="text-muted-foreground text-xs">
                        {activeWorkflow.description}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6">
              {isLoadingSession ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="text-muted-foreground size-6 animate-spin" />
                </div>
              ) : displayMessages.length > 0 || streamingData.isStreaming ? (
                <div className="mx-auto max-w-3xl space-y-6">
                  {displayMessages.map((msg, index) => (
                    <BlurFade
                      key={index}
                      delay={index * 0.05}
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
                  {streamingData.isStreaming && (
                    <BlurFade className="flex justify-start gap-4">
                      <div className="bg-primary/10 flex size-8 shrink-0 items-center justify-center rounded-full">
                        <Bot className="text-primary size-4" />
                      </div>
                      <AnimatedCard className="bg-muted max-w-[85%] rounded-2xl px-5 py-4 shadow-sm">
                        {/* Raisonnement */}
                        {streamingData.reasoning.length > 0 && (
                          <div className="border-border/50 mb-4 space-y-2 border-b pb-4">
                            {streamingData.reasoning.map((reasoning, idx) => (
                              <div
                                key={idx}
                                className="text-muted-foreground bg-muted/50 rounded-lg p-3 text-xs"
                              >
                                <div className="mb-1 font-medium">
                                  💭 Raisonnement
                                </div>
                                <div className="whitespace-pre-wrap">
                                  {reasoning.content}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Outils utilisés */}
                        {streamingData.tools.length > 0 && (
                          <div className="border-border/50 mb-4 space-y-2 border-b pb-4">
                            {streamingData.tools.map((tool, idx) => (
                              <div
                                key={idx}
                                className="text-muted-foreground bg-muted/50 rounded-lg p-3 text-xs"
                              >
                                <div className="mb-1 font-medium">
                                  🔧 {tool.name}
                                  {tool.duration && ` (${tool.duration}ms)`}
                                </div>
                                {tool.input && (
                                  <div className="mt-1">
                                    <span className="font-medium">Input:</span>{" "}
                                    <pre className="mt-1 text-xs">
                                      {JSON.stringify(tool.input, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Texte en cours de génération avec rendu markdown en temps réel */}
                        {streamingData.currentText && (
                          <div className="markdown-content relative text-sm leading-relaxed">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {streamingData.currentText}
                            </ReactMarkdown>
                            {streamingData.isStreaming && (
                              <span className="bg-primary ml-1 inline-block h-4 w-0.5 animate-pulse align-middle" />
                            )}
                          </div>
                        )}

                        {/* Indicateur de chargement si pas encore de texte */}
                        {!streamingData.currentText && (
                          <div className="flex items-center gap-3">
                            <Loader2 className="text-muted-foreground size-4 animate-spin" />
                            <span className="text-muted-foreground text-sm">
                              L{"'"}IA réfléchit...
                            </span>
                          </div>
                        )}
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
                        <Sparkles className="text-primary size-8" />
                      </div>
                    </div>
                    <h3 className="mb-2 text-xl font-semibold">
                      Commencez la conversation
                    </h3>
                    <p className="text-muted-foreground mb-6 text-sm">
                      {activeWorkflow
                        ? `Posez une question à ${activeWorkflow.name} pour commencer`
                        : "Envoyez un message pour commencer à discuter avec l'IA"}
                    </p>
                    {activeWorkflow && (
                      <div className="bg-muted/50 rounded-lg border p-4 text-left">
                        <p className="text-muted-foreground mb-2 text-xs font-medium">
                          Workflow actif
                        </p>
                        <p className="text-sm font-medium">
                          {activeWorkflow.name}
                        </p>
                        {activeWorkflow.description && (
                          <p className="text-muted-foreground mt-1 text-xs">
                            {activeWorkflow.description}
                          </p>
                        )}
                      </div>
                    )}
                  </BlurFade>
                </div>
              )}
            </div>

            {/* Input avec design moderne */}
            <div className="border-border bg-background/80 border-t backdrop-blur-sm">
              <div className="mx-auto max-w-3xl p-4">
                <div className="border-border bg-background focus-within:border-primary focus-within:ring-primary/20 relative flex items-end gap-3 rounded-2xl border p-2 shadow-sm transition-all focus-within:ring-2">
                  <Input
                    ref={inputRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={
                      activeWorkflow
                        ? `Posez une question à ${activeWorkflow.name}...`
                        : "Tapez votre message..."
                    }
                    disabled={sendMessage.isPending || !activeWorkflow}
                    className="flex-1 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={
                      !message.trim() ||
                      sendMessage.isPending ||
                      !activeWorkflow
                    }
                    size="icon"
                    className="shrink-0 rounded-xl"
                  >
                    {sendMessage.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </Button>
                </div>
                {!activeWorkflow && (
                  <p className="text-muted-foreground mt-2 text-center text-xs">
                    Sélectionnez un workflow pour commencer
                  </p>
                )}
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
                pour commencer à discuter avec l{"'"}IA
              </p>
              <Button onClick={handleCreateSession} size="lg">
                <Plus className="mr-2 size-4" />
                Nouvelle conversation
              </Button>
            </BlurFade>
          </div>
        )}
      </div>

      {/* Dialog pour les intégrations manquantes */}
      <AlertDialog
        open={missingIntegrationsDialog.open}
        onOpenChange={(open) =>
          setMissingIntegrationsDialog({ ...missingIntegrationsDialog, open })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Intégrations requises</AlertDialogTitle>
            <AlertDialogDescription>
              Les intégrations suivantes doivent être connectées avant d{"'"}
              utiliser ce workflow :
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4">
            <ul className="list-inside list-disc space-y-2">
              {missingIntegrationsDialog.missingIntegrations.map(
                (integration, index) => (
                  <li key={index} className="text-sm">
                    {integration}
                  </li>
                ),
              )}
            </ul>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setMissingIntegrationsDialog({
                  open: false,
                  missingIntegrations: [],
                });
                router.push("/dashboard/integrations");
              }}
            >
              Aller aux intégrations
            </AlertDialogAction>
            <Button
              variant="outline"
              onClick={() =>
                setMissingIntegrationsDialog({
                  open: false,
                  missingIntegrations: [],
                })
              }
            >
              Fermer
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
