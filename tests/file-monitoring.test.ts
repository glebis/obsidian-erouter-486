import { TFile, Vault, App } from 'obsidian';
import ERouter486Plugin from '../main';
import { MonitoringRule } from '../main';

describe('ERouter486Plugin File Monitoring', () => {
    let plugin: ERouter486Plugin;
    let mockVault: jest.Mocked<Vault>;

    beforeEach(() => {
        mockVault = new Vault() as jest.Mocked<Vault>;
        const mockApp = { vault: mockVault } as any;
        const mockManifest = {} as any;
        plugin = new ERouter486Plugin(mockApp, mockManifest);
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
    });

    test('handleFileChange processes matching files', async () => {
        const mockFile = new TFile() as jest.Mocked<TFile>;
        mockFile.path = 'test-folder/test-file.md';
        mockFile.name = 'test-file.md';

        const processFileSpy = jest.spyOn(plugin as any, 'processFile').mockResolvedValue(undefined);

        await plugin.handleFileChange(mockFile);

        expect(processFileSpy).toHaveBeenCalledWith(mockFile, plugin.settings.monitoringRules[0]);
    });

    test('handleFileChange ignores non-matching files', async () => {
        const mockFile = new TFile() as jest.Mocked<TFile>;
        mockFile.path = 'other-folder/test-file.txt';
        mockFile.name = 'test-file.txt';

        const processFileSpy = jest.spyOn(plugin as any, 'processFile').mockResolvedValue(undefined);

        await plugin.handleFileChange(mockFile);

        expect(processFileSpy).not.toHaveBeenCalled();
    });

    test('checkFolder processes matching files', async () => {
        const mockFile = new TFile() as jest.Mocked<TFile>;
        mockFile.path = 'test-folder/test-file.md';
        mockFile.name = 'test-file.md';

        mockVault.getFiles.mockReturnValue([mockFile]);

        const processFileSpy = jest.spyOn(plugin as any, 'processFile').mockResolvedValue(undefined);

        await (plugin as any).checkFolder('test-folder', plugin.settings.monitoringRules[0]);

        expect(processFileSpy).toHaveBeenCalledWith(mockFile, plugin.settings.monitoringRules[0]);
    });

    test('matchFileNameTemplate correctly matches files', () => {
        expect((plugin as any).matchFileNameTemplate('test.md', '*.md')).toBe(true);
        expect((plugin as any).matchFileNameTemplate('test.txt', '*.md')).toBe(false);
        expect((plugin as any).matchFileNameTemplate('test.md', 'test.*')).toBe(true);
        expect((plugin as any).matchFileNameTemplate('other.md', 'test.*')).toBe(false);
    });
});
