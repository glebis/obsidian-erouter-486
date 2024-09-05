import { App, TFile, TAbstractFile } from 'obsidian';
import { ERouter486Settings, MonitoringRule, QueueItem } from '../types';
import { ContentFilter } from './content_filter';

export class FileProcessor {
    private fileWatchers: Map<string, NodeJS.Timeout> = new Map();
    private requestQueue: QueueItem[] = [];
    private isProcessingQueue: boolean = false;
    private lastRequestTime: number = 0;
    private readonly REQUEST_INTERVAL = 15000; // 15 seconds in milliseconds
    private lastProcessedTimes: Map<string, number> = new Map();
    private fileChangeDebounce: Map<string, NodeJS.Timeout> = new Map();
    private processingFiles: Set<string> = new Set();

    constructor(private app: App, private settings: ERouter486Settings) {}

    async handleFileChange(file: TAbstractFile): Promise<void> {
        if (!(file instanceof TFile)) return;

        const applicableRules = this.settings.monitoringRules.filter((rule: MonitoringRule) => 
            rule.enabled && 
            rule.folders.some((folder: string) => file.path.startsWith(folder))
        );

        for (const rule of applicableRules) {
            const debounceKey = `${file.path}-${rule.name}`;
            if (this.fileChangeDebounce.has(debounceKey)) {
                clearTimeout(this.fileChangeDebounce.get(debounceKey));
            }

            this.fileChangeDebounce.set(debounceKey, setTimeout(() => {
                this.processFile(file, rule);
                this.fileChangeDebounce.delete(debounceKey);
            }, rule.delay * 1000));
        }
    }

    private async processFile(file: TFile, rule: MonitoringRule): Promise<void> {
        console.log(`Processing file: ${file.path}`);
        if (!this.matchesFileNameTemplate(file.name, rule.fileNameTemplate)) {
            console.log(`File ${file.path} does not match template ${rule.fileNameTemplate}`);
            return;
        }

        if (rule.contentRegex && rule.contentRegex.trim() !== '') {
            const content = await this.app.vault.read(file);
            const regex = new RegExp(rule.contentRegex);
            if (!regex.test(content)) {
                console.log(`File ${file.path} content does not match regex ${rule.contentRegex}`);
                return;
            }
        }

        // Implement the rest of the file processing logic here
        // This should include applying the prompt, handling the output, etc.
    }

    private matchesFileNameTemplate(fileName: string, template: string): boolean {
        const regex = new RegExp('^' + template.replace(/\*/g, '.*') + '$');
        return regex.test(fileName);
    }

    startFileMonitoring(): void {
        this.settings.monitoringRules.forEach((rule: MonitoringRule) => {
            if (rule.enabled) {
                rule.folders.forEach((folder: string) => {
                    this.monitorFolder(folder, rule);
                });
            }
        });
    }

    stopFileMonitoring(): void {
        this.fileWatchers.forEach(timeout => clearTimeout(timeout));
        this.fileWatchers.clear();
    }

    private monitorFolder(folder: string, rule: MonitoringRule): void {
        console.log(`Monitoring folder: ${folder}`);
        // Implement folder monitoring logic here
    }

    async checkFolder(folder: string, rule: MonitoringRule): Promise<void> {
        console.log(`Checking folder: ${folder}`);
        const files = this.app.vault.getFiles().filter(file => file.path.startsWith(folder));
        
        for (const file of files) {
            if (this.matchesFileNameTemplate(file.name, rule.fileNameTemplate)) {
                await this.processFile(file, rule);
            }
        }
    }
}
