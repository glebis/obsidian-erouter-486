import { TFile, TAbstractFile, Vault } from 'obsidian';
import { Groq } from 'groq-sdk';
import { MonitoringRule, ERouter486Settings } from './types';

export class FileProcessor {
    private fileWatchers: Map<string, NodeJS.Timeout> = new Map();
    private requestQueue: QueueItem[] = [];
    private isProcessingQueue: boolean = false;
    private lastRequestTime: number = 0;
    private readonly REQUEST_INTERVAL = 15000; // 15 seconds in milliseconds
    private pluginInitTime: number;

    constructor(private app: any, private settings: ERouter486Settings) {
        this.pluginInitTime = Date.now();
    }

    startFileMonitoring() {
        this.settings.monitoringRules.forEach(rule => {
            if (rule.enabled) {
                rule.folders.forEach(folder => {
                    const watcher = setInterval(() => this.checkFolder(folder, rule), rule.delay * 1000);
                    this.fileWatchers.set(`${folder}-${rule.fileNameTemplate}`, watcher);
                    console.debug(`ERouter486Plugin: Started monitoring folder ${folder} with template ${rule.fileNameTemplate}`);
                });
            }
        });
    }

    stopFileMonitoring() {
        this.fileWatchers.forEach(watcher => clearInterval(watcher));
        this.fileWatchers.clear();
        console.debug('ERouter486Plugin: Stopped all file monitoring');
    }

    async checkFolder(folder: string, rule: MonitoringRule) {
        const files = this.app.vault.getFiles().filter(file => 
            file.path.startsWith(folder) && 
            this.matchFileNameTemplate(file.name, rule.fileNameTemplate)
        );

        for (const file of files) {
            await this.processFile(file, rule);
        }
    }

    matchFileNameTemplate(fileName: string, template: string): boolean {
        const regex = new RegExp('^' + template.replace(/\*/g, '.*') + '$');
        return regex.test(fileName);
    }

    async handleFileChange(file: TAbstractFile) {
        if (file instanceof TFile && await this.app.vault.adapter.exists(file.path)) {
            const stat = await this.app.vault.adapter.stat(file.path);
            if (stat) {
                const fileModTime = stat.mtime;

                if (fileModTime > this.pluginInitTime) {
                    for (const rule of this.settings.monitoringRules) {
                        if (rule.enabled && 
                            rule.folders.some(folder => file.path.startsWith(folder)) &&
                            this.matchFileNameTemplate(file.name, rule.fileNameTemplate)) {
                            console.log(`ERouter486Plugin: Rule applied to file ${file.path}`);
                            console.log(`ERouter486Plugin: Starting delay of ${rule.delay} seconds before processing`);
                            setTimeout(async () => {
                                console.log(`ERouter486Plugin: Delay completed. Launching processing for file ${file.path}`);
                                if (await this.app.vault.adapter.exists(file.path)) {
                                    await this.processFile(file, rule);
                                } else {
                                    console.warn(`ERouter486Plugin: File ${file.path} no longer exists. Skipping processing.`);
                                }
                            }, rule.delay * 1000);
                        }
                    }
                } else {
                    console.log(`ERouter486Plugin: File ${file.path} was not modified after plugin initialization. Skipping processing.`);
                }
            }
        } else if (file instanceof TFile) {
            console.warn(`ERouter486Plugin: File ${file.path} does not exist. Skipping processing.`);
        }
    }

    async processFile(file: TFile, rule: MonitoringRule): Promise<void> {
        console.debug(`ERouter486Plugin: Processing file ${file.path} with rule ${JSON.stringify(rule)}`);
        if (await this.app.vault.adapter.exists(file.path)) {
            const content = await this.app.vault.read(file);
            const processedContent = await this.queueLLMRequest(content, rule.prompt);
            await this.saveProcessedContent(file, processedContent, rule);
            await this.logOperation('process', file.path, rule);
        } else {
            console.warn(`ERouter486Plugin: File ${file.path} does not exist. Skipping processing.`);
        }
    }

