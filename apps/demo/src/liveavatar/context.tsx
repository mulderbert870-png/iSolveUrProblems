import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ConnectionQuality,
  LiveAvatarSession,
  SessionState,
  SessionEvent,
  VoiceChatEvent,
  VoiceChatState,
  AgentEventsEnum,
} from "@heygen/liveavatar-web-sdk";
import { LiveAvatarSessionMessage } from "./types";

type LiveAvatarContextProps = {
  sessionRef: React.RefObject<LiveAvatarSession>;

  isMuted: boolean;
  voiceChatState: VoiceChatState;

  sessionState: SessionState;
  isStreamReady: boolean;
  connectionQuality: ConnectionQuality;

  isUserTalking: boolean;
  isAvatarTalking: boolean;

  messages: LiveAvatarSessionMessage[];
  microphoneWarning: string | null;
  /** Call when user or avatar has activity (e.g. sent message, spoke) so inactivity timeout is reset */
  reportActivity: () => void;
  /** Returns true if the last stop was due to inactivity timeout (then clears the flag). Used so UI can avoid auto-restart. */
  wasStoppedDueToInactivity: () => boolean;
};

export const LiveAvatarContext = createContext<LiveAvatarContextProps>({
  sessionRef: {
    current: null,
  } as unknown as React.RefObject<LiveAvatarSession>,
  connectionQuality: ConnectionQuality.UNKNOWN,
  isMuted: true,
  voiceChatState: VoiceChatState.INACTIVE,
  sessionState: SessionState.DISCONNECTED,
  isStreamReady: false,
  isUserTalking: false,
  isAvatarTalking: false,
  messages: [],
  microphoneWarning: null,
  reportActivity: () => {},
  wasStoppedDueToInactivity: () => false,
});

type LiveAvatarContextProviderProps = {
  children: React.ReactNode;
  sessionAccessToken: string;
};

const useSessionState = (sessionRef: React.RefObject<LiveAvatarSession>) => {
  const [sessionState, setSessionState] = useState<SessionState>(
    sessionRef.current?.state || SessionState.INACTIVE,
  );
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>(
    sessionRef.current?.connectionQuality || ConnectionQuality.UNKNOWN,
  );
  const [isStreamReady, setIsStreamReady] = useState<boolean>(false);

  useEffect(() => {
    if (sessionRef.current) {
      sessionRef.current.on(SessionEvent.SESSION_STATE_CHANGED, (state) => {
        setSessionState(state);
        if (state === SessionState.DISCONNECTED) {
          sessionRef.current.removeAllListeners();
          sessionRef.current.voiceChat.removeAllListeners();
          setIsStreamReady(false);
        }
      });
      sessionRef.current.on(SessionEvent.SESSION_STREAM_READY, () => {
        setIsStreamReady(true);
      });
      sessionRef.current.on(
        SessionEvent.SESSION_CONNECTION_QUALITY_CHANGED,
        setConnectionQuality,
      );
    }
  }, [sessionRef]);

  return { sessionState, isStreamReady, connectionQuality };
};

const useVoiceChatState = (sessionRef: React.RefObject<LiveAvatarSession>) => {
  const [isMuted, setIsMuted] = useState(true);
  const [voiceChatState, setVoiceChatState] = useState<VoiceChatState>(
    sessionRef.current?.voiceChat.state || VoiceChatState.INACTIVE,
  );
  const [microphoneWarning, setMicrophoneWarning] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (sessionRef.current) {
      sessionRef.current.voiceChat.on(VoiceChatEvent.MUTED, () => {
        setIsMuted(true);
      });
      sessionRef.current.voiceChat.on(VoiceChatEvent.UNMUTED, () => {
        setIsMuted(false);
      });
      sessionRef.current.voiceChat.on(
        VoiceChatEvent.STATE_CHANGED,
        setVoiceChatState,
      );
      sessionRef.current.voiceChat.on(
        VoiceChatEvent.WARNING,
        (message: string) => {
          setMicrophoneWarning(message);
        },
      );
    }
  }, [sessionRef]);

  return { isMuted, voiceChatState, microphoneWarning };
};

const useTalkingState = (sessionRef: React.RefObject<LiveAvatarSession>) => {
  const [isUserTalking, setIsUserTalking] = useState(false);
  const [isAvatarTalking, setIsAvatarTalking] = useState(false);

  useEffect(() => {
    if (sessionRef.current) {
      sessionRef.current.on(AgentEventsEnum.USER_SPEAK_STARTED, () => {
        setIsUserTalking(true);
      });
      sessionRef.current.on(AgentEventsEnum.USER_SPEAK_ENDED, () => {
        setIsUserTalking(false);
      });
      sessionRef.current.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
        setIsAvatarTalking(true);
      });
      sessionRef.current.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
        setIsAvatarTalking(false);
      });
    }
  }, [sessionRef]);

  return { isUserTalking, isAvatarTalking };
};

