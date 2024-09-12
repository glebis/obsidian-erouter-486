import { FileProcessor } from '../src/fileProcessor';
import { App, TFile } from 'obsidian';
import { ERouter486Settings } from '../types';

describe('FileProcessor', () => {
  let app: jest.Mocked<App>;
  let settings: ERouter486Settings;
  let fileProcessor: FileProcessor;

  beforeEach(() => {
    app = {
      vault: {
        getAbstractFileByPath: jest.fn(),
        read: jest.fn(),
        create: jest.fn(),
        modify: jest.fn(),
      },
    } as unknown as jest.Mocked<App>;

    settings = {
      apiKey: 'test-api-key',
      modelName: 'test-model',
      logFilePath: 'test-log.md',
      monitoringRules: [],
    } as ERouter486Settings;

    fileProcessor = new FileProcessor(app, settings);
  });

  test('getOutputFileName should return correct output file name', () => {
    const originalName = 'test.md';
    const template = '{{filename}}_processed.{{extension}}';
    const result = fileProcessor.getOutputFileName(originalName, template);
    expect(result).toBe('test_processed.md');
  });

  // Add more tests as needed
});
