import { App, Plugin, PluginSettingTab } from "obsidian";
import {
  Setting,
  ButtonComponent,
  TextAreaComponent,
  DropdownComponent,
  TextComponent,
  ToggleComponent,
  Notice,
  SuggestModal,
  TFile,
  TAbstractFile
} from "obsidian";
import ERouter486Plugin from "./main";
import {
  MonitoringRule,
  ERouter486Settings,
  DEFAULT_SETTINGS,
  LLM_PROVIDERS,
} from "./types";

class FileSuggestModal extends SuggestModal<TFile> {
  constructor(app: App, private onChoose: (file: TFile) => void) {
    super(app);
  }

  getSuggestions(query: string): TFile[] {
    return this.app.vault.getMarkdownFiles().filter(file => 
      file.path.toLowerCase().includes(query.toLowerCase())
    );
  }

  renderSuggestion(file: TFile, el: HTMLElement) {
    el.createEl("div", { text: file.path });
  }

  onChooseSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent) {
    this.onChoose(file);
  }
}

export class ERouter486SettingTab extends PluginSettingTab {
  plugin: ERouter486Plugin;
  private apiEndpointSetting: Setting;
  private modelNameSetting: Setting;
  private contentRegexSetting: Setting;

  constructor(app: App, plugin: ERouter486Plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.apiEndpointSetting = new Setting(this.containerEl);
    this.modelNameSetting = new Setting(this.containerEl);
    this.contentRegexSetting = new Setting(this.containerEl);

    // CSS styles have been moved to styles.css
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    const logoContainer = containerEl.createDiv({ cls: "erouter-logo-container" });

    containerEl.createEl("h2", { text: "eRouter 486 Settings" });

    const descriptionEl = containerEl.createEl("p", { cls: "setting-item-description" });
    descriptionEl.setText("eRouter 486 automates content processing in Obsidian using AI. It monitors folders, processes files with LLMs (OpenAI, Anthropic, GROQ), and saves results based on custom rules. Ideal for summarizing, translating, or structuring notes automatically.");

    this.addLLMSettings(containerEl);
    this.addMonitoringRulesSettings(containerEl);
    this.addLogSettings(containerEl);
  }

  addLLMSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName("LLM Provider")
      .setDesc("Currently only GROQ is supported")
      .addText((text) => text.setValue("GROQ").setDisabled(true));

    this.plugin.settings.llmProvider = "groq";

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("Enter the API key for the selected LLM provider")
      .addText((text: TextComponent) => {
        text
          .setPlaceholder("Enter API key")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });

    this.apiEndpointSetting = new Setting(containerEl)
      .setName("API Endpoint")
      .setDesc(
        "Enter the API endpoint for the selected LLM provider (if applicable)",
      )
      .addText((text: TextComponent) => {
        text
          .setPlaceholder("Enter API endpoint")
          .setValue(this.plugin.settings.apiEndpoint)
          .onChange(async (value) => {
            this.plugin.settings.apiEndpoint = value.trim();
            await this.plugin.saveSettings();
          });
      });

