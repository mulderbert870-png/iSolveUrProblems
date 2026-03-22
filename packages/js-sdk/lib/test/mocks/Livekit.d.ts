import { EventEmitter } from "events";
import { ConnectionQuality, ConnectionState } from "livekit-client";
export declare class LocalParticipantMock extends EventEmitter {
    constructor();
    publishTrack: import("vitest").Mock<() => Promise<void>>;
    getTrackPublications(): never[];
    _triggerConnectionQualityChanged: (quality: ConnectionQuality) => void;
}
export declare class RoomMock extends EventEmitter {
    constructor();
    name: string;
    sid: string;
    remoteParticipants: Map<any, any>;
    localParticipant: LocalParticipantMock;
    participants: Map<any, any>;
    state: string;
    connect: import("vitest").Mock<() => Promise<this>>;
    prepareConnection: import("vitest").Mock<() => Promise<void>>;
    disconnect: import("vitest").Mock<() => Promise<void>>;
    engine: {
        pcManager: {
            subscriber: {
                _pc: {};
            };
        };
    };
    _triggerTrackSubscribed(kind: string): void;
    _triggerDataReceived(data: any): void;
    _triggerConnectionStateChanged(state: ConnectionState): void;
    _triggerConnectionQualityChanged(quality: ConnectionQuality): void;
}
