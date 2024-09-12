import ERouter486Plugin from '../main';
import { App, PluginManifest } from 'obsidian';
import { FileProcessor } from '../src/fileProcessor';

jest.mock('obsidian');
jest.mock('../src/fileProcessor');

describe('ERouter486Plugin', () => {
    let plugin: ERouter486Plugin;
    let mockApp: jest.Mocked<App>;
    let mockManifest: PluginManifest;
    let mockFileProcessor: jest.Mocked<FileProcessor>;

    beforeEach(() => {
        mockApp = new App() as jest.Mocked<App>;
        mockManifest = {} as PluginManifest;
        plugin = new ERouter486Plugin(mockApp, mockManifest);
        mockFileProcessor = new FileProcessor(mockApp, plugin.settings) as jest.Mocked<FileProcessor>;
        
        // @ts-ignore: Accessing private property for testing
        (plugin as any).fileProcessor = mockFileProcessor;
    });

    test('checkFolder calls fileProcessor.checkFolder', async () => {
        const testFolder = 'test-folder';
        const testRule = plugin.settings.monitoringRules[0];

        await plugin.checkFolder(testFolder, testRule);

        expect(mockFileProcessor.checkFolder).toHaveBeenCalledWith(testFolder, testRule);
    });
});
