/**
 * Cypher cannot parameterise labels, relationship types or property keys, so
 * every identifier that reaches a query string must pass these guards.
 */

const IFC_CLASS = /^Ifc[A-Za-z0-9]+$/;

export function isIfcClassName(name: string): boolean {
  return IFC_CLASS.test(name);
}

/** Returns the name if it is a valid IFC class name (usable as a label), otherwise throws. */
export function assertIfcClassName(name: string): string {
  if (!isIfcClassName(name)) throw new Error(`Invalid IFC class name: ${JSON.stringify(name)}`);
  return name;
}

/** Backtick-quotes an identifier; embedded backticks are doubled as the Cypher grammar requires. */
export function quoteIdentifier(name: string): string {
  if (name.length === 0) throw new Error('Identifier must not be empty');
  return `\`${name.replaceAll('`', '``')}\``;
}
