import { RequiredPackages } from "../common/packages.ts";
import jen from "https://raw.githubusercontent.com/ssttevee/deno-jen/d551218b35e530bec1bda87bab4a0d4b923daa13/mod.ts";

export interface SymbolReference {
  module?: string;
  symbol: string;
  property?: string;
}

export function renderSymbolReference(pkgs: RequiredPackages, ref: SymbolReference): jen.Expr {
  const ns = (ref.module ? jen.id(pkgs.addRequires(ref.module, ref.symbol)) : jen.id(ref.symbol));
  return ref.property ? ns.dot(ref.property) : ns;
}
