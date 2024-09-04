import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, ButtonComponent } from 'obsidian';

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

    async testLLMConnection(): Promise<boolean> {
        // This is a placeholder implementation. You should replace this with actual API calls to the selected LLM provider.
        try {
            // Simulating an API call
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // For demonstration purposes, we're considering the connection successful if the API key is not empty
            if (this.settings.apiKey.trim() !== '') {
                return true;
            } else {
                throw new Error('API key is empty');
            }
        } catch (error) {
            console.error('LLM connection test failed:', error);
            return false;
        }
    }
}

class ERouter486SettingTab extends PluginSettingTab {
    plugin: ERouter486Plugin;

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
            .addTextArea(text => text
                .setPlaceholder('Enter folder paths')
                .setValue(this.plugin.settings.folders.join('\n'))
                .onChange(async (value) => {
                    this.plugin.settings.folders = value.split('\n').filter(folder => folder.trim() !== '');
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('LLM Provider')
            .setDesc('Select the LLM provider to use')
            .addDropdown(dropdown => dropdown
                .addOption('openai', 'OpenAI')
                .addOption('anthropic', 'Anthropic')
                .addOption('groq', 'GROQ')
                .addOption('openrouter', 'OpenRouter')
                .setValue(this.plugin.settings.llmProvider)
                .onChange(async (value) => {
                    this.plugin.settings.llmProvider = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter the API key for the selected LLM provider')
            .addText(text => text
                .setPlaceholder('Enter API key')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('API Endpoint')
            .setDesc('Enter the API endpoint for the selected LLM provider (if applicable)')
            .addText(text => text
                .setPlaceholder('Enter API endpoint')
                .setValue(this.plugin.settings.apiEndpoint)
                .onChange(async (value) => {
                    this.plugin.settings.apiEndpoint = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Test LLM Connection')
            .setDesc('Click to test the connection to the LLM provider')
            .addButton((button: ButtonComponent) => {
                button
                    .setButtonText('Test Connection')
                    .setCta()
                    .onClick(async () => {
                        button.setDisabled(true);
                        const success = await this.plugin.testLLMConnection();
                        if (success) {
                            new Notice('LLM connection test successful!');
                        } else {
                            new Notice('LLM connection test failed. Please check your settings and try again.');
                        }
                        button.setDisabled(false);
                    });
            });
    }
}
