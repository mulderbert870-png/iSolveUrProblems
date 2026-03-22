import { VoiceChatState } from "./types";
export declare enum VoiceChatEvent {
    MUTED = "MUTED",
    UNMUTED = "UNMUTED",
    STATE_CHANGED = "STATE_CHANGED",
    WARNING = "WARNING"
}
export type VoiceChatEventCallbacks = {
    [VoiceChatEvent.MUTED]: () => void;
    [VoiceChatEvent.UNMUTED]: () => void;
    [VoiceChatEvent.STATE_CHANGED]: (state: VoiceChatState) => void;
    [VoiceChatEvent.WARNING]: (message: string) => void;
};
