import { jen } from "jennifer-js";

import { RequiredPackages } from "./packages.js";

export interface SymbolReference {
  module?: string;
  symbol: string;
  alias?: string;
  property?: string;
}

export function renderSymbolReference(pkgs: RequiredPackages, ref: SymbolReference, alias?: string): jen.Expr {
  const ns = (ref.module ? jen.id(pkgs.addRequires(ref.module, ref.symbol, alias ?? ref.alias)) : jen.id(ref.symbol));
  return ref.property ? ns.dot(ref.property) : ns;
}
