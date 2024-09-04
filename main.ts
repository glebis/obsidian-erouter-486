import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, ButtonComponent, TextAreaComponent, DropdownComponent, TextComponent, ToggleComponent, TAbstractFile, TFile, Vault } from 'obsidian';
import { Groq } from 'groq-sdk';

interface QueueItem {
    content: string;
    prompt: string;
    resolve: (value: string | PromiseLike<string>) => void;
    reject: (reason?: any) => void;
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

const DEFAULT_SETTINGS: ERouter486Settings = {
    llmProvider: 'openai',
    apiKey: '',
    apiEndpoint: '',
    modelName: '',
    monitoringRules: [{
        enabled: true,
        folders: [],
        delay: 10,
        fileNameTemplate: '*',
        prompt: '',
        templateFile: '',
        outputFileNameTemplate: '{{filename}}_processed',
        outputFileHandling: 'append'
    }],
    logFilePath: 'erouter_log.md'
}

const LLM_PROVIDERS: Record<string, {
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

export default class ERouter486Plugin extends Plugin {
    settings: ERouter486Settings;
    private fileWatchers: Map<string, NodeJS.Timeout> = new Map();
    public app: App;
    private requestQueue: QueueItem[] = [];
    private isProcessingQueue: boolean = false;
    private lastRequestTime: number = 0;
    private readonly REQUEST_INTERVAL = 15000; // 15 seconds in milliseconds

    async onload() {
        console.log('Loading ERouter486Plugin');
        await this.loadSettings();

        this.addSettingTab(new ERouter486SettingTab(this.app, this));

        this.registerEvent(this.app.vault.on('create', this.handleFileChange.bind(this)));
        this.registerEvent(this.app.vault.on('modify', this.handleFileChange.bind(this)));

        this.startFileMonitoring();
        this.logActiveRules();
        console.log('ERouter486Plugin: Plugin loaded and monitoring started');
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

    onunload() {
        this.stopFileMonitoring();
        console.debug('ERouter486Plugin: Plugin unloaded and monitoring stopped');
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
            for (const rule of this.settings.monitoringRules) {
                if (rule.enabled && 
                    rule.folders.some(folder => file.path.startsWith(folder)) &&
                    this.matchFileNameTemplate(file.name, rule.fileNameTemplate)) {
                    console.debug(`ERouter486Plugin: Scheduling processing of file ${file.path} with delay ${rule.delay} seconds`);
                    setTimeout(async () => {
                        if (await this.app.vault.adapter.exists(file.path)) {
                            await this.processFile(file, rule);
                        } else {
                            console.warn(`ERouter486Plugin: File ${file.path} no longer exists. Skipping processing.`);
                        }
                    }, rule.delay * 1000);
                }
            }
        } else if (file instanceof TFile) {
            console.warn(`ERouter486Plugin: File ${file.path} does not exist. Skipping processing.`);
        }
    }

    async processFile(file: TFile, rule: MonitoringRule) {
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

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
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
            return { success: false, message: `Connection to GROQ failed: ${error.message}` };
        }
    }

    getProviderInfo(provider: string) {
        return LLM_PROVIDERS[provider] || null;
    }
}

class ERouter486SettingTab extends PluginSettingTab {
    plugin: ERouter486Plugin;
    private apiEndpointSetting: Setting;
    private modelNameSetting: Setting;

    constructor(app: App, plugin: ERouter486Plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

        containerEl.createEl('h2', {text: 'eRouter 486 Settings'});

        this.addLLMSettings(containerEl);
        this.addMonitoringRulesSettings(containerEl);
        this.addLogSettings(containerEl);
    }

    addLLMSettings(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('LLM Provider')
            .setDesc('Currently only GROQ is supported')
            .addText(text => text.setValue('GROQ').setDisabled(true));

        this.plugin.settings.llmProvider = 'groq';

        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter the API key for the selected LLM provider')
            .addText((text: TextComponent) => {
                text
                    .setPlaceholder('Enter API key')
                    .setValue(this.plugin.settings.apiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.apiKey = value.trim();
                        await this.plugin.saveSettings();
                    });
            });