    this.modelNameSetting = new Setting(containerEl)
      .setName("Model Name")
      .setDesc("Select the model to use")
      .addDropdown((dropdown: DropdownComponent) => {
        const providerInfo = this.plugin.getProviderInfo(
          this.plugin.settings.llmProvider,
        );
        if (providerInfo) {
          providerInfo.defaultModels.forEach((model: string) => {
            dropdown.addOption(model, model);
          });
        }
        dropdown
          .setValue(this.plugin.settings.modelName)
          .onChange(async (value) => {
            this.plugin.settings.modelName = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Test LLM Connection")
      .setDesc("Click to test the connection to the LLM provider")
      .addButton((button: ButtonComponent) => {
        button
          .setButtonText("Test Connection")
          .setCta()
          .onClick(async () => {
            button.setButtonText("Testing...");
            button.setDisabled(true);
            const { success, message } = await this.plugin.testLLMConnection();
            new Notice(message);
            button.setButtonText("Test Connection");
            button.setDisabled(false);
          });
      });

    this.updateProviderSpecificSettings(this.plugin.settings.llmProvider);
  }

  addMonitoringRulesSettings(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Monitoring Rules" });

    this.plugin.settings.monitoringRules.forEach((rule, index) => {
      this.addMonitoringRuleSettings(containerEl, rule, index);
    });

    new Setting(containerEl)
      .setName("Add New Rule")
      .addButton((button: ButtonComponent) => {
        button
          .setButtonText("Add Rule")
          .setCta()
          .onClick(() => {
            const newRuleIndex = this.plugin.settings.monitoringRules.length + 1;
            this.plugin.settings.monitoringRules.push({
              name: `Rule ${newRuleIndex}`,
              enabled: true,
              folders: [],
              delay: 10,
              fileNameTemplate: "",
              prompt: "",
              templateFile: "",
              outputFileNameTemplate: "{{filename}}_processed",
              outputFileName: "",
              outputFileHandling: "append",
              deleteSourceFile: false,
              contentRegex: "",
              outputFolder: "processed", // Add this line
            });
            this.plugin.saveSettings();
            this.display();
          });
      });
  }

  addMonitoringRuleSettings(
    containerEl: HTMLElement,
    rule: MonitoringRule,
    index: number,
  ): void {
    const ruleContainer = containerEl.createEl("details", { cls: "rule-container" });
    const summary = ruleContainer.createEl("summary", { cls: "rule-summary" });
    summary.createSpan({ text: `${index + 1}`, cls: "rule-number" });
    const expandIcon = summary.createSpan({ cls: "rule-expand-icon" });
    const ruleName = summary.createEl("input", {
      type: "text",
      value: rule.name || `Rule ${index + 1}`,
      cls: "rule-name-input",
    });

    ruleContainer.addEventListener("toggle", (event) => {
      if (event.target instanceof HTMLDetailsElement) {
        expandIcon.classList.toggle("expanded", event.target.open);
      }
    });

    ruleName.addEventListener("change", async (event) => {
      rule.name = (event.target as HTMLInputElement).value;
      await this.plugin.saveSettings();
    });

    const ruleContent = ruleContainer.createDiv();

    new Setting(ruleContent)
      .setName("Enable Rule")
      .addToggle((toggle: ToggleComponent) => {
        toggle.setValue(rule.enabled).onChange(async (value) => {
          rule.enabled = value;
          await this.plugin.saveSettings();
          ruleName.classList.toggle("disabled", !value);
        });
      });

    new Setting(ruleContent)
      .setName("Monitored Folders")
      .setDesc("Enter folder paths to monitor (one per line)")
      .addTextArea((text: TextAreaComponent) => {
        text
          .setPlaceholder("Enter folder paths")
          .setValue(rule.folders.join("\n"))
          .onChange(async (value) => {
            rule.folders = value
              .split("\n")
              .map((folder) => folder.trim())
              .filter((folder) => folder !== "");
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 3;
        text.inputEl.cols = 50;
      });

    new Setting(ruleContent)
      .setName("Processing Delay (seconds)")
      .setDesc("Set the delay before processing files")
      .addText((text: TextComponent) => {
        text
          .setPlaceholder("Enter delay in seconds")
          .setValue(rule.delay.toString())
          .onChange(async (value) => {
            const delay = parseInt(value);
            if (!isNaN(delay) && delay >= 0) {
              rule.delay = delay;
              await this.plugin.saveSettings();
            }
          });
      })

    new Setting(ruleContent)
      .setName("File Name")
      .setDesc(
        "Enter a regex pattern to match file names (* to monitor all files).",
      )
      .addText((text: TextComponent) => {
        text
          .setPlaceholder("*")
          .setValue(rule.fileNameTemplate)
          .onChange(async (value) => {
            rule.fileNameTemplate = value;
            await this.plugin.saveSettings();
          });
      })

    new Setting(ruleContent)
      .setName("Content Regex")
      .setDesc("Enter a regex pattern to match file contents (optional)")
      .addText((text: TextComponent) => {
        text
          .setPlaceholder("Enter content regex")
          .setValue(rule.contentRegex || "")
          .onChange(async (value) => {
            rule.contentRegex = value;
            await this.plugin.saveSettings();
          });
      })
      .addDropdown((dropdown: DropdownComponent) => {
        dropdown
          .addOption("", "Select common regex")
          .addOption("^[A-Za-z]", "Starting with a letter")
          .addOption("[A-Za-z]$", "Ending with a letter")
          .addOption("\\b\\w+\\b", "Containing a word")
          .addOption("\\d+", "Containing numbers")
          .addOption("\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b", "Email address")
          .addOption("\\b(color|colour)\\b", "Multiple word versions (e.g., color/colour)")
          .onChange((value: string) => {
            if (value) {
              const textComponent = dropdown.selectEl.parentElement?.querySelector('input') as HTMLInputElement;
              if (textComponent) {
                textComponent.value = value;
                textComponent.dispatchEvent(new Event('input'));
                rule.contentRegex = value;
                this.plugin.saveSettings();
              }
              dropdown.setValue("");
            }
          });
      });

    new Setting(ruleContent)
      .setName("Prompt")
      .setDesc("Enter the prompt to be applied. Press Ctrl+[ to insert a file link.")
      .addTextArea((text: TextAreaComponent) => {
        text
          .setPlaceholder("Enter prompt")
          .setValue(rule.prompt)
          .onChange(async (value) => {
            rule.prompt = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 5;
        text.inputEl.cols = 50;

        // Add file suggestion functionality
        text.inputEl.addEventListener('keydown', (event: KeyboardEvent) => {
          if (event.key === '[' && event.ctrlKey) {
            event.preventDefault();
            new FileSuggestModal(this.app, (file: TFile) => {
              const cursorPosition = text.inputEl.selectionStart;
              const currentValue = text.inputEl.value;
              const newValue = currentValue.slice(0, cursorPosition) + `[[${file.path}]]` + currentValue.slice(cursorPosition);
              text.setValue(newValue);
              rule.prompt = newValue;
              this.plugin.saveSettings();
            }).open();
          }
        });
      });

    new Setting(ruleContent)
      .setName("Template File")
      .setDesc("Select an optional template file")
      .addText((text: TextComponent) => {
        text
          .setPlaceholder("Select template file")
          .setValue(rule.templateFile)
          .onChange(async (value) => {
            rule.templateFile = value;
            await this.plugin.saveSettings();
          });
      })
      .addButton((button: ButtonComponent) => {
        button
          .setButtonText("Select")
          .onClick(async () => {
            new FileSuggestModal(this.app, (file: TFile) => {
              rule.templateFile = file.path;
              const textComponent = (button.buttonEl.parentElement?.previousElementSibling?.querySelector('input') as HTMLInputElement) || null;
              if (textComponent) {
                textComponent.value = file.path;
                textComponent.dispatchEvent(new Event('input'));
              }
              this.plugin.saveSettings();
            }).open();
          });
      })

    new Setting(ruleContent)
      .setName("Output File Name")
      .setDesc("Enter the template for the output file name. Available variables: {{filename}}, {{date}}, {{time}}, {{extension}}, {{yyyy}}, {{MM}}, {{dd}}, {{HH}}, {{mm}}, {{ss}}")
      .addText((text: TextComponent) => {
        text
          .setPlaceholder("{{filename}}_processed")
          .setValue(rule.outputFileNameTemplate || "{{filename}}_processed")
          .onChange(async (value) => {
            rule.outputFileNameTemplate = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(ruleContent)
      .setName("Output File Handling")
      .setDesc("Choose how to handle existing output files")
      .addDropdown((dropdown: DropdownComponent) => {
        dropdown
          .addOption("overwrite", "Overwrite")
          .addOption("append", "Append")
          .addOption("rename", "Rename")
          .setValue(rule.outputFileHandling || "append")
          .onChange(async (value) => {
            rule.outputFileHandling = value as
              | "overwrite"
              | "append"
              | "rename";
            await this.plugin.saveSettings();
          });
      });

    new Setting(ruleContent)
      .setName("Delete Source File")
      .setDesc("Delete the source file after processing")
      .addToggle((toggle: ToggleComponent) => {
        toggle
          .setValue(rule.deleteSourceFile || false)
          .onChange(async (value) => {
            rule.deleteSourceFile = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(ruleContent)
      .setName("Remove Rule")
      .addButton((button: ButtonComponent) => {
        button
          .setButtonText("Remove")
          .setWarning()
          .onClick(() => {
            this.plugin.settings.monitoringRules.splice(index, 1);
            this.plugin.saveSettings();
            this.display();
          });
      })
  }

  updateProviderSpecificSettings(provider: string): void {
    const providerInfo = this.plugin.getProviderInfo(provider);
    if (providerInfo) {
      this.apiEndpointSetting.settingEl.style.display =
        providerInfo.needsEndpoint ? "block" : "none";
      if (providerInfo.needsEndpoint && providerInfo.defaultEndpoint) {
        (this.apiEndpointSetting.components[0] as TextComponent).setValue(
          providerInfo.defaultEndpoint,
        );
      }

      const dropdown = this.modelNameSetting.components[0] as DropdownComponent;
      dropdown.selectEl.empty();
      providerInfo.defaultModels.forEach((model: string) => {
        dropdown.addOption(model, model);
      });
      dropdown.setValue("llama-3.1-8b-instant");
    }
  }

  addLogSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName("Log File Name")
      .setDesc("Enter the name of the log file (including extension)")
      .addText((text: TextComponent) => {
        text
          .setPlaceholder("Enter log file name")
          .setValue(this.plugin.settings.logFilePath)
          .onChange(async (value) => {
            this.plugin.settings.logFilePath = value.trim();
            await this.plugin.saveSettings();
          });
      });
  }
}
