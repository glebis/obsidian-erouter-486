export interface MonitoringRule {
    name: string;
    enabled: boolean;
    folders: string[];
    delay: number;
    fileNameTemplate: string;
    prompt: string;
    templateFile: string;
    outputFileNameTemplate: string;
    outputFileName: string;
    outputFileHandling: 'overwrite' | 'append' | 'rename';
}

export interface MonitoringRule {
    enabled: boolean;
    folders: string[];
    delay: number;
    fileNameTemplate: string;
    prompt: string;
    templateFile: string;
    outputFileNameTemplate: string;
    outputFileHandling: 'overwrite' | 'append' | 'rename';
}

export interface ERouter486Settings {
    llmProvider: string;
    apiKey: string;
    apiEndpoint: string;
    modelName: string;
    monitoringRules: MonitoringRule[];
    logFilePath: string;
}

export const DEFAULT_SETTINGS: ERouter486Settings = {
    llmProvider: 'openai',
    apiKey: '',
    apiEndpoint: '',
    modelName: '',
    monitoringRules: [{
        name: 'Default Rule',
        enabled: true,
        folders: [],
        delay: 10,
        fileNameTemplate: '*',
        prompt: '',
        templateFile: '',
        outputFileNameTemplate: '{{filename}}_processed',
        outputFileName: '',
        outputFileHandling: 'append'
    }],
    logFilePath: 'erouter_log.md'
}

export const LLM_PROVIDERS: Record<string, {
    name: string;
    defaultModels: string[];
    needsEndpoint: boolean;
    defaultEndpoint?: string;
}> = {
    groq: {
        name: 'GROQ',
        defaultModels: [
            'distil-whisper-large-v3-en',
            'gemma2-9b-it',
            'gemma-7b-it',
            'llama3-groq-70b-8192-tool-use-preview',
            'llama3-groq-8b-8192-tool-use-preview',
            'llama-3.1-70b-versatile',
            'llama-3.1-8b-instant',
            'llama-guard-3-8b',
            'llama3-70b-8192',
            'llama3-8b-8192',
            'mixtral-8x7b-32768',
            'whisper-large-v3'
        ],
        needsEndpoint: true,
        defaultEndpoint: 'https://api.groq.com/openai/v1'
    }
};

export interface QueueItem {
    content: string;
    prompt: string;
    resolve: (value: string | PromiseLike<string>) => void;
    reject: (reason?: any) => void;
}