        this.apiEndpointSetting = new Setting(containerEl)
            .setName('API Endpoint')
            .setDesc('Enter the API endpoint for the selected LLM provider (if applicable)')
            .addText((text: TextComponent) => {
                text
                    .setPlaceholder('Enter API endpoint')
                    .setValue(this.plugin.settings.apiEndpoint)
                    .onChange(async (value) => {
                        this.plugin.settings.apiEndpoint = value.trim();
                        await this.plugin.saveSettings();
                    });
            });

        this.modelNameSetting = new Setting(containerEl)
            .setName('Model Name')
            .setDesc('Select the model to use')
            .addDropdown((dropdown: DropdownComponent) => {
                const providerInfo = this.plugin.getProviderInfo(this.plugin.settings.llmProvider);
                if (providerInfo) {
                    providerInfo.defaultModels.forEach((model: string) => {
                        dropdown.addOption(model, model);
                    });
                }
                dropdown.setValue(this.plugin.settings.modelName)
                    .onChange(async (value) => {
                        this.plugin.settings.modelName = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Test LLM Connection')
            .setDesc('Click to test the connection to the LLM provider')
            .addButton((button: ButtonComponent) => {
                button
                    .setButtonText('Test Connection')
                    .setCta()
                    .onClick(async () => {
                        button.setButtonText('Testing...');
                        button.setDisabled(true);
                        const { success, message } = await this.plugin.testLLMConnection();
                        new Notice(message);
                        button.setButtonText('Test Connection');
                        button.setDisabled(false);
                    });
            });

        this.updateProviderSpecificSettings(this.plugin.settings.llmProvider);
    }

    addMonitoringRulesSettings(containerEl: HTMLElement): void {
        containerEl.createEl('h3', {text: 'Monitoring Rules'});

        this.plugin.settings.monitoringRules.forEach((rule, index) => {
            this.addMonitoringRuleSettings(containerEl, rule, index);
        });

        new Setting(containerEl)
            .setName('Add New Rule')
            .addButton((button: ButtonComponent) => {
                button
                    .setButtonText('Add Rule')
                    .setCta()
                    .onClick(() => {
                        this.plugin.settings.monitoringRules.push({
                            enabled: true,
                            folders: [],
                            delay: 10,
                            fileNameTemplate: '',
                            prompt: '',
                            templateFile: '',
                            outputFileNameTemplate: '{{filename}}_processed',
                            outputFileHandling: 'append'
                        });
                        this.plugin.saveSettings();
                        this.display();
                    });
            });
    }

    addMonitoringRuleSettings(containerEl: HTMLElement, rule: MonitoringRule, index: number): void {
        const ruleContainer = containerEl.createDiv();
        ruleContainer.createEl('h4', {text: `Rule ${index + 1}`});

        new Setting(ruleContainer)
            .setName('Enable Rule')
            .addToggle((toggle: ToggleComponent) => {
                toggle
                    .setValue(rule.enabled)
                    .onChange(async (value) => {
                        rule.enabled = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(ruleContainer)
            .setName('Monitored Folders')
            .setDesc('Enter folder paths to monitor (one per line)')
            .addTextArea((text: TextAreaComponent) => {
                text
                    .setPlaceholder('Enter folder paths')
                    .setValue(rule.folders.join('\n'))
                    .onChange(async (value) => {
                        rule.folders = value.split('\n').map(folder => folder.trim()).filter(folder => folder !== '');
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 3;
                text.inputEl.cols = 50;
            });

        new Setting(ruleContainer)
            .setName('Processing Delay (seconds)')
            .setDesc('Set the delay before processing files')
            .addText((text: TextComponent) => {
                text
                    .setPlaceholder('Enter delay in seconds')
                    .setValue(rule.delay.toString())
                    .onChange(async (value) => {
                        const delay = parseInt(value);
                        if (!isNaN(delay) && delay >= 0) {
                            rule.delay = delay;
                            await this.plugin.saveSettings();
                        }
                    });
            });

        new Setting(ruleContainer)
            .setName('File Name Template')
            .setDesc('Enter a regex pattern to match file names')
            .addText((text: TextComponent) => {
                text
                    .setPlaceholder('Enter file name template')
                    .setValue(rule.fileNameTemplate)
                    .onChange(async (value) => {
                        rule.fileNameTemplate = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(ruleContainer)
            .setName('Prompt')
            .setDesc('Enter the prompt to be applied')
            .addTextArea((text: TextAreaComponent) => {
                text
                    .setPlaceholder('Enter prompt')
                    .setValue(rule.prompt)
                    .onChange(async (value) => {
                        rule.prompt = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 5;
                text.inputEl.cols = 50;
            });

        new Setting(ruleContainer)
            .setName('Template File')
            .setDesc('Enter the path to an optional template file')
            .addText((text: TextComponent) => {
                text
                    .setPlaceholder('Enter template file path')
                    .setValue(rule.templateFile)
                    .onChange(async (value) => {
                        rule.templateFile = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(ruleContainer)
            .setName('Output File Name Template')
            .setDesc('Enter the template for the output file name')
            .addText((text: TextComponent) => {
                text
                    .setPlaceholder('Enter output file name template')
                    .setValue(rule.outputFileNameTemplate || '{{filename}}_processed')
                    .onChange(async (value) => {
                        rule.outputFileNameTemplate = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(ruleContainer)
            .setName('Output File Name Variables')
            .setDesc('Available variables: {{filename}}, {{date}}, {{time}}, {{extension}}')
            .setClass('setting-item-description');

        new Setting(ruleContainer)
            .setName('Output File Handling')
            .setDesc('Choose how to handle existing output files')
            .addDropdown((dropdown: DropdownComponent) => {
                dropdown
                    .addOption('overwrite', 'Overwrite')
                    .addOption('append', 'Append')
                    .addOption('rename', 'Rename')
                    .setValue(rule.outputFileHandling || 'append')
                    .onChange(async (value) => {
                        rule.outputFileHandling = value as 'overwrite' | 'append' | 'rename';
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(ruleContainer)
            .setName('Remove Rule')
            .addButton((button: ButtonComponent) => {
                button
                    .setButtonText('Remove')
                    .setWarning()
                    .onClick(() => {
                        this.plugin.settings.monitoringRules.splice(index, 1);
                        this.plugin.saveSettings();
                        this.display();
                    });
            });
    }

    updateProviderSpecificSettings(provider: string): void {
        const providerInfo = this.plugin.getProviderInfo(provider);
        if (providerInfo) {
            this.apiEndpointSetting.settingEl.style.display = providerInfo.needsEndpoint ? 'block' : 'none';
            if (providerInfo.needsEndpoint && providerInfo.defaultEndpoint) {
                (this.apiEndpointSetting.components[0] as TextComponent).setValue(providerInfo.defaultEndpoint);
            }

            const dropdown = this.modelNameSetting.components[0] as DropdownComponent;
            dropdown.selectEl.empty();
            providerInfo.defaultModels.forEach((model: string) => {
                dropdown.addOption(model, model);
            });
            dropdown.setValue('llama-3.1-8b-instant');
        }
    }

    addLogSettings(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('Log File Name')
            .setDesc('Enter the name of the log file (including extension)')
            .addText((text: TextComponent) => {
                text
                    .setPlaceholder('Enter log file name')
                    .setValue(this.plugin.settings.logFilePath)
                    .onChange(async (value) => {
                        this.plugin.settings.logFilePath = value.trim();
                        await this.plugin.saveSettings();
                    });
            });
    }
}
