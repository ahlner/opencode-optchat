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
    };
    readonly events: {};
};
