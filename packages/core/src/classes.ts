import type { Element } from './model.ts';

/** True when the element is an instance of ifcClass, of one of its subtypes, or of a class derived from its type object. */
export function isOfClass(element: Pick<Element, 'ifcClass' | 'ifcSuperClasses' | 'ifcDerivedClasses'>, ifcClass: string): boolean {
  return element.ifcClass === ifcClass || element.ifcSuperClasses.includes(ifcClass) || (element.ifcDerivedClasses ?? []).includes(ifcClass);
}
