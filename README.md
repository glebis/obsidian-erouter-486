
# eRouter 486 Plugin for Obsidian

The eRouter 486 plugin for Obsidian is a powerful tool that automates file processing using Large Language Models (LLMs). It allows you to set up monitoring rules for specific folders and file types, process the content using LLMs, and save the results according to your preferences.

## Features

- **Flexible Monitoring Rules**: Set up multiple rules to monitor different folders and file types.
- **LLM Integration**: Supports OpenAI, Anthropic, and GROQ as LLM providers.
- **Customizable Processing**: Define custom prompts and use template files for consistent processing. Supports Templater syntax if the Templater plugin is installed.
- **Output Control**: Specify output file naming conventions and handling methods (overwrite, append, or create new).
- **Source File Management**: Option to move source files to a specified folder after processing.
- **Logging**: Keeps a detailed log of all processing activities.
- **Manual Processing**: Ability to manually process files or folders on demand.

## How It Works

1. **Set Up Rules**: Configure monitoring rules in the plugin settings, specifying folders to watch, file patterns to match, and processing details.
2. **Automatic Monitoring**: The plugin watches the specified folders for new or modified files that match your rules.
3. **LLM Processing**: When a file is detected, it's processed using the configured LLM (OpenAI, Anthropic, or GROQ) with your specified prompt or template.
4. **Output Generation**: The processed content is saved according to your output settings.
5. **Source File Handling**: Source files can be moved to a specified folder after processing.
6. **Logging**: All actions are logged for easy tracking and troubleshooting.

## Configuration

- **LLM Settings**: Set up your API keys for OpenAI, Anthropic, or GROQ, and choose the model to use.
- **Monitoring Rules**: Create and manage rules for file processing.
- **Output Settings**: Configure how processed files are saved and named.
- **Source File Handling**: Specify whether to move processed source files and where.
- **Logging**: Configure logging preferences.

## Use Cases

- Automatically summarize notes or articles
- Generate metadata for your files
- Create structured content from raw notes
- Translate documents
- Analyze and categorize information
- And much more, limited only by your imagination and the capabilities of the LLMs!

## Getting Started

1. Install the plugin in Obsidian.
2. Configure your preferred LLM provider's API key in the plugin settings.
3. Set up at least one monitoring rule.
4. Start creating or modifying files in your monitored folders and watch the magic happen!
5. Alternatively, use the command palette to manually process files or folders.

For more detailed information on setup and usage, please refer to the plugin settings page within Obsidian.
