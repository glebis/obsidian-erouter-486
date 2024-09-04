
# eRouter 486 Plugin for Obsidian

The eRouter 486 plugin for Obsidian is a powerful tool that automates file processing using Large Language Models (LLMs). It allows you to set up monitoring rules for specific folders and file types, process the content using LLMs, and save the results according to your preferences.

## Features

- **Flexible Monitoring Rules**: Set up multiple rules to monitor different folders and file types.
- **LLM Integration**: Currently supports GROQ as the LLM provider, with plans to expand to other providers in the future.
- **Customizable Processing**: Define custom prompts and use template files for consistent processing.
- **Output Control**: Specify output file naming conventions and handling methods (overwrite, append, or rename).
- **Source File Management**: Option to delete source files after processing.
- **Logging**: Keeps a detailed log of all processing activities.

## How It Works

1. **Set Up Rules**: Configure monitoring rules in the plugin settings, specifying folders to watch, file patterns to match, and processing details.
2. **Automatic Monitoring**: The plugin watches the specified folders for new or modified files that match your rules.
3. **LLM Processing**: When a file is detected, it's processed using the configured LLM (GROQ) with your specified prompt or template.
4. **Output Generation**: The processed content is saved according to your output settings.
5. **Logging**: All actions are logged for easy tracking and troubleshooting.

## Configuration

- **LLM Settings**: Set up your GROQ API key and choose the model to use.
- **Monitoring Rules**: Create and manage rules for file processing.
- **Logging**: Specify the log file name and location.

## Use Cases

- Automatically summarize notes or articles
- Generate metadata for your files
- Create structured content from raw notes
- Translate documents
- And much more, limited only by your imagination and the capabilities of the LLM!

## Getting Started

1. Install the plugin in Obsidian.
2. Configure your GROQ API key in the plugin settings.
3. Set up at least one monitoring rule.
4. Start creating or modifying files in your monitored folders and watch the magic happen!

For more detailed information on setup and usage, please refer to the plugin settings page within Obsidian.
