import { TFile } from 'obsidian';

export class ContentFilter {
    static async matchesContent(file: TFile, regex: RegExp): Promise<boolean> {
        const content = await file.vault.read(file);
        return regex.test(content);
    }

    static async filterFiles(files: TFile[], regex: RegExp): Promise<TFile[]> {
        const matchedFiles: TFile[] = [];
        for (const file of files) {
            if (await this.matchesContent(file, regex)) {
                matchedFiles.push(file);
            }
        }
        return matchedFiles;
    }
}
