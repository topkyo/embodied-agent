export const DEPLOYMENT_ID_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export function isValidDeploymentIdSegment(deployment_id: string): boolean {
  return DEPLOYMENT_ID_SEGMENT.test(deployment_id) && !deployment_id.includes("..");
}
