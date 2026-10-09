interface Rule {
    action: string;
    resource: string;
    effect: string;
}
export declare function memoryPolicy(rules: readonly Rule[], scopeId: string): {
    read: boolean;
    share: boolean;
    digest: string;
};
export {};
