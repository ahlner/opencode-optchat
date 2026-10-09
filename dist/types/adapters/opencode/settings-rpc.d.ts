export interface Settings {
    enabled: boolean;
    database: string;
    scopeId: string;
    compactorModel?: {
        providerID: string;
        id: string;
    };
    memoryBytes: number;
    safetyTokens: number;
    waitMs: number;
}
export declare const SettingsRpc: {
    readonly id: "optchat.settings";
    readonly methods: {
        readonly read: {
            readonly input: {
                readonly type: "object";
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly enabled: {
                        readonly type: "boolean";
                    };
                    readonly database: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly scopeId: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly compactorModel: {
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly providerID: {
                                readonly type: "string";
                                readonly minLength: 1;
                            };
                            readonly id: {
                                readonly type: "string";
                                readonly minLength: 1;
                            };
                        };
                        readonly required: readonly ["providerID", "id"];
                    };
                    readonly memoryBytes: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly safetyTokens: {
                        readonly type: "integer";
                        readonly minimum: 256;
                    };
                    readonly waitMs: {
                        readonly type: "integer";
                        readonly minimum: 1;
                        readonly maximum: 300000;
                    };
                };
                readonly required: readonly ["enabled", "database", "scopeId", "memoryBytes", "safetyTokens", "waitMs"];
            };
        };
        readonly write: {
            input: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly enabled: {
                        readonly type: "boolean";
                    };
                    readonly database: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly scopeId: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly compactorModel: {
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly providerID: {
                                readonly type: "string";
                                readonly minLength: 1;
                            };
                            readonly id: {
                                readonly type: "string";
                                readonly minLength: 1;
                            };
                        };
                        readonly required: readonly ["providerID", "id"];
                    };
                    readonly memoryBytes: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly safetyTokens: {
                        readonly type: "integer";
                        readonly minimum: 256;
                    };
                    readonly waitMs: {
                        readonly type: "integer";
                        readonly minimum: 1;
                        readonly maximum: 300000;
                    };
                };
                readonly required: readonly ["enabled", "database", "scopeId", "memoryBytes", "safetyTokens", "waitMs"];
            };
            output: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly enabled: {
                        readonly type: "boolean";
                    };
                    readonly database: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly scopeId: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly compactorModel: {
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly providerID: {
                                readonly type: "string";
                                readonly minLength: 1;
                            };
                            readonly id: {
                                readonly type: "string";
                                readonly minLength: 1;
                            };
                        };
                        readonly required: readonly ["providerID", "id"];
                    };
                    readonly memoryBytes: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly safetyTokens: {
                        readonly type: "integer";
                        readonly minimum: 256;
                    };
                    readonly waitMs: {
                        readonly type: "integer";
                        readonly minimum: 1;
                        readonly maximum: 300000;
                    };
                };
                readonly required: readonly ["enabled", "database", "scopeId", "memoryBytes", "safetyTokens", "waitMs"];
            };
        };
        readonly status: {
            readonly input: {
                readonly type: "object";
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly enabled: {
                        readonly type: "boolean";
                    };
                    readonly databaseExists: {
                        readonly type: "boolean";
                    };
                    readonly sessions: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly originals: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly summaries: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly publications: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly activeTurns: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly nativeTurns: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly lastError: {
                        readonly type: "string";
                    };
                    readonly jobs: {
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly pending: {
                                readonly type: "integer";
                                readonly minimum: 0;
                            };
                            readonly running: {
                                readonly type: "integer";
                                readonly minimum: 0;
                            };
                            readonly expired: {
                                readonly type: "integer";
                                readonly minimum: 0;
                            };
                            readonly failed: {
                                readonly type: "integer";
                                readonly minimum: 0;
                            };
                            readonly done: {
                                readonly type: "integer";
                                readonly minimum: 0;
                            };
                            readonly revoked: {
                                readonly type: "integer";
                                readonly minimum: 0;
                            };
                        };
                        readonly required: readonly ["pending", "running", "expired", "failed", "done", "revoked"];
                    };
                };
                readonly required: readonly ["enabled", "databaseExists", "sessions", "originals", "summaries", "publications", "activeTurns", "jobs"];
            };
        };
        readonly retry: {
            readonly input: {
                readonly type: "object";
                readonly additionalProperties: false;
            };
            readonly output: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly enabled: {
                        readonly type: "boolean";
                    };
                    readonly databaseExists: {
                        readonly type: "boolean";
                    };
                    readonly sessions: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly originals: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly summaries: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly publications: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly activeTurns: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly nativeTurns: {
                        readonly type: "integer";
                        readonly minimum: 0;
                    };
                    readonly lastError: {
                        readonly type: "string";
                    };
                    readonly jobs: {
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly pending: {
                                readonly type: "integer";
                                readonly minimum: 0;
                            };
                            readonly running: {
                                readonly type: "integer";
                                readonly minimum: 0;
                            };
                            readonly expired: {
                                readonly type: "integer";
                                readonly minimum: 0;
                            };
                            readonly failed: {
                                readonly type: "integer";
                                readonly minimum: 0;
                            };
                            readonly done: {
                                readonly type: "integer";
                                readonly minimum: 0;
                            };
                            readonly revoked: {
                                readonly type: "integer";
                                readonly minimum: 0;
                            };
                        };
                        readonly required: readonly ["pending", "running", "expired", "failed", "done", "revoked"];
                    };
                };
                readonly required: readonly ["enabled", "databaseExists", "sessions", "originals", "summaries", "publications", "activeTurns", "jobs"];
            };
        };
    };
    readonly events: {};
};
