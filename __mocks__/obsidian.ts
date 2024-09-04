export class Plugin {}
export class TFile {
  path: string;
  name: string;
  constructor() {
    this.path = '';
    this.name = '';
  }
}
export class Vault {
  on() {}
  getFiles() { return []; }
}
export class App {
  vault: Vault;
  constructor() {
    this.vault = new Vault();
  }
}
export class PluginSettingTab {
  constructor(app: App, plugin: Plugin) {}
  display(): void {}
  hide(): void {}
}
export class Setting {
  setName(name: string): this { return this; }
  setDesc(desc: string): this { return this; }
  addText(cb: (text: TextComponent) => any): this { return this; }
  addDropdown(cb: (dropdown: DropdownComponent) => any): this { return this; }
  addTextArea(cb: (text: TextAreaComponent) => any): this { return this; }
  addToggle(cb: (toggle: ToggleComponent) => any): this { return this; }
  addButton(cb: (button: ButtonComponent) => any): this { return this; }
}
export class TextComponent {
  setValue(value: string): this { return this; }
  onChange(callback: (value: string) => any): this { return this; }
}
export class DropdownComponent {
  addOption(value: string, display: string): this { return this; }
  setValue(value: string): this { return this; }
  onChange(callback: (value: string) => any): this { return this; }
}
export class TextAreaComponent {
  setValue(value: string): this { return this; }
  onChange(callback: (value: string) => any): this { return this; }
}
export class ToggleComponent {
  setValue(value: boolean): this { return this; }
  onChange(callback: (value: boolean) => any): this { return this; }
}
export class ButtonComponent {
  setButtonText(name: string): this { return this; }
  setCta(): this { return this; }
  onClick(callback: () => any): this { return this; }
}
