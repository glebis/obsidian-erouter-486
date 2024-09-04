import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, ButtonComponent, TextAreaComponent, DropdownComponent, TextComponent } from 'obsidian';

interface ERouter486Settings {
    folders: string[];
    llmProvider: string;
    apiKey: string;
    apiEndpoint: string;
}

const DEFAULT_SETTINGS: ERouter486Settings = {
    folders: [],
    llmProvider: 'openai',
    apiKey: '',
    apiEndpoint: ''
}

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
}

class ERouter486SettingTab extends PluginSettingTab {
    plugin: ERouter486Plugin;
    private apiEndpointSetting: Setting;

    constructor(app: App, plugin: ERouter486Plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

        containerEl.createEl('h2', {text: 'eRouter 486 Settings'});

        new Setting(containerEl)
            .setName('Monitored Folders')
            .setDesc('Enter folder paths to monitor (one per line)')
            .addTextArea((text: TextAreaComponent) => {
                text
                    .setPlaceholder('Enter folder paths')
                    .setValue(this.plugin.settings.folders.join('\n'))
                    .onChange(async (value) => {
                        this.plugin.settings.folders = value.split('\n').map(folder => folder.trim()).filter(folder => folder !== '');
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 4;
                text.inputEl.cols = 50;
            });

        new Setting(containerEl)
            .setName('LLM Provider')
            .setDesc('Select the LLM provider to use')
            .addDropdown((dropdown: DropdownComponent) => {
                dropdown
                    .addOption('openai', 'OpenAI')
                    .addOption('anthropic', 'Anthropic')
                    .addOption('groq', 'GROQ')
                    .addOption('openrouter', 'OpenRouter')
                    .setValue(this.plugin.settings.llmProvider)
                    .onChange(async (value) => {
                        this.plugin.settings.llmProvider = value;
                        await this.plugin.saveSettings();
                        this.updateApiEndpointVisibility(value);
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

        this.updateApiEndpointVisibility(this.plugin.settings.llmProvider);

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
    }

    updateApiEndpointVisibility(provider: string) {
        // Show API Endpoint setting only for providers that need it
        const needsEndpoint = ['openrouter', 'groq'].includes(provider);
        this.apiEndpointSetting.settingEl.style.display = needsEndpoint ? 'block' : 'none';
    }
}
