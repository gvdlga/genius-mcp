import { Request } from "express";

type AuthData = {
    geniusKey?: string,
    apiKey?: string,
    userId?: string,
    password?: string,
    accessToken?: string,
    expiresAt?: Date
};

export interface ApiKeyManagerOptions {
    mcpName: string;
    dashboardUrl?: string;
}

export class ApiKeyManager {

    private static instance: ApiKeyManager;
    private apiKeys: { [sessionId: string]: AuthData } = {};
    private mcpName: string;
    private dashboardUrl: string;

    private constructor(options: ApiKeyManagerOptions) {
        this.mcpName = options.mcpName;
        this.dashboardUrl = options.dashboardUrl || "https://dashboard.geniusagents.nl/api/mcp";
    }

    public static initialize(options: ApiKeyManagerOptions): void {
        if (ApiKeyManager.instance) {
            throw new Error("ApiKeyManager has already been initialized.");
        }
        ApiKeyManager.instance = new ApiKeyManager(options);
    }

    public static getInstance(): ApiKeyManager {
        if (!ApiKeyManager.instance) {
            throw new Error("ApiKeyManager has not been initialized. Call initialize() first.");
        }
        return ApiKeyManager.instance;
    }

    getAuthType(sessionId: string): string {
        const authData = this.getAuthData(sessionId);
        if (authData.apiKey) {
            return "apiKey";
        }
        if (authData.accessToken && authData.expiresAt) {
            return "oauth2";
        }
        if (authData.userId && authData.password) {
            return "basic";
        }
        return "invalid";
    }

    getAuthData(sessionId: string): AuthData {
        return this.apiKeys[sessionId];
    }

    getApiKey(sessionId: string): string | undefined {
        const authData = this.apiKeys[sessionId];
        return authData ? authData.apiKey : undefined;
    }

    async getAccessToken(sessionId: string): Promise<string | undefined> {
        let authData: AuthData | undefined = this.apiKeys[sessionId];
        if (authData && this.isExpired(authData)) {
            authData = await this.loadAuthDataFromDashboard(authData.geniusKey!);
        }
        return authData ? authData.accessToken : undefined;
    }

    getUserId(sessionId: string): string | undefined {
        const authData = this.apiKeys[sessionId];
        return authData ? authData.userId : undefined;
    }

    getPassword(sessionId: string): string | undefined {
        const authData = this.apiKeys[sessionId];
        return authData ? authData.password : undefined;
    }

    setAuthData(sessionId: string, authData: AuthData) {
        this.apiKeys[sessionId] = authData;
    }

    private isExpired(authData: AuthData): boolean {
        if (authData.expiresAt) {
            const now = new Date();
            return now >= authData.expiresAt;
        }
        return false;
    }

    private async loadAuthDataFromDashboard(geniusKey: string): Promise<AuthData | undefined> {
        let authData: AuthData | undefined = undefined;
        const result = await fetch(`${this.dashboardUrl}?mcpName=${this.mcpName}`, {
            method: 'GET',
            headers: {
                'x-api-key': geniusKey
            }
        });
        if (result.ok) {
            const data = await result.json();
            if (data.apiKey) {
                authData = {
                    apiKey: data.apiKey,
                    geniusKey: geniusKey
                };
            } else if (data.accessToken && data.expiresAt) {
                authData = {
                    accessToken: data.accessToken,
                    expiresAt: new Date(data.expiresAt),
                    geniusKey: geniusKey
                };
            } else if (data.userId && data.password) {
                authData = {
                    userId: data.userId,
                    password: data.password,
                    geniusKey: geniusKey
                };
            }
        }
        return authData;
    }

    async loadAuthData(req: Request): Promise<AuthData | undefined> {
        const headers = req.headers;
        const sessionId = req.query.sessionId as string;
        let authData: AuthData | undefined = this.getAuthData(sessionId);
        if (!authData) {
            if (headers) {
                const apiKey: string | string[] | undefined = req.headers['x-api-key'];
                if (apiKey && typeof apiKey === "string" && apiKey.startsWith("genius")) {
                    //We found a Genius API key, now read the actuel key from the genius dashboard by authenticating at the /api/mcp endpoint
                    authData = await this.loadAuthDataFromDashboard(apiKey);
                } else if (headers.authorization && headers.authorization.startsWith("Bearer")) {
                    // We found a Bearer token, use it as API key
                    const apiKey = headers.authorization.substring(7, headers.authorization.length);
                    authData = { apiKey: apiKey };
                }
            }
            if (authData) {
                this.setAuthData(sessionId, authData);
            }
        }
        return authData
    }

}