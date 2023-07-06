import { keywords } from "./typescript.js";

export class RequiredPackages {
  // map from symbol to module path
  private symbols: Record<string, string> = {};
  public readonly aliases: Record<string, string> = {};

  constructor(
    public readonly requires: Record<string, Set<string>> = {},
  ) {
    for (const [pkg, symbols] of Object.entries(requires)) {
      for (const symbol of symbols) {
        this.symbols[symbol] = pkg;
      }
    }
  }

  public addRequires(pkg: string, name: string, alias?: string) {
    if (!(pkg in this.requires)) {
      this.requires[pkg] = new Set();
    }

    let symbol = alias || name;
    if ((symbol in this.symbols || keywords.has(symbol)) && this.symbols[symbol] !== pkg) {
      for (
        let i = 1;
        this.symbols[symbol = name + "$" + i] && this.symbols[symbol] !== pkg;
        i++
      );
    }

    this.requires[pkg].add(symbol);
    this.symbols[symbol] = pkg;
    if (symbol !== name) {
      this.aliases[symbol] = name;
    }
    return symbol;
  }
}
