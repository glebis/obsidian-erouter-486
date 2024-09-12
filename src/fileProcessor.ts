import { App, TFile, TAbstractFile, Notice } from "obsidian";
import { ERouter486Settings, MonitoringRule, QueueItem } from "../types";
import { ContentFilter } from "./content_filter";
import { Groq } from 'groq-sdk';
import * as Handlebars from 'handlebars';

export class FileProcessor {
  private fileWatchers: Map<string, NodeJS.Timeout> = new Map();
  private requestQueue: QueueItem[] = [];
  private isProcessingQueue: boolean = false;
  private lastRequestTime: number = 0;
  private readonly REQUEST_INTERVAL = 15000; // 15 seconds in milliseconds
  private lastProcessedTimes: Map<string, number> = new Map();
  private fileChangeDebounce: Map<string, NodeJS.Timeout> = new Map();
  private processingFiles: Set<string> = new Set();

  constructor(
    private app: App,
    private settings: ERouter486Settings,
  ) {}

  private debouncedHandleFileChange = this.debounce(
    this.handleFileChange.bind(this),
    1000,
  );

  private debounce(func: Function, wait: number) {
    let timeout: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  async handleFileChange(file: TAbstractFile): Promise<void> {
    if (!(file instanceof TFile)) return;

    const applicableRules = this.settings.monitoringRules.filter(
      (rule: MonitoringRule) =>
        rule.enabled &&
        rule.folders.some((folder: string) => file.path.startsWith(folder)),
    );

    for (const rule of applicableRules) {
      const debounceKey = `${file.path}-${rule.name}`;
      if (this.fileChangeDebounce.has(debounceKey)) {
        clearTimeout(this.fileChangeDebounce.get(debounceKey));
      }

      this.fileChangeDebounce.set(
        debounceKey,
        setTimeout(() => {
          this.processFile(file, rule);
          console.log("eRouter486: File processed");
          this.fileChangeDebounce.delete(debounceKey);
        }, rule.delay * 1000),
      );
    }
  }

  private async processFile(file: TFile, rule: MonitoringRule): Promise<void> {
    console.log(`eRouter486: Processing file: ${file.path}`);
    if (!this.matchesFileNameTemplate(file.name, rule.fileNameTemplate)) {
      console.log(
        `eRouter486: File ${file.path} does not match template ${rule.fileNameTemplate}`,
      );
      return;
    }

    if (rule.contentRegex && rule.contentRegex.trim() !== "") {
      const content = await this.app.vault.read(file);
      const regex = new RegExp(rule.contentRegex);
      if (!regex.test(content)) {
        console.log(
          `File ${file.path} content does not match regex ${rule.contentRegex}`,
        );
        return;
      }
    }

    if (this.processingFiles.has(file.path)) {
      console.log(`eRouter486: File ${file.path} is already being processed. Skipping.`);
      return;
    }

    this.processingFiles.add(file.path);
    console.debug(`eRouter486: Processing file ${file.path} with rule ${JSON.stringify(rule)}`);

    try {
      if (await this.app.vault.adapter.exists(file.path)) {
        const content = await this.app.vault.read(file);
        console.debug(`eRouter486: File content read, length: ${content.length}`);
        let prompt = rule.prompt;

        console.debug(`eRouter486: Sending content to LLM for processing`);
        const processedContent = await this.queueLLMRequest(content, prompt);
        console.debug(`eRouter486: Received processed content from LLM, length: ${processedContent.length}`);
        
        console.debug(`eRouter486: Now attempting to save processed content`);
        const outputFileName = await this.saveProcessedContent(file, processedContent, rule);
        if (outputFileName) {
          console.debug(`eRouter486: Content saved successfully to ${outputFileName}`);
          
          if (rule.templateFile && await this.app.vault.adapter.exists(rule.templateFile)) {
            console.debug(`eRouter486: Using template file ${rule.templateFile}`);
            const templateFile = this.app.vault.getAbstractFileByPath(rule.templateFile) as TFile;
            const templateContent = await this.app.vault.read(templateFile);
            console.debug(`eRouter486: Template content read, length: ${templateContent.length}`);
            
            console.debug(`eRouter486: Starting template application process`);
            // Process the template with Templater
            const templater = (this.app as any).plugins?.plugins?.['templater-obsidian'];
            if (templater) {
              console.debug(`eRouter486: Templater plugin found, applying template`);
              const outputFile = this.app.vault.getAbstractFileByPath(outputFileName) as TFile;
              try {
                await templater.templater.overwrite_file_commands(outputFile, templateContent);
                console.debug(`eRouter486: Template successfully applied to output file using Templater`);
              } catch (error) {
                console.error(`eRouter486: Error applying template with Templater:`, error);
                console.debug(`eRouter486: Falling back to manual template application`);
                await this.manualTemplateApplication(outputFile, templateContent, processedContent);
              }
            } else {
              console.warn('eRouter486: Templater plugin not found or not accessible. Applying template manually.');
              const outputFile = this.app.vault.getAbstractFileByPath(outputFileName) as TFile;
              if (outputFile instanceof TFile) {
                await this.manualTemplateApplication(outputFile, templateContent, processedContent);
              } else {
                console.error(`eRouter486: Output file not found: ${outputFileName}`);
              }
            }
            console.debug(`eRouter486: Template application process completed`);
          } else {
            console.debug(`eRouter486: No template file used or file doesn't exist`);
          }

          await this.logOperation('process', file.path, rule, outputFileName);
          this.lastProcessedTimes.set(file.path, Date.now());
          
          if (rule.deleteSourceFile) {
            console.debug(`eRouter486: Attempting to delete source file ${file.path}`);
            try {
              if (await this.app.vault.adapter.exists(file.path)) {
                await this.app.vault.delete(file);
                console.debug(`eRouter486: Source file ${file.path} deleted successfully`);
                await this.logOperation('delete', file.path, rule);
              } else {
                console.warn(`eRouter486: Source file ${file.path} no longer exists. Skipping deletion.`);
              }
            } catch (error) {
              console.error(`eRouter486: Failed to delete source file ${file.path}:`, error);
            }
          }
        } else {
          console.error(`eRouter486: Failed to save processed content`);
        }
      } else {
        console.warn(`eRouter486: File ${file.path} does not exist. Skipping processing.`);
      }
    } finally {
      this.processingFiles.delete(file.path);
    }
  }

  private matchesFileNameTemplate(fileName: string, template: string): boolean {
    const regex = new RegExp("^" + template.replace(/\*/g, ".*") + "$");
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
    this.fileWatchers.forEach((timeout) => clearTimeout(timeout));
    this.fileWatchers.clear();
  }

  private monitorFolder(folder: string, rule: MonitoringRule): void {
    console.log(`Monitoring folder: ${folder}`);
    const watcher = setInterval(() => this.checkFolder(folder, rule), rule.delay * 1000);
    this.fileWatchers.set(`${folder}-${rule.fileNameTemplate}`, watcher);
    console.debug(`ERouter486Plugin: Started monitoring folder ${folder} with template ${rule.fileNameTemplate}`);
  }

  async checkFolder(folder: string, rule: MonitoringRule): Promise<void> {
    console.log(`Checking folder: ${folder}`);
    const files = this.app.vault
      .getFiles()
      .filter((file) => file.path.startsWith(folder));

    for (const file of files) {
      if (this.matchesFileNameTemplate(file.name, rule.fileNameTemplate)) {
        await this.processFile(file, rule);
      }
    }
  }

  private async manualTemplateApplication(outputFile: TFile, templateContent: string, processedContent: string): Promise<void> {
    console.debug(`eRouter486: Starting manual template application for file ${outputFile.path}`);
    console.debug(`eRouter486: Template content length: ${templateContent.length}`);
    console.debug(`eRouter486: Processed content length: ${processedContent.length}`);
    try {
      const combinedContent = templateContent + '\n' + processedContent;
      console.debug(`eRouter486: Combined content length: ${combinedContent.length}`);
      await this.app.vault.modify(outputFile, combinedContent);
      console.debug(`eRouter486: Manual template application completed for file ${outputFile.path}`);
    } catch (error) {
      console.error(`eRouter486: Error in manual template application for file ${outputFile.path}:`, error);
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
        console.debug(`eRouter486: Rate limiting - Waiting ${waitTime}ms before processing next request`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const { content, prompt, resolve, reject } = this.requestQueue.shift()!;

      try {
        const result = await this.processWithLLM(content, prompt);
        resolve(result);
      } catch (error) {
        console.error('eRouter486: Error processing LLM request:', error);
        reject(error);
      }

      this.lastRequestTime = Date.now();
    }

    this.isProcessingQueue = false;
  }

  async processWithLLM(content: string, prompt: string): Promise<string> {
    console.debug(`eRouter486: Processing content with LLM, prompt: ${prompt}`);
  
    const groq = new Groq({ apiKey: this.settings.apiKey, dangerouslyAllowBrowser: true });
  
    const maxRetries = 3;
    const delayBetweenRetries = 2000; // 2 seconds

    // Replace file links in the prompt with file contents
    prompt = await this.replaceFileLinksWithContent(prompt);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.debug(`eRouter486: Making LLM request (attempt ${attempt}/${maxRetries})`);

        const chatCompletion = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: `${prompt}\n\nContent: ${content}` }
          ],
          model: this.settings.modelName,
        });

        console.debug(`eRouter486: LLM request successful`);
        return chatCompletion.choices[0]?.message?.content || 'No response from LLM';
      } catch (error) {
        console.error(`eRouter486: Error processing with LLM (attempt ${attempt}/${maxRetries}):`, error);
      
        if (attempt === maxRetries) {
          return `Error processing content after ${maxRetries} attempts: ${(error as Error).message}`;
        }

        if ((error as Error).message.includes('429')) {
          console.debug(`eRouter486: Rate limit reached. Waiting ${delayBetweenRetries}ms before retrying...`);
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
          console.error(`eRouter486: Error reading file ${fileName}:`, error);
          new Notice(`Error reading file ${fileName}. The link will be left as is.`);
        }
      } else {
        console.warn(`eRouter486: File not found: ${fileName}`);
        new Notice(`File not found: ${fileName}. The link will be left as is.`);
      }
    }

    return replacedText;
  }

  async saveProcessedContent(file: TFile, content: string, rule: MonitoringRule): Promise<string | null> {
    const outputFileName = this.getOutputFileName(file.name, rule.outputFileNameTemplate);
    console.debug(`eRouter486: Attempting to save content to ${outputFileName}`);

    try {
      const outputFile = this.app.vault.getAbstractFileByPath(outputFileName);

      if (outputFile instanceof TFile) {
        switch (rule.outputFileHandling) {
          case 'overwrite':
            await this.app.vault.modify(outputFile, content);
            console.debug(`eRouter486: Overwritten file ${outputFileName}`);
            break;
          case 'append':
            const existingContent = await this.app.vault.read(outputFile);
            await this.app.vault.modify(outputFile, existingContent + '\n' + content);
            console.debug(`eRouter486: Appended to file ${outputFileName}`);
            break;
          case 'rename':
            let newName = outputFileName;
            let counter = 1;
            while (this.app.vault.getAbstractFileByPath(newName)) {
              newName = `${outputFileName}_${counter}`;
              counter++;
            }
            await this.app.vault.create(newName, content);
            console.debug(`eRouter486: Created new file ${newName}`);
            return newName;
        }
      } else {
        // If the file doesn't exist, create it regardless of the output handling option
        await this.app.vault.create(outputFileName, content);
        console.debug(`eRouter486: Created new file ${outputFileName}`);
      }

      return outputFileName;
    } catch (error) {
      console.error(`eRouter486: Error saving processed content: ${error}`);
      return null;
    }
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
      console.debug(`eRouter486: ${logEntry.trim()}`);
      await this.appendToLogFile(logEntry);
    } else {
      console.debug(`eRouter486: No output file created or modified for ${filePath}`);
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
