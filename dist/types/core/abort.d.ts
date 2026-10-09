export declare function abortable<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T>;
