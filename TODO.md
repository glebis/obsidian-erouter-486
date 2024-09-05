# Obsidian eRouter 486

## Project Description

Obsidian eRouter 486 is an advanced Obsidian plugin designed to enhance note-taking and content creation by leveraging the power of various Language Model (LLM) providers. The plugin monitors specified folders within an Obsidian vault and automatically applies AI-powered prompts to new or modified files based on configurable criteria.

Key features:
1. Folder Monitoring: Users can configure specific folders to be watched for new or modified files.
2. Flexible LLM Integration: Supports multiple LLM providers, including GROQ, OpenRouter, OpenAI, Anthropic, and custom configurable LLMs.
3. Configurable Prompts: Users can set up prompts that are automatically applied based on specific criteria.
4. Pattern Matching: Utilizes regular expressions to match file content, names, and locations for applying appropriate prompts.
5. Delayed Processing: Implements an optional delay (default 10 seconds) before processing files to allow for manual edits.

The plugin aims to streamline workflows by automatically enhancing, categorizing, or transforming content as it's created or modified within the Obsidian environment.

## TODO List

1. Plugin Setup and Configuration
   - [x] Create basic plugin structure
   - [x] Implement settings page for folder selection
   - [x] Add configuration options for LLM providers (API keys, endpoints)
   - [x] Create UI for managing prompts and their associated patterns

2. Folder Monitoring
   - [x] Implement file system watcher for selected folders
   - [x] Create logic to detect new and modified files
   - [x] Implement configurable delay before processing files

3. Pattern Matching and Prompt Selection
   - [x] Develop a system for defining and storing prompt patterns
   - [x] Implement regex-based matching for file content, names, and locations
   - [x] Create logic to select appropriate prompts based on matched patterns
   - [x] Add support for filtering based on file contents using regular expressions

Examples of regular expressions for content filtering:
1. Multiple forms of a certain word: \b(run|running|ran)\b
2. Starting with a certain phrase: ^(# Task:|TODO:)
3. Ending with a specific phrase: (Conclusion:|End of document\.)$

These examples demonstrate:
1. Matching multiple forms of the word "run"
2. Matching files that start with either "# Task:" or "TODO:"
3. Matching files that end with either "Conclusion:" or "End of document."

4. LLM Integration
   - [x] Implement API connections for GROQ, OpenRouter, OpenAI, and Anthropic
   - [x] Create a flexible system for adding custom LLM providers
   - [ ] Develop error handling and retry logic for API calls

5. File Processing
   - [x] Create a queue system for processing files
   - [x] Implement logic to apply selected prompts to file content
   - [x] Develop a method to update files with LLM-generated content

6. User Interface
   - [ ] Design and implement a status indicator for active monitoring
   - [ ] Create a log or history view of processed files and applied prompts
   - [ ] Implement manual override options for prompt application

7. Performance Optimization
   - [ ] Implement caching mechanisms to reduce unnecessary API calls
   - [ ] Optimize file watching to minimize resource usage

8. Testing and Quality Assurance
   - [ ] Develop unit tests for core functionalities
   - [ ] Create integration tests for LLM provider connections
   - [ ] Perform thorough testing with various file types and sizes

9. Documentation
   - [ ] Write comprehensive user documentation
   - [ ] Create developer documentation for future maintenance and contributions

10. Security and Privacy
    - [x] Implement secure storage for API keys and sensitive configurations
    - [ ] Add options for local LLM processing to ensure privacy

11. Extensibility
    - [ ] Design a plugin API for extending functionality
    - [ ] Create sample extensions to demonstrate API usage

12. Deployment and Distribution
    - [ ] Prepare the plugin for submission to the Obsidian community plugin store
    - [ ] Create a project website or README with feature highlights and usage instructions

Remember to prioritize these tasks based on core functionality and gradually build up to more advanced features. Regular testing and user feedback will be crucial throughout the development process.
