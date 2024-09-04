import { TFile, TAbstractFile, Vault } from 'obsidian';
import { Groq } from 'groq-sdk';
import { MonitoringRule, ERouter486Settings, QueueItem } from './types';
import { Notice } from 'obsidian';
import * as Handlebars from 'handlebars';

export class FileProcessor {
    private fileWatchers: Map<string, NodeJS.Timeout> = new Map();
    private requestQueue: QueueItem[] = [];
    private isProcessingQueue: boolean = false;
    private lastRequestTime: number = 0;
    private readonly REQUEST_INTERVAL = 15000; // 15 seconds in milliseconds
    private lastProcessedTimes: Map<string, number> = new Map();
    private fileChangeDebounce: Map<string, NodeJS.Timeout> = new Map();

    constructor(private app: any, private settings: ERouter486Settings) {}

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
        const files = this.app.vault.getFiles().filter((file: TFile) => 
            file.path.startsWith(folder) && 
            this.matchFileNameTemplate(file.name, rule.fileNameTemplate)
        );

        for (const file of files) {
            if (await this.app.vault.adapter.exists(file.path)) {
                const stat = await this.app.vault.adapter.stat(file.path);
                const lastModified = stat.mtime;
                const lastProcessed = this.lastProcessedTimes.get(file.path) || 0;

                if (lastModified > lastProcessed) {
                    await this.processFile(file, rule);
                    this.lastProcessedTimes.set(file.path, Date.now());
                }
            } else {
                console.debug(`ERouter486Plugin: File ${file.path} no longer exists. Removing from lastProcessedTimes.`);
                this.lastProcessedTimes.delete(file.path);
            }
        }
    }

    matchFileNameTemplate(fileName: string, template: string): boolean {
        const regex = new RegExp('^' + template.replace(/\*/g, '.*') + '$');
        return regex.test(fileName);
    }

    async handleFileChange(file: TAbstractFile) {
        if (file instanceof TFile && await this.app.vault.adapter.exists(file.path)) {
            for (const rule of this.settings.monitoringRules) {
                if (rule.enabled && 
                    rule.folders.some(folder => file.path.startsWith(folder)) &&
                    this.matchFileNameTemplate(file.name, rule.fileNameTemplate)) {
                    console.log(`ERouter486Plugin: Rule applied to file ${file.path}`);
                    
                    // Clear any existing timeout for this file
                    if (this.fileChangeDebounce.has(file.path)) {
                        clearTimeout(this.fileChangeDebounce.get(file.path));
                    }
                    
                    // Set a new timeout
                    this.fileChangeDebounce.set(file.path, setTimeout(async () => {
                        console.log(`ERouter486Plugin: Starting delay of ${rule.delay} seconds before processing`);
                        await new Promise(resolve => setTimeout(resolve, rule.delay * 1000));
                        console.log(`ERouter486Plugin: Delay completed. Checking if file still exists.`);
                        if (await this.app.vault.adapter.exists(file.path)) {
                            console.log(`ERouter486Plugin: File ${file.path} still exists. Launching processing.`);
                            await this.processFile(file, rule);
                        } else {
                            console.warn(`ERouter486Plugin: File ${file.path} no longer exists. Skipping processing.`);
                        }
                        this.fileChangeDebounce.delete(file.path);
                    }, rule.delay * 1000)); // Use rule.delay instead of fixed 1 second
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
            console.debug(`ERouter486Plugin: File content read, length: ${content.length}`);
            let prompt = rule.prompt;

            console.debug(`ERouter486Plugin: Sending content to LLM for processing`);
            const processedContent = await this.queueLLMRequest(content, prompt);
            console.debug(`ERouter486Plugin: Received processed content from LLM, length: ${processedContent.length}`);
            
            console.debug(`ERouter486Plugin: Attempting to save processed content`);
            const outputFileName = await this.saveProcessedContent(file, processedContent, rule);
            if (outputFileName) {
                console.debug(`ERouter486Plugin: Content saved successfully to ${outputFileName}`);
                
                if (rule.templateFile && await this.app.vault.adapter.exists(rule.templateFile)) {
                    console.debug(`ERouter486Plugin: Using template file ${rule.templateFile}`);
                    const templateFile = this.app.vault.getAbstractFileByPath(rule.templateFile) as TFile;
                    const templateContent = await this.app.vault.read(templateFile);
                    
                    console.debug(`ERouter486Plugin: Starting template application process`);
                    // Process the template with Templater
                    const templater = this.app.plugins.plugins['templater-obsidian'];
                    if (templater) {
                        console.debug(`ERouter486Plugin: Templater plugin found, applying template`);
                        const outputFile = this.app.vault.getAbstractFileByPath(outputFileName) as TFile;
                        try {
                            await templater.templater.overwrite_file_commands(outputFile, templateContent);
                            console.debug(`ERouter486Plugin: Template successfully applied to output file using Templater`);
                        } catch (error) {
                            console.error(`ERouter486Plugin: Error applying template:`, error);
                            console.debug(`ERouter486Plugin: Falling back to manual template application`);
                            await this.manualTemplateApplication(outputFile, templateContent);
                        }
                    } else {
                        console.warn('ERouter486Plugin: Templater plugin not found. Applying template manually.');
                        const outputFile = this.app.vault.getAbstractFileByPath(outputFileName) as TFile;
                        if (outputFile instanceof TFile) {
                            await this.manualTemplateApplication(outputFile, templateContent);
                        } else {
                            console.error(`ERouter486Plugin: Output file not found: ${outputFileName}`);
                        }
                    }
                    console.debug(`ERouter486Plugin: Template application process completed`);
                } else {
                    console.debug(`ERouter486Plugin: No template file used or file doesn't exist`);
                }

                await this.logOperation('process', file.path, rule, outputFileName);
                this.lastProcessedTimes.set(file.path, Date.now());
                
                if (rule.deleteSourceFile) {
                    console.debug(`ERouter486Plugin: Attempting to delete source file ${file.path}`);
                    try {
                        if (await this.app.vault.adapter.exists(file.path)) {
                            await this.app.vault.delete(file);
                            console.debug(`ERouter486Plugin: Source file ${file.path} deleted successfully`);
                            await this.logOperation('delete', file.path, rule);
                        } else {
                            console.warn(`ERouter486Plugin: Source file ${file.path} no longer exists. Skipping deletion.`);
                        }
                    } catch (error) {
                        console.error(`ERouter486Plugin: Failed to delete source file ${file.path}:`, error);
                    }
                }
            } else {
                console.error(`ERouter486Plugin: Failed to save processed content`);
            }
        } else {
            console.warn(`ERouter486Plugin: File ${file.path} does not exist. Skipping processing.`);
        }
    }

    private async manualTemplateApplication(outputFile: TFile, templateContent: string): Promise<void> {
        try {
            const processedContent = await this.app.vault.read(outputFile);
            const combinedContent = templateContent + '\n' + processedContent;
            await this.app.vault.modify(outputFile, combinedContent);
            console.debug(`ERouter486Plugin: Manual template application completed`);
        } catch (error) {
            console.error(`ERouter486Plugin: Error in manual template application:`, error);
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

        // Replace file links in the prompt with file contents
        prompt = await this.replaceFileLinksWithContent(prompt);

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
                    return `Error processing content after ${maxRetries} attempts: ${(error as Error).message}`;
                }

                if ((error as Error).message.includes('429')) {
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

    private async replaceFileLinksWithContent(text: string): Promise<string> {
        const linkRegex = /\[\[([^\]]+)\]\]/g;
        let match;
        let replacedText = text;

        while ((match = linkRegex.exec(text)) !== null) {
            const fileName = match[1];
            const file = this.app.vault.getAbstractFileByPath(fileName);

            if (file instanceof TFile) {
                try {
                    const fileContent = await this.app.vault.read(file);
                    replacedText = replacedText.replace(match[0], fileContent);
                } catch (error) {
                    console.error(`ERouter486Plugin: Error reading file ${fileName}:`, error);
                    new Notice(`Error reading file ${fileName}. The link will be left as is.`);
                }
            } else {
                console.warn(`ERouter486Plugin: File not found: ${fileName}`);
                new Notice(`File not found: ${fileName}. The link will be left as is.`);
            }
        }

        return replacedText;
    }

    async saveProcessedContent(file: TFile, content: string, rule: MonitoringRule): Promise<string | null> {
        const outputFileName = this.getOutputFileName(file.name, rule.outputFileNameTemplate);
        console.debug(`ERouter486Plugin: Attempting to save content to ${outputFileName}`);
        const outputFile = this.app.vault.getAbstractFileByPath(outputFileName);

        try {
            if (outputFile instanceof TFile) {
                switch (rule.outputFileHandling) {
                    case 'overwrite':
                        await this.app.vault.modify(outputFile, content);
                        console.debug(`ERouter486Plugin: Overwritten file ${outputFileName}`);
                        return outputFileName;
                    case 'append':
                        const existingContent = await this.app.vault.read(outputFile);
                        await this.app.vault.modify(outputFile, existingContent + '\n' + content);
                        console.debug(`ERouter486Plugin: Appended to file ${outputFileName}`);
                        return outputFileName;
                    case 'rename':
                        let newName = outputFileName;
                        let counter = 1;
                        while (this.app.vault.getAbstractFileByPath(newName)) {
                            newName = `${outputFileName}_${counter}`;
                            counter++;
                        }
                        await this.app.vault.create(newName, content);
                        console.debug(`ERouter486Plugin: Created new file ${newName}`);
                        return newName;
                }
            } else {
                await this.app.vault.create(outputFileName, content);
                console.debug(`ERouter486Plugin: Created new file ${outputFileName}`);
                return outputFileName;
            }
        } catch (error) {
            console.error(`ERouter486Plugin: Error saving processed content: ${error}`);
            return null;
        }
        return null;
    }

    getOutputFileName(originalName: string, template: string): string {
        const date = new Date();
        let outputName = template
            .replace(/{{filename}}/g, originalName.replace(/\.[^/.]+$/, ""))
            .replace(/{{date}}/g, date.toISOString().split('T')[0])
            .replace(/{{time}}/g, date.toTimeString().split(' ')[0].replace(/:/g, '-'))
            .replace(/{{extension}}/g, originalName.split('.').pop() || '');
        
        // Ensure the output file has a .md extension
        if (!outputName.toLowerCase().endsWith('.md')) {
            outputName += '.md';
        }
        
        return outputName;
    }

    async logOperation(operation: string, filePath: string, rule: MonitoringRule, outputFileName?: string) {
        if (outputFileName) {
            const inputFileLink = `[[${filePath}]]`;
            const outputFileLink = `[[${outputFileName}]]`;
            const friendlyTime = new Date().toLocaleString('en-US', { 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit', 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit', 
                hour12: false 
            });
            const logEntry = `- ${friendlyTime} ${operation}: ${inputFileLink} → ${outputFileLink}\n  Rule: ${rule.name}\n  Output Template: ${rule.outputFileNameTemplate}\n  Prompt: ${rule.prompt}\n\n`;
            console.debug(`ERouter486Plugin: ${logEntry.trim()}`);
            await this.appendToLogFile(logEntry);
        } else {
            console.debug(`ERouter486Plugin: No output file created or modified for ${filePath}`);
        }
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
