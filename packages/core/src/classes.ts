import type { Element } from './model.ts';

/** True when the element is an instance of ifcClass or of one of its subtypes. */
export function isOfClass(element: Pick<Element, 'ifcClass' | 'ifcSuperClasses'>, ifcClass: string): boolean {
  return element.ifcClass === ifcClass || element.ifcSuperClasses.includes(ifcClass);
}
