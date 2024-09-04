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
