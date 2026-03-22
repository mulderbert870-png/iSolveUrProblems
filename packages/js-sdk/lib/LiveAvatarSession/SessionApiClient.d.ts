import { SessionInfo } from "./types";
export declare class SessionAPIClient {
    private readonly sessionToken;
    private readonly apiUrl;
    constructor(sessionToken: string, apiUrl?: string);
    private request;
    startSession(): Promise<SessionInfo>;
    stopSession(): Promise<void>;
    keepAlive(): Promise<void>;
}
