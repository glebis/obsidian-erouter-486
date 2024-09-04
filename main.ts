import { App, Plugin, TAbstractFile, TFile, PluginManifest } from 'obsidian';
import { Groq } from 'groq-sdk';
import { ERouter486Settings, DEFAULT_SETTINGS, LLM_PROVIDERS, MonitoringRule } from './types';
import { ERouter486SettingTab } from './settings';
import { FileProcessor } from './fileProcessor';

export default class ERouter486Plugin extends Plugin {
    settings: ERouter486Settings;
    fileProcessor: FileProcessor;

    async checkFolder(folder: string, rule: MonitoringRule): Promise<void> {
        await this.fileProcessor.checkFolder(folder, rule);
    }

    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest);
        this.settings = DEFAULT_SETTINGS;
        this.fileProcessor = new FileProcessor(this.app, this.settings);
    }

    async onload() {
        console.log('Loading ERouter486Plugin');
        await this.loadSettings();

        this.fileProcessor = new FileProcessor(this.app, this.settings);

        this.addSettingTab(new ERouter486SettingTab(this.app, this));

        this.registerEvent(this.app.vault.on('create', this.handleFileChange.bind(this)));
        this.registerEvent(this.app.vault.on('modify', this.handleFileChange.bind(this)));

        this.fileProcessor.startFileMonitoring();
        this.logActiveRules();
        console.log('ERouter486Plugin: Plugin loaded and monitoring started');
    }

    onunload() {
        this.fileProcessor.stopFileMonitoring();
        console.debug('ERouter486Plugin: Plugin unloaded and monitoring stopped');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    logActiveRules() {
        const activeRules = this.settings.monitoringRules.filter(rule => rule.enabled);
        console.log(`Active monitoring rules: ${activeRules.length}`);
        activeRules.forEach((rule, index) => {
            console.log(`Rule ${index + 1}:`);
            console.log(`  Folders: ${rule.folders.join(', ')}`);
            console.log(`  File template: ${rule.fileNameTemplate}`);
            console.log(`  Delay: ${rule.delay} seconds`);
        });
    }

    async handleFileChange(file: TAbstractFile) {
        await this.fileProcessor.handleFileChange(file);
    }

    async testLLMConnection(): Promise<{ success: boolean; message: string }> {
        if (!this.settings.apiKey) {
            return { success: false, message: 'API key is empty. Please enter a valid API key.' };
        }

        try {
            const groq = new Groq({ apiKey: this.settings.apiKey, dangerouslyAllowBrowser: true });
            const chatCompletion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
                model: this.settings.modelName,
            });

            if (chatCompletion.choices && chatCompletion.choices.length > 0) {
                return { success: true, message: 'Connection to GROQ successful!' };
            } else {
                return { success: false, message: 'Connection to GROQ failed: No response received.' };
            }
        } catch (error) {
            console.error('GROQ connection test failed:', error);
            return { success: false, message: `Connection to GROQ failed: ${(error as Error).message}` };
        }
    }

    getProviderInfo(provider: string) {
        return LLM_PROVIDERS[provider] || null;
    }
}
