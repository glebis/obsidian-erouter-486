import { TFile, Vault, App } from 'obsidian';
import ERouter486Plugin from '../main';
import { MonitoringRule } from '../types';
import { FileProcessor } from '../fileProcessor';

jest.mock('obsidian');

describe('ERouter486Plugin File Monitoring', () => {
    let plugin: ERouter486Plugin;
    let mockVault: jest.Mocked<Vault>;
    let mockFileProcessor: jest.Mocked<FileProcessor>;

    beforeEach(() => {
        mockVault = {
            getFiles: jest.fn(),
            on: jest.fn()
        } as unknown as jest.Mocked<Vault>;
        const mockApp = {
            vault: mockVault,
            workspace: {} as any,
            metadataCache: {} as any,
        } as unknown as App;
        const mockManifest = {} as any;
        plugin = new ERouter486Plugin(mockApp, mockManifest);
        plugin.app = mockApp;
        plugin.settings = {
            monitoringRules: [
                {
                    enabled: true,
                    folders: ['test-folder'],
                    delay: 10,
                    fileNameTemplate: '*.md',
                    prompt: 'Test prompt',
                    templateFile: '',
                    outputFileNameTemplate: '{{filename}}_processed',
                    outputFileHandling: 'append'
                }
            ]
        } as any;

        mockFileProcessor = {
            handleFileChange: jest.fn(),
            checkFolder: jest.fn(),
            matchFileNameTemplate: jest.fn()
        } as unknown as jest.Mocked<FileProcessor>;
        plugin.fileProcessor = mockFileProcessor;
    });

    test('handleFileChange processes matching files', async () => {
        const mockFile = new TFile();
        mockFile.path = 'test-folder/test-file.md';
        mockFile.name = 'test-file.md';

        await plugin.handleFileChange(mockFile);

        expect(mockFileProcessor.handleFileChange).toHaveBeenCalledWith(mockFile);
    });

    test('handleFileChange ignores non-matching files', async () => {
        const mockFile = new TFile();
        mockFile.path = 'other-folder/test-file.txt';
        mockFile.name = 'test-file.txt';

        await plugin.handleFileChange(mockFile);

        expect(mockFileProcessor.handleFileChange).toHaveBeenCalledWith(mockFile);
    });

    test('checkFolder processes matching files', async () => {
        const mockFile = {
            path: 'test-folder/test-file.md',
            name: 'test-file.md'
        } as TFile;

        mockVault.getFiles.mockReturnValue([mockFile]);

        await plugin.fileProcessor.checkFolder('test-folder', plugin.settings.monitoringRules[0]);

        expect(mockFileProcessor.checkFolder).toHaveBeenCalledWith('test-folder', plugin.settings.monitoringRules[0]);
    });

    test('matchFileNameTemplate correctly matches files', () => {
        mockFileProcessor.matchFileNameTemplate.mockImplementation((fileName, template) => {
            const regex = new RegExp('^' + template.replace(/\*/g, '.*') + '$');
            return regex.test(fileName);
        });

        expect(mockFileProcessor.matchFileNameTemplate('test.md', '*.md')).toBe(true);
        expect(mockFileProcessor.matchFileNameTemplate('test.txt', '*.md')).toBe(false);
        expect(mockFileProcessor.matchFileNameTemplate('test.md', 'test.*')).toBe(true);
        expect(mockFileProcessor.matchFileNameTemplate('other.md', 'test.*')).toBe(false);
    });
});
