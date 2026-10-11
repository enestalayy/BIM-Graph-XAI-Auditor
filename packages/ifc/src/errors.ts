/** The input is not a readable IFC (STEP physical file) model. */
export class InvalidIfcError extends Error {
  override name = 'InvalidIfcError';
}