    async queueLLMRequest(content: string, prompt: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ content, prompt, resolve, reject });
            this.processQueue();
        });
    }

    private async processQueue() {
        if (this.isProcessingQueue || this.requestQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        while (this.requestQueue.length > 0) {
            const now = Date.now();
            const timeSinceLastRequest = now - this.lastRequestTime;

            if (timeSinceLastRequest < this.REQUEST_INTERVAL) {
                const waitTime = this.REQUEST_INTERVAL - timeSinceLastRequest;
                console.debug(`ERouter486Plugin: Rate limiting - Waiting ${waitTime}ms before processing next request`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }

            const { content, prompt, resolve, reject } = this.requestQueue.shift()!;

            try {
                const result = await this.processWithLLM(content, prompt);
                resolve(result);
            } catch (error) {
                console.error('ERouter486Plugin: Error processing LLM request:', error);
                reject(error);
            }

            this.lastRequestTime = Date.now();
        }

        this.isProcessingQueue = false;
    }

    async processWithLLM(content: string, prompt: string): Promise<string> {
        console.debug(`ERouter486Plugin: Processing content with LLM, prompt: ${prompt}`);
    
        const groq = new Groq({ apiKey: this.settings.apiKey, dangerouslyAllowBrowser: true });
    
        const maxRetries = 3;
        const delayBetweenRetries = 2000; // 2 seconds

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.debug(`ERouter486Plugin: Making LLM request (attempt ${attempt}/${maxRetries})`);

                const chatCompletion = await groq.chat.completions.create({
                    messages: [
                        { role: 'system', content: 'You are a helpful assistant.' },
                        { role: 'user', content: `${prompt}\n\nContent: ${content}` }
                    ],
                    model: this.settings.modelName,
                });

                console.debug(`ERouter486Plugin: LLM request successful`);
                return chatCompletion.choices[0]?.message?.content || 'No response from LLM';
            } catch (error) {
                console.error(`ERouter486Plugin: Error processing with LLM (attempt ${attempt}/${maxRetries}):`, error);
            
                if (attempt === maxRetries) {
                    return `Error processing content after ${maxRetries} attempts: ${error.message}`;
                }

                if (error.message.includes('429')) {
                    console.debug(`ERouter486Plugin: Rate limit reached. Waiting ${delayBetweenRetries}ms before retrying...`);
                    await new Promise(resolve => setTimeout(resolve, delayBetweenRetries));
                } else {
                    throw error; // If it's not a rate limit error, throw it immediately
                }
            }
        }
    
        // This line ensures the function always returns a string
        return 'Unexpected error occurred while processing with LLM';
    }

    async saveProcessedContent(file: TFile, content: string, rule: MonitoringRule) {
        const outputFileName = this.getOutputFileName(file.name, rule.outputFileNameTemplate);
        const outputFile = this.app.vault.getAbstractFileByPath(outputFileName);

        if (outputFile instanceof TFile) {
            switch (rule.outputFileHandling) {
                case 'overwrite':
                    await this.app.vault.modify(outputFile, content);
                    console.debug(`ERouter486Plugin: Overwritten file ${outputFileName}`);
                    break;
                case 'append':
                    const existingContent = await this.app.vault.read(outputFile);
                    await this.app.vault.modify(outputFile, existingContent + '\n' + content);
                    console.debug(`ERouter486Plugin: Appended to file ${outputFileName}`);
                    break;
                case 'rename':
                    let newName = outputFileName;
                    let counter = 1;
                    while (this.app.vault.getAbstractFileByPath(newName)) {
                        newName = `${outputFileName}_${counter}`;
                        counter++;
                    }
                    await this.app.vault.create(newName, content);
                    console.debug(`ERouter486Plugin: Created new file ${newName}`);
                    break;
            }
        } else {
            await this.app.vault.create(outputFileName, content);
            console.debug(`ERouter486Plugin: Created new file ${outputFileName}`);
        }
    }

    getOutputFileName(originalName: string, template: string): string {
        const date = new Date();
        return template
            .replace(/{{filename}}/g, originalName.replace(/\.[^/.]+$/, ""))
            .replace(/{{date}}/g, date.toISOString().split('T')[0])
            .replace(/{{time}}/g, date.toTimeString().split(' ')[0].replace(/:/g, '-'))
            .replace(/{{extension}}/g, originalName.split('.').pop() || '');
    }

    async logOperation(operation: string, filePath: string, rule: MonitoringRule) {
        const wikiLink = operation === 'create' ? `[[${filePath}]]` : filePath;
        const logEntry = `- [${new Date().toISOString()}] ${operation}: ${wikiLink} (Rule: ${JSON.stringify(rule)})\n`;
        console.debug(`ERouter486Plugin: ${logEntry.trim()}`);
        await this.appendToLogFile(logEntry);
    }

    async appendToLogFile(content: string) {
        const logFile = this.app.vault.getAbstractFileByPath(this.settings.logFilePath);
        if (logFile instanceof TFile) {
            const existingContent = await this.app.vault.read(logFile);
            await this.app.vault.modify(logFile, existingContent + content);
        } else {
            await this.app.vault.create(this.settings.logFilePath, content);
        }
    }
}