// const useChatHistoryState = (
//   sessionRef: React.RefObject<LiveAvatarSession>
// ) => {
//   const [messages, setMessages] = useState<LiveAvatarSessionMessage[]>([]);
//   const currentSenderRef = useRef<MessageSender | null>(null);

//   // useEffect(() => {
//   //   if (sessionRef.current) {
//   //     const handleMessage = (
//   //       sender: MessageSender,
//   //       { task_id, message }: { task_id: string; message: string }
//   //     ) => {
//   //       if (currentSenderRef.current === sender) {
//   //         setMessages((prev) => [
//   //           ...prev.slice(0, -1),
//   //           {
//   //             ...prev[prev.length - 1]!,
//   //             message: [prev[prev.length - 1]!.message, message].join(""),
//   //           },
//   //         ]);
//   //       } else {
//   //         currentSenderRef.current = sender;
//   //         setMessages((prev) => [
//   //           ...prev,
//   //           {
//   //             id: task_id,
//   //             sender: sender,
//   //             message,
//   //             timestamp: Date.now(),
//   //           },
//   //         ]);
//   //       }
//   //     };

//   //     sessionRef.current.on(
//   //       AgentEventsEnum.USER_SPEAK_STARTED,
//   //       (data) => console.log("USER_SPEAK_STARTED", data)
//   //       handleMessage(MessageSender.USER, {
//   //   task_id: data.,
//   //   message: data.text || "",
//   // })
//   //     );
//   //   }
//   // }, [sessionRef]);

//   return { messages };
// };

export const LiveAvatarContextProvider = ({
  children,
  sessionAccessToken,
}: LiveAvatarContextProviderProps) => {
  // Use same-origin proxy so session start/stop/keep-alive go through our API
  // and avoid 403/CORS when calling LiveAvatar from the browser.
  const apiUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api` : "";
  const config = {
    voiceChat: true,
    apiUrl,
  };
  const sessionRef = useRef<LiveAvatarSession>(
    new LiveAvatarSession(sessionAccessToken, config),
  );

  const { sessionState, isStreamReady, connectionQuality } =
    useSessionState(sessionRef);

  const { isMuted, voiceChatState, microphoneWarning } =
    useVoiceChatState(sessionRef);
  const { isUserTalking, isAvatarTalking } = useTalkingState(sessionRef);
  // const { messages } = useChatHistoryState(sessionRef);

  const lastActivityAtRef = useRef(0);
  const stoppedDueToInactivityRef = useRef(false);
  const reportActivity = useCallback(() => {
    lastActivityAtRef.current = Date.now();
  }, []);
  const wasStoppedDueToInactivity = useCallback(() => {
    const v = stoppedDueToInactivityRef.current;
    stoppedDueToInactivityRef.current = false;
    return v;
  }, []);

  // Update last activity on any user or avatar speech
  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    const onActivity = () => {
      lastActivityAtRef.current = Date.now();
    };
    session.on(AgentEventsEnum.USER_SPEAK_STARTED, onActivity);
    session.on(AgentEventsEnum.USER_SPEAK_ENDED, onActivity);
    session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, onActivity);
    session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, onActivity);
    return () => {
      session.off(AgentEventsEnum.USER_SPEAK_STARTED, onActivity);
      session.off(AgentEventsEnum.USER_SPEAK_ENDED, onActivity);
      session.off(AgentEventsEnum.AVATAR_SPEAK_STARTED, onActivity);
      session.off(AgentEventsEnum.AVATAR_SPEAK_ENDED, onActivity);
    };
  }, [sessionRef]);

  // Terminate session after 1 minute of no activity
  const INACTIVITY_TIMEOUT_MS = 60 * 1000;
  const INACTIVITY_CHECK_MS = 15 * 1000;
  useEffect(() => {
    if (sessionState !== SessionState.CONNECTED) return;
    lastActivityAtRef.current = Date.now();
    const intervalId = setInterval(() => {
      if (Date.now() - lastActivityAtRef.current >= INACTIVITY_TIMEOUT_MS) {
        stoppedDueToInactivityRef.current = true;
        sessionRef.current?.stop?.();
      }
    }, INACTIVITY_CHECK_MS);
    return () => clearInterval(intervalId);
  }, [sessionState]);

  return (
    <LiveAvatarContext.Provider
      value={{
        sessionRef,
        sessionState,
        isStreamReady,
        connectionQuality,
        isMuted,
        voiceChatState,
        isUserTalking,
        isAvatarTalking,
        messages: [], // TODO - properly implement chat history
        microphoneWarning,
        reportActivity,
        wasStoppedDueToInactivity,
      }}
    >
      {children}
    </LiveAvatarContext.Provider>
  );
};

export const useLiveAvatarContext = () => {
  return useContext(LiveAvatarContext);
};
