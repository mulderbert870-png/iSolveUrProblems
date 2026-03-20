import { VoiceChatState } from "./types";

export enum VoiceChatEvent {
  MUTED = "MUTED",
  UNMUTED = "UNMUTED",
  // DEVICE_CHANGED = "DEVICE_CHANGED",
  STATE_CHANGED = "STATE_CHANGED",
  WARNING = "WARNING",
}

export type VoiceChatEventCallbacks = {
  [VoiceChatEvent.MUTED]: () => void;
  [VoiceChatEvent.UNMUTED]: () => void;
  // [VoiceChatEvent.DEVICE_CHANGED]: (deviceId: string) => void;
  [VoiceChatEvent.STATE_CHANGED]: (state: VoiceChatState) => void;
  [VoiceChatEvent.WARNING]: (message: string) => void;
};
