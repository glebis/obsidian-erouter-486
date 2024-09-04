import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, ButtonComponent, TextAreaComponent, DropdownComponent, TextComponent, ToggleComponent } from 'obsidian';

interface MonitoringRule {
    enabled: boolean;
    folders: string[];
    delay: number;
    fileNameTemplate: string;
    prompt: string;
    templateFile: string;
}

interface ERouter486Settings {
    llmProvider: string;
    apiKey: string;
    apiEndpoint: string;
    modelName: string;
    monitoringRules: MonitoringRule[];
}

const DEFAULT_SETTINGS: ERouter486Settings = {
    llmProvider: 'openai',
    apiKey: '',
    apiEndpoint: '',
    modelName: '',
    monitoringRules: []
}

const LLM_PROVIDERS: Record<string, {
    name: string;
    defaultModels: string[];
    needsEndpoint: boolean;
    defaultEndpoint?: string;
}> = {
    openai: {
        name: 'OpenAI',
        defaultModels: ['gpt-3.5-turbo', 'gpt-4'],
        needsEndpoint: false
    },
    anthropic: {
        name: 'Anthropic',
        defaultModels: ['claude-2', 'claude-instant-1'],
        needsEndpoint: false
    },
    groq: {
        name: 'GROQ',
        defaultModels: ['llama2-70b-4096', 'mixtral-8x7b-32768', 'gemma-7b-it'],
        needsEndpoint: true,
        defaultEndpoint: 'https://api.groq.com/openai/v1'
    },
    openrouter: {
        name: 'OpenRouter',
        defaultModels: ['openai/gpt-3.5-turbo', 'anthropic/claude-2'],
        needsEndpoint: true,
        defaultEndpoint: 'https://openrouter.ai/api/v1'
    }
};

export default class ERouter486Plugin extends Plugin {
    settings: ERouter486Settings;

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new ERouter486SettingTab(this.app, this));

        // TODO: Implement folder monitoring
        // TODO: Implement LLM integration
        // TODO: Implement prompt management
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async testLLMConnection(): Promise<{ success: boolean; message: string }> {
        if (!this.settings.apiKey) {
            return { success: false, message: 'API key is empty. Please enter a valid API key.' };
        }

        // This is still a placeholder. Replace with actual API calls for each provider.
        try {
            // Simulating an API call
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Add provider-specific logic here
            switch (this.settings.llmProvider) {
                case 'openai':
                    // OpenAI-specific check
                    break;
                case 'anthropic':
                    // Anthropic-specific check
                    break;
                case 'groq':
                    // GROQ-specific check
                    break;
                case 'openrouter':
                    // OpenRouter-specific check
                    break;
                default:
                    throw new Error('Unknown LLM provider');
            }

            return { success: true, message: 'Connection successful!' };
        } catch (error) {
            console.error('LLM connection test failed:', error);
            return { success: false, message: `Connection failed: ${error.message}` };
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
    }

    addLLMSettings(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('LLM Provider')
            .setDesc('Select the LLM provider to use')
            .addDropdown((dropdown: DropdownComponent) => {
                Object.keys(LLM_PROVIDERS).forEach(key => {
                    dropdown.addOption(key, LLM_PROVIDERS[key].name);
                });
                dropdown.setValue(this.plugin.settings.llmProvider)
                    .onChange(async (value) => {
                        this.plugin.settings.llmProvider = value;
                        await this.plugin.saveSettings();
                        this.updateProviderSpecificSettings(value);
                    });
            });

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
                            templateFile: ''
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
            dropdown.setValue(providerInfo.defaultModels[0]);
        }
    }
}
